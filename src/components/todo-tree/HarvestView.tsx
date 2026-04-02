import { useTodoCtx } from './todo-context'
import { getAllStarred, getProgress, toggleTree, upd } from './tree-utils'

export function HarvestView() {
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
