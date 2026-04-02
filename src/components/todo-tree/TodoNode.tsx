import { useState } from 'react'
import { useTodoCtx } from './todo-context'
import type { DropPosition, TreeNode } from './types'
import {
  addSib,
  countDescendants,
  getProgress,
  indentN,
  makeNode,
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
            <TodoNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  )
}
