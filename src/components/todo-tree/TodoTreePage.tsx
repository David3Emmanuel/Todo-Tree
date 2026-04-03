import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../auth/auth-context'
import { BrandHeader } from '../layout/BrandHeader'
import { LoadingScreen } from '../layout/LoadingScreen'
import { HarvestView } from './HarvestView'
import { loadPersistedState, savePersistedState } from './persistence'
import { TodoCtx } from './todo-context'
import { TodoNode } from './TodoNode'
import type { Breadcrumb, CtxValue, TreeNode, ViewMode } from './types'
import {
  findNode,
  getAllStarred,
  getNextActionSuggestions,
  makeNode,
  upd,
  collapseAll,
  expandAll,
} from './tree-utils'

function resolveZoomFromSegments(
  tree: TreeNode[],
  segments: string[],
): Breadcrumb[] {
  const zoom: Breadcrumb[] = []
  let level = tree

  for (const segment of segments) {
    const node = level.find((candidate) => candidate.id === segment)
    if (!node) {
      break
    }

    zoom.push({ id: node.id, text: node.text })
    level = node.children
  }

  return zoom
}

function isSameZoom(a: Breadcrumb[], b: Breadcrumb[]): boolean {
  if (a.length !== b.length) return false

  for (let index = 0; index < a.length; index += 1) {
    if (a[index].id !== b[index].id || a[index].text !== b[index].text) {
      return false
    }
  }

  return true
}

function toBreadcrumbPath(zoom: Breadcrumb[]): string {
  if (!zoom.length) return '/'
  return `/${zoom.map((crumb) => encodeURIComponent(crumb.id)).join('/')}`
}

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

function pruneSuggestionHides(
  hides: Record<string, number>,
  now: number,
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [key, until] of Object.entries(hides)) {
    if (until > now) {
      result[key] = until
    }
  }
  return result
}

export function TodoTreePage({ pathSegments }: { pathSegments: string[] }) {
  const [isReady, setIsReady] = useState(false)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [zoom, setZoom] = useState<Breadcrumb[]>([])
  const [view, setView] = useState<ViewMode>('tree')
  const [suggestionHides, setSuggestionHides] = useState<
    Record<string, number>
  >({})
  const [hideMenuId, setHideMenuId] = useState<string | null>(null)
  const [hideUntilDate, setHideUntilDate] = useState('')
  const [suggestionTick, setSuggestionTick] = useState(() => Date.now())
  const zoomSyncSourceRef = useRef<'path' | 'ui' | null>(null)
  const pendingEditingIdRef = useRef<string | null>(null)
  const suggestionSeedRef = useRef(Math.random().toString(36).slice(2))

  const navigate = useNavigate()
  const { logout, isAuthenticated, isHydrating } = useAuth()
  const location = useLocation()
  const pathKey = useMemo(() => pathSegments.join('/'), [pathSegments])
  const resolvedZoomFromPath = useMemo(
    () => resolveZoomFromSegments(tree, pathSegments),
    [tree, pathKey, pathSegments],
  )
  const zoomPath = useMemo(() => toBreadcrumbPath(zoom), [zoom])

  const setZoomFromUi: typeof setZoom = (value) => {
    zoomSyncSourceRef.current = 'ui'
    setZoom(value)
  }

  useEffect(() => {
    if (isHydrating || isAuthenticated || location.pathname === '/auth') {
      return
    }

    void navigate({ to: '/auth', replace: true }).catch(() => {
      window.location.replace('/auth')
    })
  }, [isAuthenticated, isHydrating, location.pathname, navigate])

  useEffect(() => {
    if (!isAuthenticated) {
      setIsReady(false)
      return
    }

    const persisted = loadPersistedState()
    setTree(persisted.tree)
    setZoom(persisted.zoom)
    setView(persisted.view)
    setSuggestionHides(persisted.suggestionHides ?? {})
    setIsReady(true)
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated || !isReady) {
      return
    }

    if (location.pathname === zoomPath) {
      if (zoomSyncSourceRef.current === 'ui') {
        zoomSyncSourceRef.current = null
      }
      return
    }

    if (zoomSyncSourceRef.current === 'ui') {
      return
    }

    zoomSyncSourceRef.current = 'path'
    setZoom((prev) =>
      isSameZoom(prev, resolvedZoomFromPath) ? prev : resolvedZoomFromPath,
    )
  }, [
    isAuthenticated,
    isReady,
    location.pathname,
    zoomPath,
    resolvedZoomFromPath,
  ])

  const activeSuggestionHides = useMemo(
    () => pruneSuggestionHides(suggestionHides, suggestionTick),
    [suggestionHides, suggestionTick],
  )

  useEffect(() => {
    if (!isAuthenticated || !isReady) {
      return
    }

    savePersistedState({
      tree,
      zoom,
      view,
      suggestionHides: activeSuggestionHides,
    })
  }, [isReady, tree, zoom, view, activeSuggestionHides])

  useEffect(() => {
    const activeExpiryTimes = Object.values(activeSuggestionHides)
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

  useEffect(() => {
    if (!pendingEditingIdRef.current) {
      return
    }

    const nextEditingId = pendingEditingIdRef.current
    pendingEditingIdRef.current = null
    setEditingId(nextEditingId)
  }, [tree])

  useEffect(() => {
    if (!isReady) {
      return
    }

    if (
      zoomSyncSourceRef.current === 'path' &&
      !isSameZoom(zoom, resolvedZoomFromPath)
    ) {
      return
    }

    const nextPath = toBreadcrumbPath(zoom)
    if (location.pathname !== nextPath) {
      navigate({ to: nextPath, replace: true })
      return
    }

    if (zoomSyncSourceRef.current === 'path') {
      zoomSyncSourceRef.current = null
    }
  }, [
    isAuthenticated,
    isReady,
    zoom,
    resolvedZoomFromPath,
    location.pathname,
    navigate,
  ])

  const suggestions = useMemo(() => {
    const now = suggestionTick
    return getNextActionSuggestions(tree, suggestionSeedRef.current, 3).filter(
      (item) => {
        const hiddenUntil = activeSuggestionHides[item.node.id]
        return hiddenUntil === undefined || hiddenUntil <= now
      },
    )
  }, [activeSuggestionHides, suggestionTick, tree])

  if (isHydrating) {
    return <LoadingScreen message="Loading your tree..." />
  }

  if (!isAuthenticated) {
    return null
  }

  if (!isReady) {
    return <LoadingScreen message="Loading your tree..." />
  }

  const zoomedNode = zoom.length
    ? findNode(tree, zoom[zoom.length - 1].id)
    : null
  const displayNodes = zoomedNode ? zoomedNode.children : tree
  const starred = getAllStarred(tree)

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
    setHideMenuId(null)
    setZoomFromUi(path.slice(0, -1))
    setEditingId(nodeId)
  }

  const hideSuggestion = (nodeId: string, until: number) => {
    setSuggestionHides((prev) => ({
      ...prev,
      [nodeId]: until,
    }))
    setHideMenuId(null)
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

  const openHideMenu = (nodeId: string) => {
    setHideMenuId(nodeId)
    setHideUntilDate(formatDateInputValue(new Date(Date.now() + 86400000)))
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
              Focus{' '}
              {starred.length > 0 && (
                <span className="badge">{starred.length}</span>
              )}
            </button>
            {view === 'tree' && displayNodes.length > 0 && (
              <>
                <button
                  className="tab"
                  onClick={() => setTree(expandAll)}
                  title="Expand all nodes"
                >
                  ▼ Expand
                </button>
                <button
                  className="tab"
                  onClick={() => setTree(collapseAll)}
                  title="Collapse all nodes"
                >
                  ▶ Collapse
                </button>
              </>
            )}
            <button
              className="tab"
              onClick={() => {
                logout()
                navigate({ to: '/auth' })
              }}
            >
              Logout
            </button>
          </div>
        </header>

        {view === 'tree' && suggestions.length > 0 && (
          <section className="suggestions rise-in">
            <div className="suggestions-head">
              <div>
                <div className="suggestions-kicker">Next up</div>
                <div className="suggestions-title">
                  Good candidates for your next move
                </div>
              </div>
              <div className="suggestions-note">
                Weighted toward stars, momentum, and nearly finished branches
              </div>
            </div>
            <div className="suggestions-grid">
              {suggestions.map((item, index) => {
                const parentPath = item.path.slice(0, -1)
                const pathLabel = parentPath
                  .map((crumb) => crumb.text || 'Untitled')
                  .join(' › ')
                const isHideMenuOpen = hideMenuId === item.node.id

                return (
                  <article
                    key={item.node.id}
                    className="suggestion-card feature-card"
                    style={{ animationDelay: `${index * 80}ms` }}
                    onClick={() => focusSuggestion(item.path, item.node.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        focusSuggestion(item.path, item.node.id)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    title="Open this suggestion"
                  >
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
                            setHideMenuId(null)
                          } else {
                            openHideMenu(item.node.id)
                          }
                        }}
                        title="Hide this suggestion temporarily"
                      >
                        Hide
                      </button>
                      {isHideMenuOpen && (
                        <div
                          className="suggestion-hide-menu"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <div className="suggestion-hide-row">
                            <button
                              className="suggestion-hide-option"
                              onClick={(event) => {
                                event.stopPropagation()
                                hideSuggestionForDuration(
                                  item.node.id,
                                  60 * 60 * 1000,
                                )
                              }}
                            >
                              1h
                            </button>
                            <button
                              className="suggestion-hide-option"
                              onClick={(event) => {
                                event.stopPropagation()
                                hideSuggestionForDuration(
                                  item.node.id,
                                  24 * 60 * 60 * 1000,
                                )
                              }}
                            >
                              1d
                            </button>
                            <button
                              className="suggestion-hide-option"
                              onClick={(event) => {
                                event.stopPropagation()
                                hideSuggestionForDuration(
                                  item.node.id,
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
                              onChange={(event) =>
                                setHideUntilDate(event.target.value)
                              }
                            />
                            <button
                              className="suggestion-hide-apply"
                              onClick={(event) => {
                                event.stopPropagation()
                                hideSuggestionUntilDate(item.node.id)
                              }}
                            >
                              Hide until day
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {view === 'tree' && zoom.length > 0 && (
          <nav className="breadcrumbs">
            <button className="crumb" onClick={() => setZoomFromUi([])}>
              Root
            </button>
            {zoom.map((crumb, index) => (
              <span
                key={crumb.id}
                style={{ display: 'flex', alignItems: 'center', gap: 2 }}
              >
                <span className="sep">›</span>
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
                <div style={{ fontSize: 48, opacity: 0.12 }}>⬡</div>
                <div>Nothing here yet</div>
                <button className="btn-start" onClick={addRoot}>
                  + Add first task
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
                + Add task
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
                <span className="key">*</span> pin to focus
              </div>
              <div className="shortcut">
                <span className="key">☑</span> toggle category
              </div>
            </div>
          </>
        )}
      </div>
    </TodoCtx.Provider>
  )
}
