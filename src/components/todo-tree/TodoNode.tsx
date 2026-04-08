import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  ChevronRight,
  Square,
  FolderTree,
  Minus,
  MoreHorizontal,
  Trash2,
  TreePine,
  Wheat,
  WheatOff,
  ZoomIn,
} from 'lucide-react'
import { useTodoCtx } from './todo-context'
import type { DropPosition, TreeNode } from './types'
import {
  addSib,
  countDescendants,
  getProgress,
  indentN,
  makeNode,
  makeUniqueUid,
  moveN,
  outdentN,
  rem,
  toggleTree,
  upd,
} from './tree-utils'

export function TodoNode({
  node,
  depth = 0,
}: {
  node: TreeNode
  depth?: number
}) {
  const { tree, setTree, editingId, setEditingId, setZoom } = useTodoCtx()
  const [dropPos, setDropPos] = useState<DropPosition | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const pendingEditingIdRef = useRef<string | null>(null)
  const moreRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!pendingEditingIdRef.current) {
      return
    }

    const nextEditingId = pendingEditingIdRef.current
    pendingEditingIdRef.current = null
    setEditingId(nextEditingId)
  }, [setEditingId, tree])

  useEffect(() => {
    if (!menuOpen) return
    const onMenuKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onMenuKey)
    return () => window.removeEventListener('keydown', onMenuKey)
  }, [menuOpen])

  const openMenu = () => {
    if (!moreRef.current) return
    const isMobile = window.innerWidth <= 640
    if (isMobile) {
      setMenuStyle({ zIndex: 9999 })
    } else {
      const rect = moreRef.current.getBoundingClientRect()
      setMenuStyle({
        position: 'fixed',
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        zIndex: 9999,
      })
    }
    setMenuOpen(true)
  }

  const findBreadcrumbPath = (
    nodes: TreeNode[],
    targetId: string,
    path: { id: string; text: string }[] = [],
  ): { id: string; text: string }[] | null => {
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

  const hasKids = node.children.length > 0
  const isFolder = node.kind === 'folder'
  const { done, total, isLeaf } = getProgress(node)
  const allDone = !isFolder && total > 0 && done === total
  const someDone = !isFolder && !allDone && done > 0
  const isEditing = editingId === node.id
  const paddingLeft = 14 + depth * 22

  const getCommittedId = (currentId: string, currentText: string) =>
    makeUniqueUid(tree, currentText, currentId)

  const updateZoomForCommittedId = (currentId: string, nextId: string) => {
    if (nextId === currentId) {
      return
    }

    setZoom((prev) =>
      prev.map((crumb) =>
        crumb.id === currentId ? { ...crumb, id: nextId } : crumb,
      ),
    )
  }

  const onKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      const committedId = getCommittedId(node.id, node.text)
      updateZoomForCommittedId(node.id, committedId)
      setTree((prev) => {
        const treeWithCommittedId =
          committedId === node.id
            ? prev
            : upd(prev, node.id, (target) => {
                target.id = committedId
              })
        const childNode = makeNode(treeWithCommittedId)
        pendingEditingIdRef.current = childNode.id
        return upd(treeWithCommittedId, committedId, (target) => {
          target.children.push(childNode)
          target.collapsed = false
        })
      })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const committedId = getCommittedId(node.id, node.text)
      updateZoomForCommittedId(node.id, committedId)
      setTree((prev) => {
        const treeWithCommittedId =
          committedId === node.id
            ? prev
            : upd(prev, node.id, (target) => {
                target.id = committedId
              })
        const nextNode = makeNode(treeWithCommittedId)
        pendingEditingIdRef.current = nextNode.id
        return addSib(treeWithCommittedId, committedId, nextNode)
      })
    } else if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault()
      const committedId = getCommittedId(node.id, node.text)
      updateZoomForCommittedId(node.id, committedId)
      setTree((prev) => {
        const treeWithCommittedId =
          committedId === node.id
            ? prev
            : upd(prev, node.id, (target) => {
                target.id = committedId
              })
        return indentN(treeWithCommittedId, committedId)
      })
    } else if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault()
      const committedId = getCommittedId(node.id, node.text)
      updateZoomForCommittedId(node.id, committedId)
      setTree((prev) => {
        const treeWithCommittedId =
          committedId === node.id
            ? prev
            : upd(prev, node.id, (target) => {
                target.id = committedId
              })
        return outdentN(treeWithCommittedId, committedId)
      })
    } else if (event.key === 'Backspace' && node.text === '') {
      event.preventDefault()
      setTree((prev) => rem(prev, node.id))
      setEditingId(null)
    } else if (event.key === 'Escape') {
      const committedId = getCommittedId(node.id, node.text)
      updateZoomForCommittedId(node.id, committedId)
      setTree((prev) => {
        if (committedId === node.id) {
          return prev
        }

        return upd(prev, node.id, (target) => {
          target.id = committedId
        })
      })
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
          const relatedTarget = event.relatedTarget as globalThis.Node | null
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
          <ChevronRight className="arr" aria-hidden="true" />
        </button>

        <button
          className={`check${isFolder ? ' folder' : ''}${allDone ? ' done' : someDone ? ' part' : ''}`}
          onClick={() =>
            !isFolder && setTree((prev) => toggleTree(prev, node.id))
          }
          disabled={isFolder}
          title={
            isFolder
              ? 'Category (not completable)'
              : hasKids
                ? allDone
                  ? 'Uncheck all'
                  : 'Check all'
                : node.completed
                  ? 'Uncheck'
                  : 'Check'
          }
        >
          {isFolder ? (
            <FolderTree className="icon-xs" aria-hidden="true" />
          ) : allDone ? (
            <Check className="icon-xs" aria-hidden="true" />
          ) : someDone ? (
            <Minus className="icon-xs" aria-hidden="true" />
          ) : null}
        </button>

        {isEditing ? (
          <input
            className="node-input"
            autoFocus
            value={node.text}
            onChange={(event) => {
              const nextText = event.target.value
              setTree((prev) =>
                upd(prev, node.id, (target) => {
                  target.text = nextText
                }),
              )
              setZoom((prev) =>
                prev.map((crumb) =>
                  crumb.id === node.id ? { ...crumb, text: nextText } : crumb,
                ),
              )
            }}
            onKeyDown={onKey}
            onBlur={() => {
              const committedId = getCommittedId(node.id, node.text)
              updateZoomForCommittedId(node.id, committedId)
              setTree((prev) => {
                if (committedId === node.id) {
                  return prev
                }

                return upd(prev, node.id, (target) => {
                  target.id = committedId
                })
              })
              setEditingId(null)
            }}
            placeholder="Task name..."
          />
        ) : (
          <span
            className={`node-text${isFolder ? ' folder' : ''}${allDone ? ' done' : ''}`}
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
            title={node.starred ? 'Unpin from Harvest' : 'Pin to Harvest'}
            onClick={() =>
              setTree((prev) =>
                upd(prev, node.id, (target) => {
                  target.starred = !target.starred
                }),
              )
            }
          >
            {node.starred ? (
              <Wheat className="icon-xs" aria-hidden="true" />
            ) : (
              <WheatOff className="icon-xs" aria-hidden="true" />
            )}
          </button>
          <button
            ref={moreRef}
            className="act more"
            title="More actions"
            onClick={(e) => {
              e.stopPropagation()
              openMenu()
            }}
          >
            <MoreHorizontal className="icon-xs" aria-hidden="true" />
          </button>
        </span>
      </div>

      {dropPos === 'after' && (
        <div className="drop-line" style={{ marginLeft: paddingLeft + 16 }} />
      )}

      {hasKids && !node.collapsed && (
        <div>
          {node.children.map((child) => (
            <TodoNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}

      {menuOpen &&
        createPortal(
          <>
            <div
              className="node-menu-backdrop"
              onClick={() => setMenuOpen(false)}
            />
            <div
              className="node-menu"
              style={menuStyle}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="node-menu-item"
                onClick={() => {
                  setTree((prev) =>
                    upd(prev, node.id, (target) => {
                      const nextKind =
                        target.kind === 'folder' ? 'task' : 'folder'
                      target.kind = nextKind
                      if (nextKind === 'folder') {
                        target.completed = false
                      }
                    }),
                  )
                  setMenuOpen(false)
                }}
              >
                {isFolder ? (
                  <Square className="icon-xs" aria-hidden="true" />
                ) : (
                  <FolderTree className="icon-xs" aria-hidden="true" />
                )}
                {isFolder ? 'Convert to task' : 'Convert to category'}
              </button>
              {hasKids && (
                <button
                  className="node-menu-item"
                  onClick={() => {
                    const nextZoom = findBreadcrumbPath(tree, node.id)
                    if (nextZoom) setZoom(nextZoom)
                    setMenuOpen(false)
                  }}
                >
                  <ZoomIn className="icon-xs" aria-hidden="true" />
                  Zoom in
                </button>
              )}
              <button
                className="node-menu-item del"
                onClick={() => {
                  setTree((prev) => rem(prev, node.id))
                  setMenuOpen(false)
                }}
              >
                <Trash2 className="icon-xs" aria-hidden="true" />
                Delete
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
