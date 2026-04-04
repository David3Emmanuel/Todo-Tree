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
  const lastSyncedFingerprintRef = useRef<string>('')

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
      lastSyncedFingerprintRef.current = JSON.stringify({
        tree: persisted.tree,
        zoom: persisted.zoom,
        view: persisted.view,
        suggestionHides: persisted.suggestionHides,
      })
      setIsReady(true)

      if (!isAuthenticated || !jwt) {
        return
      }

      try {
        const remote = await fetchRemotePersistedState(jwt)
        if (!remote || isCancelled) {
          return
        }

        const localServerUpdatedAtMs = persisted.serverUpdatedAtMs ?? 0
        const localHasContent = hasAnyPersistedContent(persisted)
        const shouldApplyRemote =
          localServerUpdatedAtMs > 0
            ? remote.serverUpdatedAtMs > localServerUpdatedAtMs
            : !localHasContent

        if (!shouldApplyRemote) {
          return
        }

        setTree(remote.state.tree)
        setZoom(remote.state.zoom)
        setView(remote.state.view)
        setSuggestionHides(remote.state.suggestionHides)
        setServerUpdatedAtMs(remote.state.serverUpdatedAtMs)
        setSuggestionTick(Date.now())
        lastSyncedFingerprintRef.current = JSON.stringify({
          tree: remote.state.tree,
          zoom: remote.state.zoom,
          view: remote.state.view,
          suggestionHides: remote.state.suggestionHides,
        })

        await savePersistedState(remote.state)
      } catch {
        // Continue using local IndexedDB state if remote refresh fails.
      }
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
    if (!isReady) {
      return
    }

    void savePersistedState({
      tree,
      zoom,
      view,
      suggestionHides: activeSuggestionHides,
      serverUpdatedAtMs,
    }).catch(() => {
      // Offline-first behavior should not block editing on persistence errors.
    })
  }, [isReady, tree, zoom, view, activeSuggestionHides, serverUpdatedAtMs])

  useEffect(() => {
    if (!isAuthenticated || !isReady || !jwt) {
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
  }, [isAuthenticated, isReady, jwt, tree, zoom, view, activeSuggestionHides])

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
