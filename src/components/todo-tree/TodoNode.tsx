import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Portal } from './Portal'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  EyeOff,
  ListPlus,
  MoveRight,
  Square,
  FolderTree,
  Minus,
  MoreHorizontal,
  Trash2,
  Wheat,
  WheatOff,
  X,
  ZoomIn,
} from 'lucide-react'
import { useTodoCtx } from './todo-context'
import type { DropPosition, TreeNode } from './types'
import {
  addSib,
  classifyDueDate,
  countDescendants,
  formatDueDate,
  generateChildNodes,
  getProgress,
  indentN,
  makeNode,
  makeUniqueUid,
  moveN,
  outdentN,
  parseSubtaskPattern,
  rem,
  toggleTree,
  upd,
  findNode,
  flattenVisibleNodes,
} from './tree-utils'
import { TreeSearchDropdown } from './TreeSearchDropdown'

function getSubtreeIds(n: TreeNode): Set<string> {
  const ids = new Set<string>()
  const walk = (nd: TreeNode) => {
    ids.add(nd.id)
    nd.children.forEach(walk)
  }
  walk(n)
  return ids
}

export function TodoNode({
  node,
  depth = 0,
}: {
  node: TreeNode
  depth?: number
}) {
    const {
      tree,
      setTree,
      editingId,
      setEditingId,
      zoom,
      setZoom,
      openHideMenu,
      openFocus,
    } = useTodoCtx()
  const [dropPos, setDropPos] = useState<DropPosition | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})
  const [movePickerOpen, setMovePickerOpen] = useState(false)
  const pendingEditingIdRef = useRef<string | null>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (!menuOpen) setMovePickerOpen(false)
  }, [menuOpen])

  const openMenu = () => {
    if (!moreRef.current) return
    const isMobile = window.innerWidth <= 640
    if (isMobile) {
      setMenuStyle({ zIndex: 9999 })
    } else {
      const rect = moreRef.current.getBoundingClientRect()
      const MENU_WIDTH = 240
      const idealLeft = rect.right - MENU_WIDTH
      const left = Math.max(
        8,
        Math.min(idealLeft, window.innerWidth - MENU_WIDTH - 8),
      )

      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const placeBelow = spaceBelow >= spaceAbove || spaceBelow >= 350

      if (placeBelow) {
        setMenuStyle({
          position: 'fixed',
          left: `${left}px`,
          top: `${rect.bottom + 4}px`,
          maxHeight: `${spaceBelow - 14}px`,
          overflowY: 'auto',
          width: `${MENU_WIDTH}px`,
          zIndex: 9999,
        })
      } else {
        setMenuStyle({
          position: 'fixed',
          left: `${left}px`,
          bottom: `${window.innerHeight - rect.top + 4}px`,
          maxHeight: `${spaceAbove - 14}px`,
          overflowY: 'auto',
          width: `${MENU_WIDTH}px`,
          zIndex: 9999,
        })
      }
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

  const toggleStar = () => {
    setTree((prev) =>
      upd(prev, node.id, (target) => {
        target.starred = !target.starred
      }),
    )
  }

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

  const applyExpansion = (
    prev: TreeNode[],
    nodeId: string,
    finalText: string,
    committedId: string,
    expanded: ReturnType<typeof parseSubtaskPattern>,
  ): TreeNode[] => {
    const needsIdOrTextUpdate =
      committedId !== nodeId || (expanded && finalText !== node.text)
    let next = needsIdOrTextUpdate
      ? upd(prev, nodeId, (t) => {
          t.id = committedId
          if (expanded) t.text = finalText
        })
      : prev
    if (expanded) {
      const children = generateChildNodes(
        next,
        expanded.childPrefix,
        expanded.start,
        expanded.end,
      )
      next = upd(next, committedId, (t) => {
        t.children.push(...children)
        t.collapsed = false
      })
    }
    return next
  }

  const onKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const zoomedNode = zoom.length
        ? findNode(tree, zoom[zoom.length - 1].id)
        : null
      const display = zoomedNode ? zoomedNode.children : tree
      const visible = flattenVisibleNodes(display)
      const idx = visible.findIndex((n) => n.id === node.id)
      const nextIdx = event.key === 'ArrowUp' ? idx - 1 : idx + 1
      if (nextIdx >= 0 && nextIdx < visible.length) {
        setEditingId(visible[nextIdx].id)
      }
      return
    }
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      const expanded = parseSubtaskPattern(node.text)
      const finalText = expanded ? expanded.parentText : node.text
      const committedId = getCommittedId(node.id, finalText)
      updateZoomForCommittedId(node.id, committedId)
      setTree((prev) => {
        const next = applyExpansion(
          prev,
          node.id,
          finalText,
          committedId,
          expanded,
        )
        if (expanded) return next
        const childNode = makeNode(next)
        pendingEditingIdRef.current = childNode.id
        return upd(next, committedId, (target) => {
          target.children.push(childNode)
          target.collapsed = false
        })
      })
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const expanded = parseSubtaskPattern(node.text)
      const finalText = expanded ? expanded.parentText : node.text
      const committedId = getCommittedId(node.id, finalText)
      updateZoomForCommittedId(node.id, committedId)
      setTree((prev) => {
        const next = applyExpansion(
          prev,
          node.id,
          finalText,
          committedId,
          expanded,
        )
        if (expanded) return next
        const nextNode = makeNode(next)
        pendingEditingIdRef.current = nextNode.id
        return addSib(next, committedId, nextNode)
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
      const expanded = parseSubtaskPattern(node.text)
      const finalText = expanded ? expanded.parentText : node.text
      const committedId = getCommittedId(node.id, finalText)
      updateZoomForCommittedId(node.id, committedId)
      setTree((prev) =>
        applyExpansion(prev, node.id, finalText, committedId, expanded),
      )
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
        data-node-id={node.id}
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
              const expanded = parseSubtaskPattern(node.text)
              const finalText = expanded ? expanded.parentText : node.text
              const committedId = getCommittedId(node.id, finalText)
              updateZoomForCommittedId(node.id, committedId)
              setTree((prev) =>
                applyExpansion(prev, node.id, finalText, committedId, expanded),
              )
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

        {node.dueDate && (
          <span
            className={`due-badge due-badge--${classifyDueDate(node.dueDate)}${allDone ? ' due-badge--done' : ''}`}
            title={`Due: ${node.dueDate}`}
            aria-label={`Due ${formatDueDate(node.dueDate)}`}
          >
            {formatDueDate(node.dueDate)}
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

        <button
          className={`act pin-action${node.starred ? ' starred' : ''}`}
          title={node.starred ? 'Unpin from Harvest' : 'Pin to Harvest'}
          onClick={toggleStar}
        >
          {node.starred ? (
            <Wheat className="icon-xs" aria-hidden="true" />
          ) : (
            <WheatOff className="icon-xs" aria-hidden="true" />
          )}
        </button>

        <span className="actions">
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

      <Portal open={menuOpen}>
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
            {movePickerOpen ? (
              <div className="node-menu-move-picker">
                <button
                  className="node-menu-item node-menu-move-back"
                  onClick={() => setMovePickerOpen(false)}
                >
                  <ChevronLeft className="icon-xs" aria-hidden="true" />
                  Back
                </button>
                <TreeSearchDropdown
                  tree={tree}
                  excludeIds={getSubtreeIds(node)}
                  onZoom={(_, dest) => {
                    setTree((prev) => moveN(prev, node.id, dest.id, 'inside'))
                    setMenuOpen(false)
                  }}
                />
              </div>
            ) : (
              <>
                <button
                  className="node-menu-item"
                  onClick={() => {
                    setTree((prev) => {
                      const childNode = makeNode(prev)
                      pendingEditingIdRef.current = childNode.id
                      return upd(prev, node.id, (target) => {
                        target.children.push(childNode)
                        target.collapsed = false
                      })
                    })
                    setMenuOpen(false)
                  }}
                >
                  <ListPlus className="icon-xs" aria-hidden="true" />
                  Add subtask
                </button>
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
                <button className="node-menu-item" onClick={toggleStar}>
                  {node.starred ? (
                    <Wheat className="icon-xs" aria-hidden="true" />
                  ) : (
                    <WheatOff className="icon-xs" aria-hidden="true" />
                  )}
                  {node.starred ? 'Unpin from Harvest' : 'Pin to Harvest'}
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
                  className="node-menu-item"
                  onClick={() => {
                    setMenuOpen(false)
                    openFocus(node.id)
                  }}
                >
                  <ZoomIn className="icon-xs" aria-hidden="true" />
                  Focus
                </button>
                <button
                  className="node-menu-item"
                  onClick={() => {
                    dateInputRef.current?.showPicker?.()
                  }}
                >
                  <CalendarDays className="icon-xs" aria-hidden="true" />
                  {node.dueDate
                    ? `Due: ${formatDueDate(node.dueDate)}`
                    : 'Set due date'}
                </button>
                <input
                  ref={dateInputRef}
                  type="date"
                  className="date-input-hidden"
                  value={node.dueDate ?? ''}
                  onChange={(e) => {
                    const val = e.target.value
                    setTree((prev) =>
                      upd(prev, node.id, (target) => {
                        target.dueDate = val || undefined
                      }),
                    )
                    setMenuOpen(false)
                  }}
                />
                {node.dueDate && (
                  <button
                    className="node-menu-item"
                    onClick={() => {
                      setTree((prev) =>
                        upd(prev, node.id, (target) => {
                          target.dueDate = undefined
                        }),
                      )
                      setMenuOpen(false)
                    }}
                  >
                    <X className="icon-xs" aria-hidden="true" />
                    Clear due date
                  </button>
                )}
                <button
                  className="node-menu-item"
                  onClick={() => {
                    setMenuOpen(false)
                    openHideMenu(node.id)
                  }}
                >
                  <EyeOff className="icon-xs" aria-hidden="true" />
                  Hide task
                </button>
                <button
                  className="node-menu-item"
                  onClick={() => setMovePickerOpen(true)}
                >
                  <MoveRight className="icon-xs" aria-hidden="true" />
                  Move to…
                </button>
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
              </>
            )}
          </div>
        </>
      </Portal>
    </>
  )
}
