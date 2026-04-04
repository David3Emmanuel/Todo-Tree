import {
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
import type {
  Breadcrumb,
  PersistedState,
  SuggestionHideMap,
  TreeNode,
  ViewMode,
} from './types'

const REMOTE_SYNC_DEBOUNCE_MS = 1200

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
  suggestionTick: number
  setSuggestionTick: Dispatch<SetStateAction<number>>
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
  const [isLoginReconciling, setIsLoginReconciling] = useState(false)
  const [hasPendingLoginRemoteSnapshot, setHasPendingLoginRemoteSnapshot] =
    useState(false)
  const lastSyncedFingerprintRef = useRef<string>('')
  const previousIsAuthenticatedRef = useRef<boolean>(isAuthenticated)
  const reconciledLoginKeyRef = useRef<string>('')
  const loginRemoteSnapshotRef = useRef<RemotePersistedState | null>(null)
  const loginLocalSnapshotRef = useRef<PersistedState | null>(null)

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
          zoom: persisted.zoom,
          view: persisted.view,
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

  useEffect(() => {
    const didLoginTransition =
      !previousIsAuthenticatedRef.current && isAuthenticated
    previousIsAuthenticatedRef.current = isAuthenticated

    if (!isAuthenticated || !isReady || !jwt) {
      if (!isAuthenticated) {
        reconciledLoginKeyRef.current = ''
        loginRemoteSnapshotRef.current = null
        loginLocalSnapshotRef.current = null
        setHasPendingLoginRemoteSnapshot(false)
        setIsLoginReconciling(false)
      }
      return
    }

    if (!didLoginTransition || reconciledLoginKeyRef.current === jwt) {
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

        loginRemoteSnapshotRef.current = remote
        setHasPendingLoginRemoteSnapshot(Boolean(remote))
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
      hasPendingLoginRemoteSnapshot
    ) {
      return
    }

    const syncState = {
      tree,
      zoom,
      view,
      suggestionHides: activeSuggestionHides,
    }
    const fingerprint = JSON.stringify(syncState)
    if (fingerprint === lastSyncedFingerprintRef.current) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          return
        }
        try {
          const remote = await saveRemotePersistedState(jwt, syncState)
          if (!remote) {
            return
          }

          lastSyncedFingerprintRef.current = fingerprint
          if (remote.serverUpdatedAtMs > 0) {
            setServerUpdatedAtMs(remote.serverUpdatedAtMs)
          }
        } catch {
          // Keep working locally; sync retries on next state change.
        }
      })()
    }, REMOTE_SYNC_DEBOUNCE_MS)

    return () => window.clearTimeout(timeoutId)
  }, [
    isAuthenticated,
    isReady,
    jwt,
    tree,
    zoom,
    view,
    activeSuggestionHides,
    isLoginReconciling,
    hasPendingLoginRemoteSnapshot,
  ])

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
    suggestionTick,
    setSuggestionTick,
  }
}
