import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  EyeOff,
  FolderTree,
  LogIn,
  LogOut,
  Plus,
  Undo2,
  Wheat,
  X,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from '@tanstack/react-router'
import {
  readParsedFromStorage,
  removeStorageItem,
  writeJsonToStorage,
} from '../../utils/storage'
import { useAuth } from '../auth/auth-context'
import { BrandHeader } from '../layout/BrandHeader'
import { LoadingScreen } from '../layout/LoadingScreen'
import { HarvestFocusModal } from './HarvestFocusModal'
import { HarvestView } from './HarvestView'
import { FocusNode } from './FocusNode'
import { HideUntilTaskPicker } from './HideUntilTaskPicker'
import { TreeSearchDropdown } from './TreeSearchDropdown'
import { TodoCtx } from './todo-context'
import { TodoNode } from './TodoNode'
import { useFocus } from './useFocus'
import { usePersistence } from './usePersistence'
import { useZoomSync } from './useZoomSync'
import type {
  Breadcrumb,
  CtxValue,
  SuggestionHideRule,
  TreeNode,
} from './types'
import {
  collapseAll,
  expandAll,
  findNode,
  getHarvestSections,
  getNextActionSuggestions,
  makeNode,
  upd,
} from './tree-utils'

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateInputToMs(value: string): number | null {
  if (!value) {
    return null
  }

  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.getTime()
}

const SUGGESTION_HIDE_UNDO_MS = 3_000
const GUEST_REMINDER_EDIT_INTERVAL = 10
const GUEST_REMINDER_TIME_INTERVAL_MS = 3 * 60 * 1000
const GUEST_REMINDER_STORAGE_KEY = 'todo-tree-guest-reminder'

function readGuestReminderDismissedAtMs(): number | null {
  return readParsedFromStorage(
    GUEST_REMINDER_STORAGE_KEY,
    (value) => {
      if (!value || typeof value !== 'object') {
        return null
      }

      const dismissedAtMs = Number(
        (value as { dismissedAtMs?: unknown }).dismissedAtMs,
      )

      return Number.isFinite(dismissedAtMs) && dismissedAtMs > 0
        ? dismissedAtMs
        : null
    },
    null,
  )
}

function isSuggestionHidden(
  rule: SuggestionHideRule | undefined,
  tree: TreeNode[],
  now: number,
): boolean {
  if (!rule) {
    return false
  }

  const hiddenByDate =
    typeof rule.untilDateMs === 'number' && rule.untilDateMs > now

  const blockerId =
    typeof rule.untilTaskId === 'string' ? rule.untilTaskId.trim() : ''
  const blockerNode = blockerId ? findNode(tree, blockerId) : null
  const hiddenByTask = Boolean(blockerNode && !blockerNode.completed)

  return hiddenByDate || hiddenByTask
}

export function TodoTreePage({ pathSegments }: { pathSegments: string[] }) {
  const { logout, jwt, isAuthenticated, isHydrating } = useAuth()
  const {
    isReady,
    tree,
    setTree,
    zoom,
    setZoom,
    view,
    setView,
    setSuggestionHides,
    activeSuggestionHides,
    loginReconcileConflict,
    resolveLoginReconcileConflict,
    suggestionTick,
  } = usePersistence(isAuthenticated, jwt)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [hideMenuId, setHideMenuId] = useState<string | null>(null)
  const [hideUntilDate, setHideUntilDate] = useState('')
  const [hideMenuPosition, setHideMenuPosition] =
    useState<CSSProperties | null>(null)
  const [pendingSuggestionHides, setPendingSuggestionHides] = useState<
    Record<string, number>
  >({})
  const [isGuestReminderDismissed, setIsGuestReminderDismissed] =
    useState(false)
  const [isConflictModalDismissed, setIsConflictModalDismissed] =
    useState(false)
  const [isResolvingConflict, setIsResolvingConflict] = useState(false)
  const [conflictResolutionError, setConflictResolutionError] = useState<
    string | null
  >(null)
  const pendingEditingIdRef = useRef<string | null>(null)
  const pendingSuggestionHideTimersRef = useRef<Record<string, number>>({})
  const suggestionSeedRef = useRef(Math.random().toString(36).slice(2))
  const guestReminderDismissedAtRef = useRef<number | null>(null)
  const guestReminderEditCountRef = useRef(0)
  const guestReminderLastFingerprintRef = useRef<string>('')
  const { focusRoot, openFocus, closeFocus } = useFocus({ tree })

  const navigate = useNavigate()
  const location = useLocation()
  const { setZoomFromUi } = useZoomSync({
    isAuthenticated,
    isReady,
    tree,
    zoom,
    setZoom,
    pathSegments,
    locationPathname: location.pathname,
    navigate,
  })

  useEffect(() => {
    if (!pendingEditingIdRef.current) {
      return
    }

    const nextEditingId = pendingEditingIdRef.current
    pendingEditingIdRef.current = null
    setEditingId(nextEditingId)
  }, [tree])

  useEffect(() => {
    if (!loginReconcileConflict) {
      setIsConflictModalDismissed(false)
      setIsResolvingConflict(false)
      setConflictResolutionError(null)
      return
    }

    setIsConflictModalDismissed(false)
    setConflictResolutionError(null)
  }, [loginReconcileConflict])

  useLayoutEffect(() => {
    const updateMenuPosition = (): void => {
      if (!hideMenuId) {
        setHideMenuPosition(null)
        return
      }

      const card = document.querySelector(
        `article[data-suggestion-id="${hideMenuId}"]`,
      ) as HTMLElement | null
      if (!card) {
        setHideMenuPosition(null)
        return
      }

      const button = card.querySelector(
        '.suggestion-hide-btn',
      ) as HTMLElement | null
      if (!button) {
        setHideMenuPosition(null)
        return
      }

      const rect = button.getBoundingClientRect()
      const cardRect = card.getBoundingClientRect()
      const menuWidth = cardRect.width
      const idealLeft = rect.left + rect.width / 2 - menuWidth / 2
      const menuLeft = Math.max(
        8,
        Math.min(idealLeft, window.innerWidth - menuWidth - 8),
      )

      setHideMenuPosition({
        position: 'fixed',
        left: `${menuLeft}px`,
        top: `${rect.bottom + 6}px`,
        width: `${menuWidth}px`,
        zIndex: 99999,
      })
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)

    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [hideMenuId])

  useEffect(() => {
    if (!hideMenuId) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeHideMenu()
      }
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const card = document.querySelector(
        `article[data-suggestion-id="${hideMenuId}"]`,
      )
      const menu = document.querySelector('.suggestion-hide-menu[style]')
      const pickerPortal = document.querySelector(
        '[data-suggestion-picker-portal="true"]',
      )

      // Close if clicking outside both the card and the floating menu
      if (
        card &&
        menu &&
        !card.contains(target) &&
        !menu.contains(target) &&
        !pickerPortal?.contains(target)
      ) {
        closeHideMenu()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onClick, true)
    }
  }, [hideMenuId])

  useEffect(() => {
    if (isAuthenticated) {
      return
    }

    for (const timeoutId of Object.values(
      pendingSuggestionHideTimersRef.current,
    )) {
      window.clearTimeout(timeoutId)
    }

    pendingSuggestionHideTimersRef.current = {}
    setPendingSuggestionHides({})
  }, [isAuthenticated])

  useEffect(
    () => () => {
      for (const timeoutId of Object.values(
        pendingSuggestionHideTimersRef.current,
      )) {
        window.clearTimeout(timeoutId)
      }

      pendingSuggestionHideTimersRef.current = {}
    },
    [],
  )

  const suggestions = useMemo(() => {
    const now = suggestionTick
    const zoomedNode = zoom.length
      ? findNode(tree, zoom[zoom.length - 1].id)
      : null
    const effectiveNodes = zoomedNode ? zoomedNode.children : tree
    return getNextActionSuggestions(effectiveNodes, suggestionSeedRef.current, 24)
      .filter(
        (item) =>
          !isSuggestionHidden(activeSuggestionHides[item.node.id], tree, now),
      )
      .slice(0, 3)
  }, [activeSuggestionHides, suggestionTick, tree, zoom])

  useEffect(() => {
    if (!isReady) {
      return
    }

    const fingerprint = JSON.stringify({
      tree,
      zoom,
      view,
      suggestionHides: activeSuggestionHides,
    })

    if (!guestReminderLastFingerprintRef.current) {
      guestReminderLastFingerprintRef.current = fingerprint
      return
    }

    if (fingerprint === guestReminderLastFingerprintRef.current) {
      return
    }

    guestReminderLastFingerprintRef.current = fingerprint

    if (isAuthenticated) {
      return
    }

    guestReminderEditCountRef.current += 1

    if (!isGuestReminderDismissed) {
      return
    }

    const dismissedAt = guestReminderDismissedAtRef.current ?? Date.now()
    const reachedEditLimit =
      guestReminderEditCountRef.current >= GUEST_REMINDER_EDIT_INTERVAL
    const reachedTimeLimit =
      Date.now() - dismissedAt >= GUEST_REMINDER_TIME_INTERVAL_MS

    if (!reachedEditLimit && !reachedTimeLimit) {
      return
    }

    guestReminderEditCountRef.current = 0
    guestReminderDismissedAtRef.current = null
    removeStorageItem(GUEST_REMINDER_STORAGE_KEY)
    setIsGuestReminderDismissed(false)
  }, [
    isAuthenticated,
    isGuestReminderDismissed,
    isReady,
    tree,
    zoom,
    view,
    activeSuggestionHides,
  ])

  useEffect(() => {
    if (isAuthenticated || !isGuestReminderDismissed) {
      return
    }

    const dismissedAt = guestReminderDismissedAtRef.current ?? Date.now()
    guestReminderDismissedAtRef.current = dismissedAt
    const elapsedMs = Date.now() - dismissedAt
    const remainingMs = Math.max(0, GUEST_REMINDER_TIME_INTERVAL_MS - elapsedMs)

    const timeoutId = window.setTimeout(() => {
      guestReminderEditCountRef.current = 0
      guestReminderDismissedAtRef.current = null
      removeStorageItem(GUEST_REMINDER_STORAGE_KEY)
      setIsGuestReminderDismissed(false)
    }, remainingMs)

    return () => window.clearTimeout(timeoutId)
  }, [isAuthenticated, isGuestReminderDismissed])

  useEffect(() => {
    if (isAuthenticated) {
      guestReminderEditCountRef.current = 0
      guestReminderDismissedAtRef.current = null
      removeStorageItem(GUEST_REMINDER_STORAGE_KEY)
      setIsGuestReminderDismissed(false)
      return
    }

    const storedDismissedAtMs = readGuestReminderDismissedAtMs()
    if (!storedDismissedAtMs) {
      guestReminderDismissedAtRef.current = null
      setIsGuestReminderDismissed(false)
      return
    }

    if (Date.now() - storedDismissedAtMs >= GUEST_REMINDER_TIME_INTERVAL_MS) {
      guestReminderDismissedAtRef.current = null
      removeStorageItem(GUEST_REMINDER_STORAGE_KEY)
      setIsGuestReminderDismissed(false)
      return
    }

    guestReminderDismissedAtRef.current = storedDismissedAtMs
    guestReminderEditCountRef.current = 0
    setIsGuestReminderDismissed(true)
  }, [isAuthenticated])

  const showGuestReminder = !isAuthenticated && !isGuestReminderDismissed
  const showLoginConflictModal =
    Boolean(loginReconcileConflict) && !isConflictModalDismissed

  if (isHydrating) {
    return <LoadingScreen message="Loading your tree..." />
  }

  if (!isReady) {
    return <LoadingScreen message="Loading your tree..." />
  }

  const zoomedNode = zoom.length
    ? findNode(tree, zoom[zoom.length - 1].id)
    : null
  const displayNodes = zoomedNode ? zoomedNode.children : tree
  const harvestSections = getHarvestSections(tree)
  const harvestCounts = {
    starred: harvestSections.find((s) => s.priority === 'starred')?.items.length ?? 0,
    today: harvestSections.find((s) => s.priority === 'today')?.items.length ?? 0,
    soon: harvestSections.find((s) => s.priority === 'soon')?.items.length ?? 0,
  }

  const findBreadcrumbPath = (
    nodes: TreeNode[],
    targetId: string,
    path: Breadcrumb[] = [],
  ): Breadcrumb[] | null => {
    for (const candidate of nodes) {
      const nextPath = [...path, { id: candidate.id, text: candidate.text }]
      if (candidate.id === targetId) {
        return nextPath
      }

      const found = findBreadcrumbPath(candidate.children, targetId, nextPath)
      if (found) {
        return found
      }
    }

    return null
  }

  const addRoot = () => {
    setTree((prev) => {
      const node = makeNode(prev)
      pendingEditingIdRef.current = node.id

      if (zoomedNode) {
        return upd(prev, zoomedNode.id, (target) => {
          target.children.push(node)
          target.collapsed = false
        })
      }

      return [...prev, node]
    })
  }

  const focusSuggestion = (path: Breadcrumb[], nodeId: string) => {
    void path
    setHideMenuId(null)
    openFocus(nodeId)
  }

  const closeFocusAndZoomToRoot = () => {
    if (!focusRoot) {
      closeFocus()
      return
    }

    const nextZoom = findBreadcrumbPath(tree, focusRoot.id)
    if (nextZoom) {
      setZoomFromUi(nextZoom)
    }

    closeFocus()
  }

  const clearPendingSuggestionHide = (nodeId: string) => {
    const timeoutId = pendingSuggestionHideTimersRef.current[nodeId]
    if (typeof timeoutId === 'number') {
      window.clearTimeout(timeoutId)
    }

    delete pendingSuggestionHideTimersRef.current[nodeId]
    setPendingSuggestionHides((prev) => {
      if (!prev[nodeId]) {
        return prev
      }

      const next = { ...prev }
      delete next[nodeId]
      return next
    })
  }

  const commitSuggestionHide = (nodeId: string, until: number) => {
    delete pendingSuggestionHideTimersRef.current[nodeId]
    setPendingSuggestionHides((prev) => {
      if (!prev[nodeId]) {
        return prev
      }

      const next = { ...prev }
      delete next[nodeId]
      return next
    })

    setSuggestionHides((prev) => ({
      ...prev,
      [nodeId]: {
        ...prev[nodeId],
        untilDateMs: until,
      },
    }))
  }

  const queueSuggestionHide = (nodeId: string, until: number) => {
    clearPendingSuggestionHide(nodeId)

    setPendingSuggestionHides((prev) => ({
      ...prev,
      [nodeId]: Date.now() + SUGGESTION_HIDE_UNDO_MS,
    }))

    const timeoutId = window.setTimeout(() => {
      commitSuggestionHide(nodeId, until)
    }, SUGGESTION_HIDE_UNDO_MS)

    pendingSuggestionHideTimersRef.current[nodeId] = timeoutId
    setHideMenuId(null)
  }

  const undoSuggestionHide = (nodeId: string) => {
    clearPendingSuggestionHide(nodeId)
  }

  const hideSuggestion = (nodeId: string, until: number) => {
    queueSuggestionHide(nodeId, until)
  }

  const hideSuggestionForDuration = (nodeId: string, durationMs: number) => {
    hideSuggestion(nodeId, Date.now() + durationMs)
  }

  const hideSuggestionUntilDate = (nodeId: string) => {
    const until = dateInputToMs(hideUntilDate)
    if (!until) {
      return
    }

    hideSuggestion(nodeId, until)
  }

  const hideSuggestionUntilTask = (nodeId: string, taskId: string) => {
    if (!taskId) {
      return
    }

    clearPendingSuggestionHide(nodeId)
    setPendingSuggestionHides((prev) => ({
      ...prev,
      [nodeId]: Date.now() + SUGGESTION_HIDE_UNDO_MS,
    }))

    const timeoutId = window.setTimeout(() => {
      delete pendingSuggestionHideTimersRef.current[nodeId]
      setPendingSuggestionHides((prev) => {
        if (!prev[nodeId]) {
          return prev
        }

        const next = { ...prev }
        delete next[nodeId]
        return next
      })

      setSuggestionHides((prev) => ({
        ...prev,
        [nodeId]: {
          ...prev[nodeId],
          untilTaskId: taskId,
        },
      }))
    }, SUGGESTION_HIDE_UNDO_MS)

    pendingSuggestionHideTimersRef.current[nodeId] = timeoutId
    setHideMenuId(null)
  }

  const openHideMenu = (nodeId: string) => {
    setHideMenuId(nodeId)
    setHideUntilDate(formatDateInputValue(new Date(Date.now() + 86400000)))
  }

  const closeHideMenu = () => {
    setHideMenuId(null)
  }

  const handleResolveConflict = async (
    resolution: 'keep-local' | 'keep-cloud',
  ) => {
    setConflictResolutionError(null)
    setIsResolvingConflict(true)

    try {
      await resolveLoginReconcileConflict(resolution)
      setIsConflictModalDismissed(false)
    } catch {
      setConflictResolutionError('Could not apply your choice. Please retry.')
    } finally {
      setIsResolvingConflict(false)
    }
  }

  const ctx: CtxValue = {
    tree,
    setTree,
    editingId,
    setEditingId,
    zoom,
    setZoom: setZoomFromUi,
  }

  return (
    <TodoCtx.Provider value={ctx}>
      <div className="app">
        <header className="header">
          <div className="header-top">
            <BrandHeader />
            <div className="tabs">
              <button
                className={`tab${view === 'tree' ? ' active' : ''}`}
                onClick={() => setView('tree')}
              >
                Tree
              </button>
              <button
                className={`tab${view === 'harvest' ? ' active' : ''}`}
                onClick={() => setView('harvest')}
              >
                <Wheat className="icon-xs" aria-hidden="true" />
                Harvest{' '}
                {harvestCounts.starred > 0 && (
                  <span className="badge">{harvestCounts.starred}</span>
                )}
                {harvestCounts.today > 0 && (
                  <span className="badge badge--today">{harvestCounts.today}</span>
                )}
                {harvestCounts.soon > 0 && (
                  <span className="badge badge--soon">{harvestCounts.soon}</span>
                )}
              </button>
              {view === 'tree' && displayNodes.length > 0 && (
                <>
                  <button
                    className="tab"
                    onClick={() => setTree(expandAll)}
                    title="Expand all nodes"
                  >
                    <ChevronsDown className="icon-xs" aria-hidden="true" />
                    <span className="tab-text">Expand</span>
                  </button>
                  <button
                    className="tab"
                    onClick={() => setTree(collapseAll)}
                    title="Collapse all nodes"
                  >
                    <ChevronsUp className="icon-xs" aria-hidden="true" />
                    <span className="tab-text">Collapse</span>
                  </button>
                </>
              )}
              {isAuthenticated ? (
                <button
                  className="tab"
                  onClick={() => {
                    logout()
                    if (typeof window !== 'undefined') {
                      window.location.assign('/auth')
                    }
                  }}
                >
                  <LogOut className="icon-xs" aria-hidden="true" />
                  <span className="tab-text">Logout</span>
                </button>
              ) : (
                <a className="tab" href="/auth">
                  <LogIn className="icon-xs" aria-hidden="true" />
                  <span className="tab-text">Login</span>
                </a>
              )}
            </div>
          </div>
          <div className="header-search">
            <TreeSearchDropdown
              tree={tree}
              onZoom={(path, node) => {
                const zoomPath =
                  node.children.length > 0 ? path : path.slice(0, -1)
                setZoomFromUi(zoomPath)
                setView('tree')
              }}
            />
          </div>
        </header>

        {showGuestReminder && (
          <section className="guest-save-reminder rise-in" role="status">
            <div className="guest-save-copy">
              <p className="guest-save-note">
                Your edits are saved on this device. Sign in to keep a cloud
                backup and access your tree on other devices.
              </p>
            </div>
            <div className="guest-save-actions">
              <a className="guest-save-login-btn" href="/auth">
                Sign in to sync
              </a>
              <button
                className="guest-save-dismiss-btn"
                onClick={() => {
                  const dismissedAtMs = Date.now()
                  guestReminderDismissedAtRef.current = dismissedAtMs
                  guestReminderEditCountRef.current = 0
                  writeJsonToStorage(GUEST_REMINDER_STORAGE_KEY, {
                    dismissedAtMs,
                  })
                  setIsGuestReminderDismissed(true)
                }}
                aria-label="Dismiss guest save reminder"
                title="Dismiss"
              >
                <X className="icon-xs" aria-hidden="true" />
              </button>
            </div>
          </section>
        )}

        {loginReconcileConflict && isConflictModalDismissed && (
          <section className="reconcile-alert" role="status">
            <div className="reconcile-alert-copy">
              Cloud and local trees conflict. Review to choose which one to
              keep.
            </div>
            <button
              className="reconcile-alert-btn"
              onClick={() => setIsConflictModalDismissed(false)}
            >
              Review conflict
            </button>
          </section>
        )}

        {view === 'tree' && suggestions.length > 0 && (
          <section className="suggestions rise-in">
            <div className="suggestions-head">
              <div>
                <div className="suggestions-kicker">Next up</div>
              </div>
            </div>
            <div className="suggestions-grid">
              {suggestions.map((item, index) => {
                const parentPath = item.path.slice(0, -1)
                const pathLabel = parentPath
                  .map((crumb) => crumb.text || 'Untitled')
                  .join(' › ')
                const isPendingHide =
                  typeof pendingSuggestionHides[item.node.id] === 'number'
                const isHideMenuOpen = hideMenuId === item.node.id

                return (
                  <article
                    key={item.node.id}
                    data-suggestion-id={item.node.id}
                    className={`suggestion-card feature-card${isPendingHide ? ' is-flipped' : ''}`}
                    style={{ animationDelay: `${index * 80}ms` }}
                    onClick={() => {
                      if (!isPendingHide) {
                        focusSuggestion(item.path, item.node.id)
                      }
                    }}
                    onKeyDown={(event) => {
                      if (
                        !isPendingHide &&
                        (event.key === 'Enter' || event.key === ' ')
                      ) {
                        event.preventDefault()
                        focusSuggestion(item.path, item.node.id)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    title="Open this suggestion"
                  >
                    <div className="suggestion-card-inner">
                      <div className="suggestion-card-face suggestion-card-front">
                        <div className="suggestion-top">
                          <div className="suggestion-score">{item.score}</div>
                          <div className="suggestion-reason">{item.reason}</div>
                        </div>
                        <div className="suggestion-text">
                          {item.node.text || 'Untitled task'}
                        </div>
                        {pathLabel ? (
                          <div className="suggestion-path">{pathLabel}</div>
                        ) : (
                          <div className="suggestion-path">Root level</div>
                        )}
                        <div className="suggestion-actions">
                          <button
                            className="suggestion-hide-btn"
                            onClick={(event) => {
                              event.stopPropagation()
                              if (isHideMenuOpen) {
                                closeHideMenu()
                              } else {
                                openHideMenu(item.node.id)
                              }
                            }}
                            title="Hide this suggestion temporarily"
                          >
                            <EyeOff className="icon-xs" aria-hidden="true" />
                            Hide
                          </button>
                        </div>
                      </div>
                      <div className="suggestion-card-face suggestion-card-back">
                        <div className="suggestion-back-copy">
                          <button
                            className="suggestion-undo-btn"
                            onClick={(event) => {
                              event.stopPropagation()
                              undoSuggestionHide(item.node.id)
                            }}
                          >
                            <Undo2 className="icon-xs" aria-hidden="true" />
                            Undo
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {hideMenuId && hideMenuPosition
          ? createPortal(
              <div
                className="suggestion-hide-menu"
                style={hideMenuPosition}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="suggestion-hide-row">
                  <button
                    className="suggestion-hide-option"
                    onClick={(event) => {
                      event.stopPropagation()
                      hideSuggestionForDuration(hideMenuId, 60 * 60 * 1000)
                    }}
                  >
                    1h
                  </button>
                  <button
                    className="suggestion-hide-option"
                    onClick={(event) => {
                      event.stopPropagation()
                      hideSuggestionForDuration(hideMenuId, 24 * 60 * 60 * 1000)
                    }}
                  >
                    1d
                  </button>
                  <button
                    className="suggestion-hide-option"
                    onClick={(event) => {
                      event.stopPropagation()
                      hideSuggestionForDuration(
                        hideMenuId,
                        7 * 24 * 60 * 60 * 1000,
                      )
                    }}
                  >
                    1w
                  </button>
                </div>
                <div className="suggestion-hide-row suggestion-hide-day-row">
                  <input
                    className="suggestion-hide-input"
                    type="date"
                    value={hideUntilDate}
                    onChange={(event) => setHideUntilDate(event.target.value)}
                  />
                  <button
                    className="suggestion-hide-apply"
                    onClick={(event) => {
                      event.stopPropagation()
                      hideSuggestionUntilDate(hideMenuId)
                    }}
                  >
                    Hide until day
                  </button>
                </div>
                <div className="suggestion-hide-row suggestion-hide-task-row">
                  <HideUntilTaskPicker
                    tree={tree}
                    excludeId={hideMenuId}
                    onApply={(taskId) =>
                      hideSuggestionUntilTask(hideMenuId, taskId)
                    }
                  />
                </div>
              </div>,
              document.body,
            )
          : null}

        {view === 'tree' && zoom.length > 0 && (
          <nav className="breadcrumbs">
            <button className="crumb" onClick={() => setZoomFromUi([])}>
              <FolderTree className="icon-xs" aria-hidden="true" />
              Root
            </button>
            {zoom.map((crumb, index) => (
              <span
                key={crumb.id}
                style={{ display: 'flex', alignItems: 'center', gap: 2 }}
              >
                <span className="sep" aria-hidden="true">
                  <ChevronRight className="icon-xs" />
                </span>
                <button
                  className={`crumb${index === zoom.length - 1 ? ' cur' : ''}`}
                  onClick={() =>
                    setZoomFromUi((prev) => prev.slice(0, index + 1))
                  }
                >
                  {crumb.text || 'Untitled'}
                </button>
              </span>
            ))}
          </nav>
        )}

        <main className="main">
          {view === 'tree' ? (
            displayNodes.length ? (
              displayNodes.map((node) => (
                <TodoNode key={node.id} node={node} depth={0} />
              ))
            ) : (
              <div className="empty">
                <FolderTree className="empty-icon" aria-hidden="true" />
                <div>Nothing here yet</div>
                <button className="btn-start" onClick={addRoot}>
                  <Plus className="icon-xs" aria-hidden="true" />
                  Add first task
                </button>
              </div>
            )
          ) : (
            <HarvestView />
          )}
        </main>

        {view === 'tree' && (
          <>
            <footer className="footer">
              <button className="btn-add-root" onClick={addRoot}>
                <Plus className="icon-xs" aria-hidden="true" />
                Add task
              </button>
            </footer>
            <div className="shortcuts">
              <div className="shortcut">
                <span className="key">Enter</span> new sibling
              </div>
              <div className="shortcut">
                <span className="key">Tab</span> indent
              </div>
              <div className="shortcut">
                <span className="key">Shift+Tab</span> outdent
              </div>
              <div className="shortcut">
                <span className="key">Backspace</span> delete empty
              </div>
              <div className="shortcut">
                <span className="key">+</span> zoom in
              </div>
              <div className="shortcut">
                <span className="key">*</span> pin to harvest
              </div>
              <div className="shortcut">
                <span className="key">☑</span> toggle category
              </div>
            </div>

            {focusRoot && (
              <HarvestFocusModal focusRoot={focusRoot} onClose={closeFocus}>
                <FocusNode
                  node={focusRoot}
                  setTree={setTree}
                  onActivate={closeFocusAndZoomToRoot}
                />
              </HarvestFocusModal>
            )}

            {showLoginConflictModal && (
              <div
                className="reconcile-modal-backdrop"
                onClick={() => setIsConflictModalDismissed(true)}
              >
                <section
                  className="reconcile-modal island-shell"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Resolve cloud sync conflict"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="reconcile-modal-head">
                    <div className="reconcile-kicker">Sync conflict</div>
                    <h2 className="reconcile-title">
                      Local and cloud snapshots diverged
                    </h2>
                    <p className="reconcile-copy">
                      Choose which version to keep before sync resumes.
                    </p>
                  </div>

                  <div className="reconcile-recommendation">
                    Recommended: Keep Local
                  </div>

                  {conflictResolutionError && (
                    <div className="reconcile-error" role="alert">
                      {conflictResolutionError}
                    </div>
                  )}

                  <div className="reconcile-actions">
                    <button
                      className="reconcile-btn reconcile-btn-primary"
                      onClick={() => {
                        void handleResolveConflict('keep-local')
                      }}
                      disabled={isResolvingConflict}
                    >
                      Keep Local
                    </button>
                    <button
                      className="reconcile-btn"
                      onClick={() => {
                        void handleResolveConflict('keep-cloud')
                      }}
                      disabled={isResolvingConflict}
                    >
                      Keep Cloud
                    </button>
                    <button
                      className="reconcile-btn reconcile-btn-ghost"
                      onClick={() => setIsConflictModalDismissed(true)}
                      disabled={isResolvingConflict}
                    >
                      Cancel / Review Later
                    </button>
                  </div>
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </TodoCtx.Provider>
  )
}
