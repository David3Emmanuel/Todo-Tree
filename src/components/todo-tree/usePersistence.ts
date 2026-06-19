import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'

import {
  fetchRemotePersistedState,
  loadPersistedState,
  type RemotePersistedState,
  saveRemotePersistedState,
  savePersistedState,
} from './persistence'
import {
  buildDiffedTree,
  computeDiffSummary,
  flattenNodes,
} from './treeDiff'
import type {
  Breadcrumb,
  PersistedState,
  SuggestionHideMap,
  TreeNode,
  ViewMode,
} from './types'

const REMOTE_SYNC_DEBOUNCE_MS = 1200

type LoginReconcileClassification =
  | 'local-empty_remote-nonempty'
  | 'remote-empty_local-nonempty'
  | 'local-clean_remote-diverged'
  | 'no-divergence'
  | 'divergence-conflict'

export type LoginReconcileConflict = {
  localState: PersistedState
  remoteState: PersistedState
}

export type LoginReconcileResolution =
  | 'keep-local'
  | 'keep-cloud'
  | { tree: TreeNode[]; suggestionHides: SuggestionHideMap }

function findNodeById(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node
    }

    const found = findNodeById(node.children, id)
    if (found) {
      return found
    }
  }

  return null
}

function pruneSuggestionHides(
  hides: SuggestionHideMap,
  tree: TreeNode[],
  now: number,
): SuggestionHideMap {
  const result: SuggestionHideMap = {}

  for (const [key, rule] of Object.entries(hides)) {
    const hasFutureDate =
      typeof rule.untilDateMs === 'number' && rule.untilDateMs > now
    const blockerId =
      typeof rule.untilTaskId === 'string' ? rule.untilTaskId.trim() : ''
    const blockerNode = blockerId ? findNodeById(tree, blockerId) : null
    const hasActiveTaskBlocker = Boolean(
      blockerId && blockerNode && !blockerNode.completed,
    )

    if (hasFutureDate || hasActiveTaskBlocker) {
      result[key] = {
        ...(hasFutureDate ? { untilDateMs: rule.untilDateMs } : {}),
        ...(hasActiveTaskBlocker ? { untilTaskId: blockerId } : {}),
      }
    }
  }

  return result
}

function hasAnyPersistedContent(state: PersistedState): boolean {
  return (
    state.tree.length > 0 ||
    state.zoom.length > 0 ||
    state.view === 'harvest' ||
    Object.keys(state.suggestionHides).length > 0
  )
}

function buildStateFingerprint(state: { tree: TreeNode[]; suggestionHides: SuggestionHideMap }): string {
  return JSON.stringify({
    tree: state.tree,
    suggestionHides: state.suggestionHides,
  })
}

function classifyLoginReconcileState(
  localState: PersistedState,
  remoteState: PersistedState,
): LoginReconcileClassification {
  const localHasContent = hasAnyPersistedContent(localState)
  const remoteHasContent = hasAnyPersistedContent(remoteState)

  if (!localHasContent && remoteHasContent) {
    return 'local-empty_remote-nonempty'
  }

  if (localHasContent && !remoteHasContent) {
    return 'remote-empty_local-nonempty'
  }

  const localFingerprint = buildStateFingerprint(localState)
  const remoteFingerprint = buildStateFingerprint(remoteState)

  if (localFingerprint === remoteFingerprint) {
    return 'no-divergence'
  }

  // If local still matches the last successful sync, prefer remote updates.
  if (
    localState.lastSyncedFingerprint &&
    localState.lastSyncedFingerprint === localFingerprint
  ) {
    return 'local-clean_remote-diverged'
  }

  return 'divergence-conflict'
}

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'

export type UsePersistenceResult = {
  isReady: boolean
  tree: TreeNode[]
  setTree: Dispatch<SetStateAction<TreeNode[]>>
  zoom: Breadcrumb[]
  setZoom: Dispatch<SetStateAction<Breadcrumb[]>>
  view: ViewMode
  setView: Dispatch<SetStateAction<ViewMode>>
  suggestionHides: SuggestionHideMap
  setSuggestionHides: Dispatch<SetStateAction<SuggestionHideMap>>
  activeSuggestionHides: SuggestionHideMap
  loginReconcileConflict: LoginReconcileConflict | null
  resolveLoginReconcileConflict: (
    resolution: LoginReconcileResolution,
  ) => Promise<void>
  suggestionTick: number
  setSuggestionTick: Dispatch<SetStateAction<number>>
  syncStatus: SyncStatus
  triggerManualSync: () => void
}

export function usePersistence(
  isAuthenticated: boolean,
  jwt: string | null,
): UsePersistenceResult {
  const [isReady, setIsReady] = useState(false)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [zoom, setZoom] = useState<Breadcrumb[]>([])
  const [view, setView] = useState<ViewMode>('tree')
  const [serverUpdatedAtMs, setServerUpdatedAtMs] = useState<
    number | undefined
  >(undefined)
  const [suggestionHides, setSuggestionHides] = useState<SuggestionHideMap>({})
  const [suggestionTick, setSuggestionTick] = useState(() => Date.now())
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const syncStatusResetRef = useRef<number | null>(null)
  const [isLoginReconciling, setIsLoginReconciling] = useState(false)
  const [hasPendingLoginRemoteSnapshot, setHasPendingLoginRemoteSnapshot] =
    useState(false)
  const [loginReconcileConflict, setLoginReconcileConflict] =
    useState<LoginReconcileConflict | null>(null)
  const lastSyncedFingerprintRef = useRef<string>('')
  const reconciledLoginKeyRef = useRef<string>('')
  const loginRemoteSnapshotRef = useRef<RemotePersistedState | null>(null)
  const loginLocalSnapshotRef = useRef<PersistedState | null>(null)
  const loginReconcileClassificationRef =
    useRef<LoginReconcileClassification | null>(null)
  const isSyncingRef = useRef(false)
  const hasPendingSyncRef = useRef(false)

  useEffect(() => {
    let isCancelled = false

    setIsReady(false)

    void (async () => {
      const persisted = await loadPersistedState()
      if (isCancelled) {
        return
      }

      setTree(persisted.tree)
      setZoom(persisted.zoom)
      setView(persisted.view)
      setSuggestionHides(persisted.suggestionHides ?? {})
      setServerUpdatedAtMs(persisted.serverUpdatedAtMs)
      setSuggestionTick(Date.now())
      lastSyncedFingerprintRef.current =
        persisted.lastSyncedFingerprint ??
        JSON.stringify({
          tree: persisted.tree,
          suggestionHides: persisted.suggestionHides,
        })
      setIsReady(true)
    })()

    return () => {
      isCancelled = true
    }
  }, [isAuthenticated, jwt])

  const activeSuggestionHides = useMemo(
    () => pruneSuggestionHides(suggestionHides, tree, suggestionTick),
    [suggestionHides, tree, suggestionTick],
  )

  const latestSyncStateRef = useRef({ tree, activeSuggestionHides })

  useEffect(() => {
    latestSyncStateRef.current = { tree, activeSuggestionHides }
  }, [tree, activeSuggestionHides])

  const performSync = useCallback(
    async (currentSyncState: {
      tree: TreeNode[]
      suggestionHides: SuggestionHideMap
    }) => {
      if (isSyncingRef.current) {
        hasPendingSyncRef.current = true
        return
      }

      isSyncingRef.current = true
      hasPendingSyncRef.current = false

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        isSyncingRef.current = false
        return
      }

      try {
        const remote = await fetchRemotePersistedState(jwt!)
        const currentFingerprint = JSON.stringify(currentSyncState)
        const localState: PersistedState = {
          ...currentSyncState,
          zoom,
          view,
          localUpdatedAtMs: Date.now(),
          lastSyncedFingerprint: lastSyncedFingerprintRef.current || undefined,
          serverUpdatedAtMs,
        }

        if (!remote) {
          const remoteSaveResult = await saveRemotePersistedState(
            jwt!,
            currentSyncState,
          )
          if (remoteSaveResult) {
            lastSyncedFingerprintRef.current = currentFingerprint
            setServerUpdatedAtMs(remoteSaveResult.serverUpdatedAtMs)
          }
          return
        }

        const classification = classifyLoginReconcileState(
          localState,
          remote.state,
        )

        if (
          classification === 'local-empty_remote-nonempty' ||
          classification === 'local-clean_remote-diverged'
        ) {
          const remoteFingerprint = buildStateFingerprint(remote.state)
          lastSyncedFingerprintRef.current = remoteFingerprint
          setTree(remote.state.tree)
          setSuggestionHides(remote.state.suggestionHides)
          setServerUpdatedAtMs(remote.serverUpdatedAtMs)

          await savePersistedState({
            ...remote.state,
            localUpdatedAtMs: Date.now(),
            lastSyncedFingerprint: remoteFingerprint,
            serverUpdatedAtMs: remote.serverUpdatedAtMs,
          })
          return
        }

        if (classification === 'remote-empty_local-nonempty') {
          const remoteSaveResult = await saveRemotePersistedState(
            jwt!,
            currentSyncState,
            serverUpdatedAtMs,
          )
          if (remoteSaveResult) {
            lastSyncedFingerprintRef.current = currentFingerprint
            setServerUpdatedAtMs(remoteSaveResult.serverUpdatedAtMs)
          }
          return
        }

        if (classification === 'no-divergence') {
          lastSyncedFingerprintRef.current = currentFingerprint
          if (remote.serverUpdatedAtMs > 0) {
            setServerUpdatedAtMs(remote.serverUpdatedAtMs)
          }
          return
        }

        const remoteChangedSinceLastSync =
          remote.serverUpdatedAtMs &&
          serverUpdatedAtMs &&
          remote.serverUpdatedAtMs > serverUpdatedAtMs

        if (!remoteChangedSinceLastSync) {
          const remoteSaveResult = await saveRemotePersistedState(
            jwt!,
            currentSyncState,
            serverUpdatedAtMs,
          )
          if (remoteSaveResult) {
            lastSyncedFingerprintRef.current = currentFingerprint
            setServerUpdatedAtMs(remoteSaveResult.serverUpdatedAtMs)
          }
          return
        }

        setLoginReconcileConflict({
          localState,
          remoteState: remote.state,
        })
      } catch (err) {
        if (err instanceof Error && err.message === 'Conflict') {
          try {
            const remote = await fetchRemotePersistedState(jwt!)
            if (remote) {
              setLoginReconcileConflict({
                localState: {
                  ...currentSyncState,
                  zoom,
                  view,
                  localUpdatedAtMs: Date.now(),
                  lastSyncedFingerprint:
                    lastSyncedFingerprintRef.current || undefined,
                  serverUpdatedAtMs,
                },
                remoteState: remote.state,
              })
            }
          } catch {
            // Ignore
          }
        }
        throw err
      } finally {
        isSyncingRef.current = false
        if (hasPendingSyncRef.current) {
          const nextSyncState = {
            tree: latestSyncStateRef.current.tree,
            suggestionHides: latestSyncStateRef.current.activeSuggestionHides,
          }
          void performSync(nextSyncState)
        }
      }
    },
    [
      jwt,
      zoom,
      view,
      serverUpdatedAtMs,
      setTree,
      setSuggestionHides,
      setServerUpdatedAtMs,
      setLoginReconcileConflict,
    ],
  )

  const triggerManualSync = useCallback(() => {
    if (!isAuthenticated || !jwt || syncStatus === 'syncing') return

    setSyncStatus('syncing')
    if (syncStatusResetRef.current !== null) {
      window.clearTimeout(syncStatusResetRef.current)
    }

    const syncState = { tree, suggestionHides: activeSuggestionHides }

    void (async () => {
      try {
        await performSync(syncState)
        setSyncStatus('success')
      } catch {
        setSyncStatus('error')
      } finally {
        syncStatusResetRef.current = window.setTimeout(
          () => setSyncStatus('idle'),
          2500,
        )
      }
    })()
  }, [isAuthenticated, jwt, syncStatus, tree, activeSuggestionHides, performSync])

  useEffect(() => {
    if (!isAuthenticated || !isReady || !jwt) {
      if (!isAuthenticated) {
        reconciledLoginKeyRef.current = ''
        loginRemoteSnapshotRef.current = null
        loginLocalSnapshotRef.current = null
        loginReconcileClassificationRef.current = null
        setHasPendingLoginRemoteSnapshot(false)
        setLoginReconcileConflict(null)
        setIsLoginReconciling(false)
      }
      return
    }

    if (reconciledLoginKeyRef.current === jwt) {
      return
    }

    let isCancelled = false
    setIsLoginReconciling(true)

    void (async () => {
      try {
        const localState: PersistedState = {
          tree,
          zoom,
          view,
          suggestionHides: activeSuggestionHides,
          localUpdatedAtMs: Date.now(),
          lastSyncedFingerprint: lastSyncedFingerprintRef.current || undefined,
          serverUpdatedAtMs,
        }
        loginLocalSnapshotRef.current = localState

        const remote = await fetchRemotePersistedState(jwt)
        if (isCancelled) {
          return
        }

        if (!remote) {
          loginRemoteSnapshotRef.current = null
          loginReconcileClassificationRef.current = null
          setHasPendingLoginRemoteSnapshot(false)
          setLoginReconcileConflict(null)
          return
        }

        loginRemoteSnapshotRef.current = remote
        loginReconcileClassificationRef.current = classifyLoginReconcileState(
          localState,
          remote.state,
        )
        setHasPendingLoginRemoteSnapshot(true)
      } catch {
        // Reconciliation fetch failures should not block local usage.
      } finally {
        if (isCancelled) {
          return
        }

        reconciledLoginKeyRef.current = jwt
        setIsLoginReconciling(false)
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [
    isAuthenticated,
    isReady,
    jwt,
    tree,
    zoom,
    view,
    activeSuggestionHides,
    serverUpdatedAtMs,
  ])

  useEffect(() => {
    if (
      !isAuthenticated ||
      !isReady ||
      !jwt ||
      !hasPendingLoginRemoteSnapshot
    ) {
      return
    }

    const remote = loginRemoteSnapshotRef.current
    const local = loginLocalSnapshotRef.current
    const classification = loginReconcileClassificationRef.current

    if (!remote || !local || !classification) {
      setHasPendingLoginRemoteSnapshot(false)
      return
    }

    let isCancelled = false

    void (async () => {
      try {
        if (
          classification === 'local-empty_remote-nonempty' ||
          classification === 'local-clean_remote-diverged'
        ) {
          const remoteFingerprint = buildStateFingerprint(remote.state)
          lastSyncedFingerprintRef.current = remoteFingerprint

          setTree(remote.state.tree)
          setZoom(remote.state.zoom)
          setView(remote.state.view)
          setSuggestionHides(remote.state.suggestionHides)
          setServerUpdatedAtMs(remote.state.serverUpdatedAtMs)
          setSuggestionTick(Date.now())

          await savePersistedState({
            ...remote.state,
            localUpdatedAtMs: Date.now(),
            lastSyncedFingerprint: remoteFingerprint,
            serverUpdatedAtMs: remote.state.serverUpdatedAtMs,
          })

          if (!isCancelled) {
            setLoginReconcileConflict(null)
          }
          return
        }

        if (classification === 'remote-empty_local-nonempty') {
          const localSyncState = {
            tree: local.tree,
            suggestionHides: local.suggestionHides,
          }

          const localFingerprint = buildStateFingerprint(localSyncState)
          const remoteSaveResult = await saveRemotePersistedState(
            jwt,
            localSyncState,
          )

          if (isCancelled) {
            return
          }

          if (remoteSaveResult?.serverUpdatedAtMs) {
            setServerUpdatedAtMs(remoteSaveResult.serverUpdatedAtMs)
          }

          lastSyncedFingerprintRef.current = localFingerprint
          await savePersistedState({
            ...local,
            localUpdatedAtMs: Date.now(),
            lastSyncedFingerprint: localFingerprint,
            serverUpdatedAtMs:
              remoteSaveResult?.serverUpdatedAtMs || local.serverUpdatedAtMs,
          })

          setLoginReconcileConflict(null)
          return
        }

        if (classification === 'no-divergence') {
          const localFingerprint = buildStateFingerprint(local)
          lastSyncedFingerprintRef.current = localFingerprint

          await savePersistedState({
            ...local,
            localUpdatedAtMs: Date.now(),
            lastSyncedFingerprint: localFingerprint,
            serverUpdatedAtMs:
              remote.serverUpdatedAtMs || local.serverUpdatedAtMs,
          })

          if (!isCancelled && remote.serverUpdatedAtMs > 0) {
            setServerUpdatedAtMs(remote.serverUpdatedAtMs)
          }
          if (!isCancelled) {
            setLoginReconcileConflict(null)
          }
          return
        }

        const localFlat = flattenNodes(local.tree)
        const remoteFlat = flattenNodes(remote.state.tree)
        const localDiffed = buildDiffedTree(local.tree, remoteFlat)
        const remoteDiffed = buildDiffedTree(remote.state.tree, localFlat)
        const localSummary = computeDiffSummary(localDiffed, remoteFlat, local.tree)
        const remoteSummary = computeDiffSummary(remoteDiffed, localFlat, remote.state.tree)

        const bothEmpty =
          localSummary.added === 0 &&
          localSummary.modified === 0 &&
          localSummary.removed === 0 &&
          remoteSummary.added === 0 &&
          remoteSummary.modified === 0 &&
          remoteSummary.removed === 0

        if (bothEmpty) {
          const localFingerprint = buildStateFingerprint(local)
          lastSyncedFingerprintRef.current = localFingerprint
          await savePersistedState({
            ...local,
            localUpdatedAtMs: Date.now(),
            lastSyncedFingerprint: localFingerprint,
            serverUpdatedAtMs:
              remote.serverUpdatedAtMs || local.serverUpdatedAtMs,
          })
          if (!isCancelled) {
            setLoginReconcileConflict(null)
          }
          return
        }

        if (!isCancelled) {
          setLoginReconcileConflict({
            localState: local,
            remoteState: remote.state,
          })
        }
      } catch {
        // Keep local editability intact if reconcile decision application fails.
      } finally {
        if (isCancelled) {
          return
        }

        loginRemoteSnapshotRef.current = null
        loginLocalSnapshotRef.current = null
        loginReconcileClassificationRef.current = null
        setHasPendingLoginRemoteSnapshot(false)
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [isAuthenticated, isReady, jwt, hasPendingLoginRemoteSnapshot])

  const resolveLoginReconcileConflict = useCallback(
    async (resolution: LoginReconcileResolution): Promise<void> => {
      if (!loginReconcileConflict) {
        return
      }

      if (typeof resolution === 'object') {
        const mergedSyncState = resolution
        const mergedFingerprint = buildStateFingerprint(mergedSyncState)
        const remoteSaveResult =
          isAuthenticated && jwt
            ? await saveRemotePersistedState(
                jwt,
                mergedSyncState,
                loginReconcileConflict.remoteState.serverUpdatedAtMs,
              )
            : null

        if (remoteSaveResult?.serverUpdatedAtMs) {
          setServerUpdatedAtMs(remoteSaveResult.serverUpdatedAtMs)
        }

        lastSyncedFingerprintRef.current = mergedFingerprint
        setTree(mergedSyncState.tree)
        setSuggestionHides(mergedSyncState.suggestionHides)
        setSuggestionTick(Date.now())

        await savePersistedState({
          ...loginReconcileConflict.localState,
          tree: mergedSyncState.tree,
          suggestionHides: mergedSyncState.suggestionHides,
          localUpdatedAtMs: Date.now(),
          lastSyncedFingerprint: mergedFingerprint,
          serverUpdatedAtMs:
            remoteSaveResult?.serverUpdatedAtMs || serverUpdatedAtMs,
        })
        setLoginReconcileConflict(null)
        return
      }

      if (resolution === 'keep-local') {
        const localSyncState = {
          tree,
          suggestionHides: activeSuggestionHides,
        }

        const localFingerprint = buildStateFingerprint(localSyncState)
        const remoteSaveResult =
          isAuthenticated && jwt
            ? await saveRemotePersistedState(
                jwt,
                localSyncState,
                loginReconcileConflict.remoteState.serverUpdatedAtMs,
              )
            : null

        if (remoteSaveResult?.serverUpdatedAtMs) {
          setServerUpdatedAtMs(remoteSaveResult.serverUpdatedAtMs)
        }

        lastSyncedFingerprintRef.current = localFingerprint
        await savePersistedState({
          ...localSyncState,
          localUpdatedAtMs: Date.now(),
          lastSyncedFingerprint: localFingerprint,
          serverUpdatedAtMs:
            remoteSaveResult?.serverUpdatedAtMs || serverUpdatedAtMs,
        })
        setLoginReconcileConflict(null)
        return
      }

      const remoteState = loginReconcileConflict.remoteState
      const remoteFingerprint = buildStateFingerprint(remoteState)
      lastSyncedFingerprintRef.current = remoteFingerprint

      setTree(remoteState.tree)
      setZoom(remoteState.zoom)
      setView(remoteState.view)
      setSuggestionHides(remoteState.suggestionHides)
      setServerUpdatedAtMs(remoteState.serverUpdatedAtMs)
      setSuggestionTick(Date.now())

      await savePersistedState({
        ...remoteState,
        localUpdatedAtMs: Date.now(),
        lastSyncedFingerprint: remoteFingerprint,
        serverUpdatedAtMs: remoteState.serverUpdatedAtMs,
      })
      setLoginReconcileConflict(null)
    },
    [
      activeSuggestionHides,
      isAuthenticated,
      jwt,
      loginReconcileConflict,
      serverUpdatedAtMs,
      tree,
      view,
      zoom,
    ],
  )

  useEffect(() => {
    if (!isReady) {
      return
    }

    void savePersistedState({
      tree,
      zoom,
      view,
      suggestionHides: activeSuggestionHides,
      localUpdatedAtMs: Date.now(),
      lastSyncedFingerprint: lastSyncedFingerprintRef.current || undefined,
      serverUpdatedAtMs,
    }).catch(() => {
      // Offline-first behavior should not block editing on persistence errors.
    })
  }, [isReady, tree, zoom, view, activeSuggestionHides, serverUpdatedAtMs])

  useEffect(() => {
    if (
      !isAuthenticated ||
      !isReady ||
      !jwt ||
      isLoginReconciling ||
      hasPendingLoginRemoteSnapshot ||
      Boolean(loginReconcileConflict)
    ) {
      return
    }

    const fingerprint = JSON.stringify({
      tree,
      suggestionHides: activeSuggestionHides,
    })
    if (fingerprint === lastSyncedFingerprintRef.current) {
      return
    }

    const performSyncWrapper = () => {
      const currentSyncState = {
        tree: latestSyncStateRef.current.tree,
        suggestionHides: latestSyncStateRef.current.activeSuggestionHides,
      }
      void performSync(currentSyncState).catch(() => {
        // Silently ignore background sync failures
      })
    }

    const timeoutId = window.setTimeout(performSyncWrapper, REMOTE_SYNC_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [
    isAuthenticated,
    isReady,
    jwt,
    tree,
    activeSuggestionHides,
    isLoginReconciling,
    hasPendingLoginRemoteSnapshot,
    loginReconcileConflict,
    performSync,
  ])

  useEffect(() => {
    if (!isAuthenticated || !jwt || !isReady) return

    const handleOnline = () => {
      const currentSyncState = {
        tree,
        suggestionHides: activeSuggestionHides,
      }
      const currentFingerprint = JSON.stringify(currentSyncState)
      if (currentFingerprint !== lastSyncedFingerprintRef.current) {
        triggerManualSync()
      }
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [isAuthenticated, jwt, isReady, tree, activeSuggestionHides, triggerManualSync])

  useEffect(() => {
    const activeExpiryTimes = Object.values(activeSuggestionHides)
      .map((rule) => rule.untilDateMs)
      .filter(
        (untilDateMs): untilDateMs is number => typeof untilDateMs === 'number',
      )
    if (!activeExpiryTimes.length) {
      return
    }

    const nextExpiry = Math.min(...activeExpiryTimes)
    const delay = Math.max(25, nextExpiry - Date.now() + 25)
    const timeoutId = window.setTimeout(() => {
      setSuggestionTick(Date.now())
    }, delay)

    return () => window.clearTimeout(timeoutId)
  }, [activeSuggestionHides])



  return {
    isReady,
    tree,
    setTree,
    zoom,
    setZoom,
    view,
    setView,
    suggestionHides,
    setSuggestionHides,
    activeSuggestionHides,
    loginReconcileConflict,
    resolveLoginReconcileConflict,
    suggestionTick,
    setSuggestionTick,
    syncStatus,
    triggerManualSync,
  }
}
