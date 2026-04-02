import { createFileRoute } from '@tanstack/react-router'
import { createContext, useContext, useState } from 'react'
import './index.css'

export const Route = createFileRoute('/')({ component: App })

type TreeNode = {
  id: string
  text: string
  completed: boolean
  collapsed: boolean
  starred: boolean
  children: TreeNode[]
}

type Breadcrumb = {
  id: string
  text: string
}

type DropPosition = 'before' | 'after' | 'inside'

type StarredItem = TreeNode & {
  _path: string[]
}

type CtxValue = {
  tree: TreeNode[]
  setTree: React.Dispatch<React.SetStateAction<TreeNode[]>>
  editingId: string | null
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>
  zoom: Breadcrumb[]
  setZoom: React.Dispatch<React.SetStateAction<Breadcrumb[]>>
}

const uid = () => Math.random().toString(36).slice(2, 9)
const dc = <T,>(obj: T): T => JSON.parse(JSON.stringify(obj)) as T
const makeNode = (): TreeNode => ({
  id: uid(),
  text: '',
  completed: false,
  collapsed: false,
  starred: false,
  children: [],
})

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children ?? [], id)
    if (found) return found
  }
  return null
}

function getLeaves(node: TreeNode): TreeNode[] {
  if (!node.children.length) return [node]
  return node.children.flatMap(getLeaves)
}

function getProgress(node: TreeNode): {
  done: number
  total: number
  isLeaf: boolean
} {
  if (!node.children.length) {
    return { done: node.completed ? 1 : 0, total: 1, isLeaf: true }
  }

  const leaves = getLeaves(node)
  const done = leaves.filter((leaf) => leaf.completed).length
  return { done, total: leaves.length, isLeaf: false }
}

function countDescendants(node: TreeNode): number {
  if (!node.children.length) return 0
  return (
    node.children.length +
    node.children.reduce((sum, child) => sum + countDescendants(child), 0)
  )
}

function getAllStarred(nodes: TreeNode[], path: string[] = []): StarredItem[] {
  const result: StarredItem[] = []
  for (const node of nodes) {
    const nextPath = [...path, node.text]
    if (node.starred) result.push({ ...node, _path: path })
    result.push(...getAllStarred(node.children, nextPath))
  }
  return result
}

function upd(
  tree: TreeNode[],
  id: string,
  fn: (node: TreeNode) => void,
): TreeNode[] {
  const clone = dc(tree)
  const walk = (nodes: TreeNode[]): boolean => {
    for (const node of nodes) {
      if (node.id === id) {
        fn(node)
        return true
      }
      if (walk(node.children)) return true
    }
    return false
  }
  walk(clone)
  return clone
}

function rem(nodes: TreeNode[], id: string): TreeNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({ ...node, children: rem(node.children, id) }))
}

function propagate(nodes: TreeNode[]): void {
  for (const node of nodes) {
    if (node.children.length) {
      propagate(node.children)
      node.completed = node.children.every((child) => child.completed)
    }
  }
}

function toggleTree(tree: TreeNode[], id: string): TreeNode[] {
  const clone = dc(tree)

  function walk(nodes: TreeNode[]): boolean {
    for (const node of nodes) {
      if (node.id === id) {
        if (!node.children.length) {
          node.completed = !node.completed
        } else {
          const allDone = getLeaves(node).every((leaf) => leaf.completed)
          const setAll = (target: TreeNode, value: boolean): void => {
            if (!target.children.length) {
              target.completed = value
            } else {
              target.children.forEach((child) => setAll(child, value))
            }
          }
          setAll(node, !allDone)
        }
        return true
      }
      if (walk(node.children)) return true
    }
    return false
  }

  walk(clone)
  propagate(clone)
  return clone
}

function addSib(
  tree: TreeNode[],
  afterId: string,
  newNode: TreeNode,
): TreeNode[] {
  const clone = dc(tree)
  const insert = (nodes: TreeNode[]): boolean => {
    const index = nodes.findIndex((node) => node.id === afterId)
    if (index !== -1) {
      nodes.splice(index + 1, 0, newNode)
      return true
    }
    for (const node of nodes) {
      if (insert(node.children)) return true
    }
    return false
  }
  if (!insert(clone)) clone.push(newNode)
  return clone
}

function indentN(tree: TreeNode[], id: string): TreeNode[] {
  const clone = dc(tree)
  const walk = (nodes: TreeNode[]): boolean => {
    const index = nodes.findIndex((node) => node.id === id)
    if (index > 0) {
      const [node] = nodes.splice(index, 1)
      const parent = nodes[index - 1]
      parent.children.push(node)
      parent.collapsed = false
      return true
    }
    for (const node of nodes) {
      if (walk(node.children)) return true
    }
    return false
  }
  return walk(clone) ? clone : tree
}

function outdentN(tree: TreeNode[], id: string): TreeNode[] {
  const clone = dc(tree)
  const walk = (nodes: TreeNode[]): boolean => {
    for (let index = 0; index < nodes.length; index += 1) {
      const children = nodes[index].children
      const childIndex = children.findIndex((child) => child.id === id)
      if (childIndex !== -1) {
        const [node] = children.splice(childIndex, 1)
        nodes.splice(index + 1, 0, node)
        return true
      }
      if (walk(children)) return true
    }
    return false
  }
  return walk(clone) ? clone : tree
}

function moveN(
  tree: TreeNode[],
  dragId: string,
  targetId: string,
  pos: DropPosition,
): TreeNode[] {
  if (dragId === targetId) return tree

  const clone = dc(tree)
  let dragged: TreeNode | null = null

  const extract = (nodes: TreeNode[]): boolean => {
    const index = nodes.findIndex((node) => node.id === dragId)
    if (index !== -1) {
      ;[dragged] = nodes.splice(index, 1)
      return true
    }
    for (const node of nodes) {
      if (extract(node.children)) return true
    }
    return false
  }

  extract(clone)
  if (!dragged) return tree

  const insert = (nodes: TreeNode[]): boolean => {
    const index = nodes.findIndex((node) => node.id === targetId)
    if (index !== -1) {
      if (pos === 'before') {
        nodes.splice(index, 0, dragged as TreeNode)
      } else if (pos === 'after') {
        nodes.splice(index + 1, 0, dragged as TreeNode)
      } else {
        nodes[index].children.push(dragged as TreeNode)
        nodes[index].collapsed = false
      }
      return true
    }
    for (const node of nodes) {
      if (insert(node.children)) return true
    }
    return false
  }

  insert(clone)
  return clone
}

const Ctx = createContext<CtxValue | null>(null)

function useTodoCtx(): CtxValue {
  const value = useContext(Ctx)
  if (!value) throw new Error('TodoTree context not initialized')
  return value
}

function Node({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const { setTree, editingId, setEditingId, setZoom } = useTodoCtx()
  const [dropPos, setDropPos] = useState<DropPosition | null>(null)

  const hasKids = node.children.length > 0
  const { done, total, isLeaf } = getProgress(node)
  const allDone = total > 0 && done === total
  const someDone = !allDone && done > 0
  const isEditing = editingId === node.id
  const paddingLeft = 14 + depth * 22

  const onKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      const nextNode = makeNode()
      setTree((prev) => addSib(prev, node.id, nextNode))
      setEditingId(nextNode.id)
    } else if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault()
      setTree((prev) => indentN(prev, node.id))
    } else if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault()
      setTree((prev) => outdentN(prev, node.id))
    } else if (event.key === 'Backspace' && node.text === '') {
      event.preventDefault()
      setTree((prev) => rem(prev, node.id))
      setEditingId(null)
    } else if (event.key === 'Escape') {
      setEditingId(null)
    }
  }

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const { top, height } = event.currentTarget.getBoundingClientRect()
    const y = event.clientY - top
    setDropPos(
      y < height * 0.28 ? 'before' : y > height * 0.72 ? 'after' : 'inside',
    )
  }

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const id = event.dataTransfer.getData('text/plain')
    if (id && dropPos) {
      setTree((prev) => moveN(prev, id, node.id, dropPos))
    }
    setDropPos(null)
  }

  const pct = total ? done / total : 0

  return (
    <>
      {dropPos === 'before' && (
        <div className="drop-line" style={{ marginLeft: paddingLeft + 16 }} />
      )}

      <div
        className={`node${dropPos === 'inside' ? ' drop-inside' : ''}`}
        style={{ paddingLeft }}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', node.id)
          event.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          const relatedTarget = event.relatedTarget as Node | null
          if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
            setDropPos(null)
          }
        }}
        onDrop={onDrop}
        onDragEnd={() => setDropPos(null)}
      >
        <button
          className={`expand-btn${hasKids && !node.collapsed ? ' open' : ''}`}
          style={{
            opacity: hasKids ? 1 : 0.15,
            cursor: hasKids ? 'pointer' : 'default',
          }}
          onClick={() =>
            hasKids &&
            setTree((prev) =>
              upd(prev, node.id, (target) => {
                target.collapsed = !target.collapsed
              }),
            )
          }
          tabIndex={hasKids ? 0 : -1}
        >
          <span className="arr">▶</span>
        </button>

        <button
          className={`check${allDone ? ' done' : someDone ? ' part' : ''}`}
          onClick={() => setTree((prev) => toggleTree(prev, node.id))}
          title={
            hasKids
              ? allDone
                ? 'Uncheck all'
                : 'Check all'
              : node.completed
                ? 'Uncheck'
                : 'Check'
          }
        >
          {allDone ? '✓' : someDone ? '-' : ''}
        </button>

        {isEditing ? (
          <input
            className="node-input"
            autoFocus
            value={node.text}
            onChange={(event) =>
              setTree((prev) =>
                upd(prev, node.id, (target) => {
                  target.text = event.target.value
                }),
              )
            }
            onKeyDown={onKey}
            onBlur={() => setEditingId(null)}
            placeholder="Task name..."
          />
        ) : (
          <span
            className={`node-text${allDone ? ' done' : ''}`}
            onClick={() => setEditingId(node.id)}
            title="Click to edit"
          >
            {node.text || <span className="ph">click to edit...</span>}
          </span>
        )}

        {hasKids && !isLeaf && (
          <div className="prog">
            <div className="prog-track">
              <div
                className="prog-fill"
                style={{
                  width: `${pct * 100}%`,
                  background: allDone
                    ? '#5a8f60'
                    : 'linear-gradient(90deg, #cf7d3c, #e8c547)',
                }}
              />
            </div>
            <span className="prog-label">
              {done}/{total}
            </span>
          </div>
        )}

        {hasKids && node.collapsed && (
          <span className="collapsed-count">{countDescendants(node)}</span>
        )}

        <span className="actions">
          <button
            className={`act${node.starred ? ' starred' : ''}`}
            title={node.starred ? 'Unpin from Focus' : 'Pin to Focus'}
            onClick={() =>
              setTree((prev) =>
                upd(prev, node.id, (target) => {
                  target.starred = !target.starred
                }),
              )
            }
          >
            ★
          </button>
          {hasKids && (
            <button
              className="act zoom"
              title="Zoom in"
              onClick={() =>
                setZoom((prev) => [...prev, { id: node.id, text: node.text }])
              }
            >
              +
            </button>
          )}
          <button
            className="act del"
            title="Delete"
            onClick={() => setTree((prev) => rem(prev, node.id))}
          >
            x
          </button>
        </span>
      </div>

      {dropPos === 'after' && (
        <div className="drop-line" style={{ marginLeft: paddingLeft + 16 }} />
      )}

      {hasKids && !node.collapsed && (
        <div>
          {node.children.map((child) => (
            <Node key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  )
}

function HarvestView() {
  const { tree, setTree } = useTodoCtx()
  const items = getAllStarred(tree)

  if (!items.length) {
    return (
      <div className="empty">
        <div style={{ fontSize: 44, opacity: 0.15 }}>★</div>
        <div>No pinned tasks yet</div>
        <div style={{ fontSize: 12, color: '#2e2c2a' }}>
          Star tasks in the Tree view to harvest them here
        </div>
      </div>
    )
  }

  return (
    <div className="harvest">
      <div className="harvest-hint">
        Starred tasks harvested from across your tree
      </div>
      {items.map((item) => {
        const { done, total } = getProgress(item)
        const allDone = total > 0 && done === total
        return (
          <div key={item.id} className="h-item">
            <button
              className={`check${allDone ? ' done' : ''}`}
              style={{ flexShrink: 0 }}
              onClick={() => setTree((prev) => toggleTree(prev, item.id))}
            >
              {allDone && '✓'}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "'Courier Prime', monospace",
                  fontSize: 14,
                  color: allDone ? '#333130' : '#e6dfd6',
                  textDecoration: allDone ? 'line-through' : 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.text}
              </div>
              {item._path.length > 0 && (
                <div className="h-path">{item._path.join(' > ')}</div>
              )}
            </div>
            <button
              className="act starred"
              title="Unpin"
              onClick={() =>
                setTree((prev) =>
                  upd(prev, item.id, (target) => {
                    target.starred = false
                  }),
                )
              }
            >
              ★
            </button>
          </div>
        )
      })}
    </div>
  )
}

const INIT: TreeNode[] = [
  {
    id: 'w1',
    text: 'Work',
    completed: false,
    collapsed: false,
    starred: false,
    children: [
      {
        id: 'w2',
        text: 'Q2 Marketing Launch',
        completed: false,
        collapsed: false,
        starred: false,
        children: [
          {
            id: 'w3',
            text: 'Draft email campaign',
            completed: true,
            collapsed: false,
            starred: false,
            children: [],
          },
          {
            id: 'w4',
            text: 'Design landing page',
            completed: false,
            collapsed: false,
            starred: true,
            children: [],
          },
          {
            id: 'w5',
            text: 'Set up A/B testing',
            completed: false,
            collapsed: false,
            starred: false,
            children: [],
          },
          {
            id: 'w6',
            text: 'Schedule social posts',
            completed: false,
            collapsed: false,
            starred: false,
            children: [],
          },
        ],
      },
      {
        id: 'w7',
        text: 'Team sync prep',
        completed: false,
        collapsed: false,
        starred: false,
        children: [
          {
            id: 'w8',
            text: 'Compile weekly metrics',
            completed: true,
            collapsed: false,
            starred: false,
            children: [],
          },
          {
            id: 'w9',
            text: 'Update roadmap slides',
            completed: false,
            collapsed: false,
            starred: true,
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: 'p1',
    text: 'Personal',
    completed: false,
    collapsed: false,
    starred: false,
    children: [
      {
        id: 'p2',
        text: 'Book dentist appointment',
        completed: false,
        collapsed: false,
        starred: true,
        children: [],
      },
      {
        id: 'p3',
        text: 'Renew gym membership',
        completed: false,
        collapsed: false,
        starred: false,
        children: [],
      },
      {
        id: 'p4',
        text: 'Weekend trip planning',
        completed: false,
        collapsed: false,
        starred: false,
        children: [
          {
            id: 'p5',
            text: 'Check hotel prices',
            completed: true,
            collapsed: false,
            starred: false,
            children: [],
          },
          {
            id: 'p6',
            text: 'Book train tickets',
            completed: false,
            collapsed: false,
            starred: false,
            children: [],
          },
          {
            id: 'p7',
            text: 'Pack bag',
            completed: false,
            collapsed: false,
            starred: false,
            children: [],
          },
        ],
      },
    ],
  },
  {
    id: 'i1',
    text: 'Ideas',
    completed: false,
    collapsed: false,
    starred: false,
    children: [
      {
        id: 'i2',
        text: 'Build a To-Do Tree app',
        completed: false,
        collapsed: false,
        starred: true,
        children: [],
      },
      {
        id: 'i3',
        text: 'Write a short story',
        completed: false,
        collapsed: false,
        starred: false,
        children: [],
      },
    ],
  },
]

function App() {
  const [tree, setTree] = useState<TreeNode[]>(INIT)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [zoom, setZoom] = useState<Breadcrumb[]>([])
  const [view, setView] = useState<'tree' | 'harvest'>('tree')

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
    <Ctx.Provider value={ctx}>
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
                <Node key={node.id} node={node} depth={0} />
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
    </Ctx.Provider>
  )
}
