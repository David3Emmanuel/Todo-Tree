import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { HarvestView } from '../components/todo-tree/HarvestView'
import { loadPersistedState, savePersistedState } from '../components/todo-tree/persistence'
import { TodoCtx } from '../components/todo-tree/todo-context'
import { TodoNode } from '../components/todo-tree/TodoNode'
import type { CtxValue, TreeNode, ViewMode } from '../components/todo-tree/types'
import {
  findNode,
  getAllStarred,
  makeNode,
  upd,
} from '../components/todo-tree/tree-utils'

export const Route = createFileRoute('/')({ component: App })

function App() {
  const initialState = loadPersistedState()
  const [tree, setTree] = useState<TreeNode[]>(initialState.tree)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(initialState.zoom)
  const [view, setView] = useState<ViewMode>(initialState.view)

  useEffect(() => {
    savePersistedState({ tree, zoom, view })
  }, [tree, zoom, view])

  const zoomedNode = zoom.length
    ? findNode(tree, zoom[zoom.length - 1].id)
    : null
  const displayNodes = zoomedNode ? zoomedNode.children : tree
  const starred = getAllStarred(tree)

  const addRoot = () => {
    const node = makeNode()
    if (zoomedNode) {
      setTree((prev) =>
        upd(prev, zoomedNode.id, (target) => {
          target.children.push(node)
          target.collapsed = false
        }),
      )
    } else {
      setTree((prev) => [...prev, node])
    }
    setEditingId(node.id)
  }

  const ctx: CtxValue = {
    tree,
    setTree,
    editingId,
    setEditingId,
    zoom,
    setZoom,
  }

  return (
    <TodoCtx.Provider value={ctx}>
      <div className="app">
        <header className="header">
          <div className="brand">
            <span className="brand-icon">⬡</span>
            <div>
              <div className="brand-name">TodoTree</div>
              <div className="brand-sub">
                Infinite hierarchy · Focused execution
              </div>
            </div>
          </div>
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
          </div>
        </header>

        {view === 'tree' && zoom.length > 0 && (
          <nav className="breadcrumbs">
            <button className="crumb" onClick={() => setZoom([])}>
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
                  onClick={() => setZoom((prev) => prev.slice(0, index + 1))}
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
            </div>
          </>
        )}
      </div>
    </TodoCtx.Provider>
  )
}
