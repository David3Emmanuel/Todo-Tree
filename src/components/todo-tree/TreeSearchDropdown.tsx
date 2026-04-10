import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import type { Breadcrumb, TreeNode } from './types'

type SearchOption = {
  node: TreeNode
  path: Breadcrumb[]
}

function collectSearchOptions(
  nodes: TreeNode[],
  path: Breadcrumb[] = [],
): SearchOption[] {
  const result: SearchOption[] = []
  for (const node of nodes) {
    const breadcrumbPath = [...path, { id: node.id, text: node.text }]
    result.push({ node, path: breadcrumbPath })
    result.push(...collectSearchOptions(node.children, breadcrumbPath))
  }
  return result
}

export function TreeSearchDropdown({
  tree,
  anchorRef,
  onZoom,
  onClose,
}: {
  tree: TreeNode[]
  anchorRef: React.RefObject<HTMLButtonElement | null>
  onZoom: (path: Breadcrumb[], node: TreeNode) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const allOptions = useMemo(() => collectSearchOptions(tree), [tree])

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allOptions
      .filter((opt) => opt.node.text.toLowerCase().includes(q))
      .slice(0, 10)
  }, [query, allOptions])

  useLayoutEffect(() => {
    const update = (): void => {
      const btn = anchorRef.current
      if (!btn) {
        setPanelStyle(null)
        return
      }
      const rect = btn.getBoundingClientRect()
      setPanelStyle({
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.bottom + 6}px`,
        width: '20rem',
        zIndex: 99999,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [anchorRef])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const panel = document.querySelector('[data-tree-search-panel="true"]')
      const btn = anchorRef.current
      if (
        panel &&
        !panel.contains(target) &&
        (!btn || !btn.contains(target))
      ) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onClick, true)
    }
  }, [anchorRef, onClose])

  if (!panelStyle) return null

  return createPortal(
    <div
      className="tree-search-panel"
      data-tree-search-panel="true"
      style={panelStyle}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        className="tree-search-input"
        type="text"
        value={query}
        placeholder="Search tasks and folders..."
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() && (
        <div className="tree-search-list" role="listbox">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt) => {
              const parentPath = opt.path
                .slice(0, -1)
                .map((c) => c.text || 'Untitled')
                .join(' › ')
              return (
                <button
                  key={opt.node.id}
                  className="tree-search-option"
                  type="button"
                  onClick={() => {
                    onZoom(opt.path, opt.node)
                    onClose()
                  }}
                  role="option"
                  aria-selected={false}
                >
                  <span className="tree-search-option-main">
                    {opt.node.text || 'Untitled'}
                  </span>
                  <span className="tree-search-option-meta">
                    {parentPath || 'Root level'}
                  </span>
                </button>
              )
            })
          ) : (
            <div className="tree-search-empty">No tasks match.</div>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}
