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

const PANEL_WIDTH = 280

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
  onZoom,
}: {
  tree: TreeNode[]
  onZoom: (path: Breadcrumb[], node: TreeNode) => void
}) {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null)
  const fieldRef = useRef<HTMLInputElement | null>(null)

  const allOptions = useMemo(() => collectSearchOptions(tree), [tree])

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allOptions
      .filter((opt) => opt.node.text.toLowerCase().includes(q))
      .slice(0, 10)
  }, [query, allOptions])

  const confirmOption = (opt: SearchOption) => {
    onZoom(opt.path, opt.node)
    setQuery('')
    setSelectedId(null)
    fieldRef.current?.blur()
  }

  const isOpen = focused && query.trim().length > 0

  useLayoutEffect(() => {
    const update = (): void => {
      const field = fieldRef.current
      if (!field || !focused) {
        setPanelStyle(null)
        return
      }
      const rect = field.getBoundingClientRect()
      const idealLeft = rect.left + rect.width / 2 - PANEL_WIDTH / 2
      const left = Math.max(
        8,
        Math.min(idealLeft, window.innerWidth - PANEL_WIDTH - 8),
      )
      setPanelStyle({
        position: 'fixed',
        left: `${left}px`,
        top: `${rect.bottom + 6}px`,
        width: `${PANEL_WIDTH}px`,
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
  }, [focused])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setQuery('')
        fieldRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  const panel =
    isOpen && panelStyle
      ? createPortal(
          <div
            className="tree-search-panel"
            data-tree-search-panel="true"
            style={panelStyle}
            onMouseDown={(e) => e.preventDefault()}
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => {
                const parentPath = opt.path
                  .slice(0, -1)
                  .map((c) => c.text || 'Untitled')
                  .join(' › ')
                return (
                  <button
                    key={opt.node.id}
                    className={`tree-search-option${selectedId === opt.node.id ? ' selected' : ''}`}
                    type="button"
                    onClick={() => confirmOption(opt)}
                    role="option"
                    aria-selected={selectedId === opt.node.id}
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
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <input
        ref={fieldRef}
        className="tree-search-input"
        type="search"
        value={query}
        placeholder="Search…"
        onChange={(e) => {
          setQuery(e.target.value)
          setSelectedId(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && filteredOptions.length > 0) {
            e.preventDefault()
            const first = filteredOptions[0]
            if (selectedId === first.node.id) {
              confirmOption(first)
            } else {
              setSelectedId(first.node.id)
            }
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label="Search tasks"
      />
      {panel}
    </>
  )
}
