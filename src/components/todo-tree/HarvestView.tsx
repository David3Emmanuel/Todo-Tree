import { Check, FolderTree, Wheat, WheatOff, X } from 'lucide-react'
import { useTodoCtx } from './todo-context'
import { getHarvestSections, getProgress, toggleTree, upd } from './tree-utils'
import { HarvestFocusModal } from './HarvestFocusModal'
import { useFocus } from './useFocus'
import { FocusNode } from './FocusNode'
import type { Breadcrumb, HarvestPriority, HarvestTreeNode } from './types'

const SECTION_LABELS: Record<HarvestPriority, string> = {
  starred: 'Starred',
  today: 'Today',
  soon: 'Soon',
}

function findBreadcrumbPath(
  nodes: Parameters<typeof getHarvestSections>[0],
  targetId: string,
  path: Breadcrumb[] = [],
): Breadcrumb[] | null {
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

function HarvestItem({
  item,
  depth,
  openFocus,
  onUnpin,
  onClearUrgency,
}: {
  item: HarvestTreeNode
  depth: number
  openFocus: (id: string) => void
  onUnpin: (id: string) => void
  onClearUrgency: (id: string) => void
}) {
  const { setTree } = useTodoCtx()
  const node = item.node
  const isFolder = node.kind === 'folder'
  const { done, total } = getProgress(node)
  const allDone = !isFolder && total > 0 && done === total

  return (
    <div style={{ paddingLeft: depth * 20 }}>
      <div
        className="h-item can-focus"
        onClick={() => openFocus(node.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (
            (event.key === 'Enter' || event.key === ' ') &&
            !event.defaultPrevented
          ) {
            event.preventDefault()
            openFocus(node.id)
          }
        }}
        title="Open harvest subtree"
      >
        <button
          className={`check${isFolder ? ' folder' : ''}${allDone ? ' done' : ''}`}
          style={{ flexShrink: 0 }}
          onClick={(event) => {
            event.stopPropagation()
            if (!isFolder) {
              setTree((prev) => toggleTree(prev, node.id))
            }
          }}
          disabled={isFolder}
          title={isFolder ? 'Category (not completable)' : undefined}
        >
          {isFolder ? (
            <FolderTree className="icon-xs" aria-hidden="true" />
          ) : allDone ? (
            <Check className="icon-xs" aria-hidden="true" />
          ) : null}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontSize: 14,
              color: isFolder ? '#d9cbab' : allDone ? '#928c86' : '#e6dfd6',
              textDecoration: !isFolder && allDone ? 'line-through' : 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {node.text}
          </div>
          {depth === 0 && item.path.length > 0 && (
            <div className="h-path">{item.path.join(' > ')}</div>
          )}
        </div>
        {item.ownPriority === 'starred' && (
          <button
            className="act starred"
            title="Unpin"
            onClick={(event) => {
              event.stopPropagation()
              onUnpin(node.id)
            }}
          >
            <WheatOff className="icon-xs" aria-hidden="true" />
          </button>
        )}
        {(item.ownPriority === 'today' || item.ownPriority === 'soon') && (
          <button
            className="act"
            title="Clear urgency"
            onClick={(event) => {
              event.stopPropagation()
              onClearUrgency(node.id)
            }}
          >
            <X className="icon-xs" aria-hidden="true" />
          </button>
        )}
      </div>
      {item.harvestChildren.map((child) => (
        <HarvestItem
          key={child.node.id}
          item={child}
          depth={depth + 1}
          openFocus={openFocus}
          onUnpin={onUnpin}
          onClearUrgency={onClearUrgency}
        />
      ))}
    </div>
  )
}

export function HarvestView() {
  const { tree, setTree, setZoom } = useTodoCtx()
  const sections = getHarvestSections(tree)
  const { focusRoot, openFocus, closeFocus } = useFocus({ tree })

  const closeFocusAndZoomToRoot = () => {
    if (!focusRoot) {
      closeFocus()
      return
    }

    const nextZoom = findBreadcrumbPath(tree, focusRoot.id)
    if (nextZoom) {
      setZoom(nextZoom)
    }

    closeFocus()
  }

  const onUnpin = (id: string) => {
    setTree((prev) =>
      upd(prev, id, (target) => {
        target.starred = false
      }),
    )
  }

  const onClearUrgency = (id: string) => {
    setTree((prev) =>
      upd(prev, id, (target) => {
        target.urgency = undefined
      }),
    )
  }

  if (!sections.length) {
    return (
      <div className="empty">
        <Wheat className="empty-icon" aria-hidden="true" />
        <div>No pinned or urgent tasks</div>
        <div style={{ fontSize: 12, color: '#928c86' }}>
          Star tasks or mark them as Today/Soon to harvest them here
        </div>
      </div>
    )
  }

  return (
    <div className="harvest">
      {sections.map((section) => (
        <div key={section.priority} className="harvest-section">
          <div className="harvest-section-header">
            {SECTION_LABELS[section.priority]}
          </div>
          {section.items.map((item) => (
            <HarvestItem
              key={item.node.id}
              item={item}
              depth={0}
              openFocus={openFocus}
              onUnpin={onUnpin}
              onClearUrgency={onClearUrgency}
            />
          ))}
        </div>
      ))}

      {focusRoot && (
        <HarvestFocusModal focusRoot={focusRoot} onClose={closeFocus}>
          <FocusNode
            node={focusRoot}
            setTree={setTree}
            onActivate={closeFocusAndZoomToRoot}
          />
        </HarvestFocusModal>
      )}
    </div>
  )
}
