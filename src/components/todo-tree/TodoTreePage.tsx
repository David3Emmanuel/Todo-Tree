import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../auth/auth-context'
import { BrandHeader } from '../layout/BrandHeader'
import { LoadingScreen } from '../layout/LoadingScreen'
import { HarvestView } from './HarvestView'
import { TodoCtx } from './todo-context'
import { TodoNode } from './TodoNode'
import { usePersistence } from './usePersistence'
import { useZoomSync } from './useZoomSync'
import type { Breadcrumb, CtxValue, TreeNode } from './types'
import {
  collapseAll,
  expandAll,
  findNode,
  getAllStarred,
  getProgress,
  getNextActionSuggestions,
  makeNode,
  toggleTree,
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
    suggestionTick,
  } = usePersistence(isAuthenticated, jwt)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [hideMenuId, setHideMenuId] = useState<string | null>(null)
  const [hideUntilDate, setHideUntilDate] = useState('')
  const [focusRootId, setFocusRootId] = useState<string | null>(null)
  const pendingEditingIdRef = useRef<string | null>(null)
  const suggestionSeedRef = useRef(Math.random().toString(36).slice(2))

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
    if (isHydrating || isAuthenticated || location.pathname === '/auth') {
      return
    }

    void navigate({ to: '/auth', replace: true }).catch(() => {
      window.location.replace('/auth')
    })
  }, [isAuthenticated, isHydrating, location.pathname, navigate])

  useEffect(() => {
    if (!pendingEditingIdRef.current) {
      return
    }

    const nextEditingId = pendingEditingIdRef.current
    pendingEditingIdRef.current = null
    setEditingId(nextEditingId)
  }, [tree])

  const focusRoot = useMemo(
    () => (focusRootId ? findNode(tree, focusRootId) : null),
    [tree, focusRootId],
  )

  useEffect(() => {
    if (!focusRootId) {
      return
    }

    if (!focusRoot) {
      setFocusRootId(null)
    }
  }, [focusRoot, focusRootId])

  useEffect(() => {
    if (!focusRoot) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFocusRootId(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusRoot])

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
    void path
    setHideMenuId(null)
    setFocusRootId(nodeId)
  }

  const renderFocusNode = (node: TreeNode, depth = 0) => {
    const isFolder = node.kind === 'folder'
    const { done, total } = getProgress(node)
    const allDone = !isFolder && total > 0 && done === total
    const someDone = !isFolder && !allDone && done > 0

    return (
      <div key={node.id} className="focus-node-wrap">
        <div className="focus-node" style={{ paddingLeft: `${depth * 18}px` }}>
          <button
            className={`check${isFolder ? ' folder' : ''}${allDone ? ' done' : someDone ? ' part' : ''}`}
            onClick={() =>
              !isFolder && setTree((prev) => toggleTree(prev, node.id))
            }
            disabled={isFolder}
            title={isFolder ? 'Category (not completable)' : undefined}
          >
            {isFolder ? '∞' : allDone ? '✓' : someDone ? '-' : ''}
          </button>
          <div className="focus-node-text-wrap">
            <div
              className={`focus-node-text${isFolder ? ' folder' : ''}${allDone ? ' done' : ''}`}
            >
              {node.text || 'Untitled task'}
            </div>
            {node.children.length > 0 && (
              <div className="focus-node-meta">
                {done}/{total} complete
              </div>
            )}
          </div>
        </div>
        {node.children.length > 0 && (
          <div>
            {node.children.map((child) => renderFocusNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
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

            {focusRoot && (
              <div
                className="focus-modal-backdrop"
                onClick={() => setFocusRootId(null)}
              >
                <section
                  className="focus-modal island-shell"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Focused subtree"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="focus-modal-head">
                    <div>
                      <div className="suggestions-kicker">Focus</div>
                      <h2 className="focus-modal-title">
                        {focusRoot.text || 'Untitled task'}
                      </h2>
                    </div>
                    <button
                      className="tab"
                      onClick={() => setFocusRootId(null)}
                    >
                      Close
                    </button>
                  </div>
                  <div className="focus-modal-body">
                    {renderFocusNode(focusRoot)}
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
