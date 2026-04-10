import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { createPortal } from 'react-dom'
import type { TreeNode } from './types'

type BlockerTaskOption = {
  id: string
  text: string
  pathLabel: string
  completed: boolean
}

type HideUntilTaskPickerProps = {
  tree: TreeNode[]
  excludeId: string
  onApply: (taskId: string) => void
}

function collectBlockerTaskOptions(
  nodes: TreeNode[],
  excludeId: string,
  path: string[] = [],
): BlockerTaskOption[] {
  const result: BlockerTaskOption[] = []

  for (const node of nodes) {
    const nextPath = [...path, node.text]
    if (node.id !== excludeId && node.kind !== 'folder') {
      result.push({
        id: node.id,
        text: node.text || 'Untitled task',
        pathLabel:
          path.map((crumb) => crumb || 'Untitled').join(' › ') || 'Root level',
        completed: node.completed,
      })
    }

    result.push(
      ...collectBlockerTaskOptions(node.children, excludeId, nextPath),
    )
  }

  return result
}

export function HideUntilTaskPicker({
  tree,
  excludeId,
  onApply,
}: HideUntilTaskPickerProps) {
  const [query, setQuery] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  const [panelStyle, setPanelStyle] = useState<CSSProperties | null>(null)

  const taskOptions = useMemo(
    () => collectBlockerTaskOptions(tree, excludeId),
    [excludeId, tree],
  )

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const visibleOptions = normalizedQuery
      ? taskOptions.filter((option) => {
          const haystack = `${option.text} ${option.pathLabel}`.toLowerCase()
          return haystack.includes(normalizedQuery)
        })
      : taskOptions

    return visibleOptions.slice(0, 8)
  }, [query, taskOptions])

  const selectedTask = useMemo(
    () => taskOptions.find((option) => option.id === selectedTaskId) ?? null,
    [selectedTaskId, taskOptions],
  )

  useLayoutEffect(() => {
    const updatePanelStyle = (): void => {
      const field = fieldRef.current
      if (!field || !focused) {
        setPanelStyle(null)
        return
      }

      const rect = field.getBoundingClientRect()
      setPanelStyle({
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.bottom + 6}px`,
        width: `${rect.width}px`,
        zIndex: 99999,
      })
    }

    updatePanelStyle()
    window.addEventListener('resize', updatePanelStyle)
    window.addEventListener('scroll', updatePanelStyle, true)

    return () => {
      window.removeEventListener('resize', updatePanelStyle)
      window.removeEventListener('scroll', updatePanelStyle, true)
    }
  }, [focused])

  const floatingList = panelStyle
    ? createPortal(
        <div
          className="suggestion-task-list suggestion-task-list-floating"
          data-suggestion-picker-portal="true"
          role="listbox"
          style={panelStyle}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => {
              const isSelected = option.id === selectedTaskId

              return (
                <button
                  key={option.id}
                  className={`suggestion-task-option${isSelected ? ' selected' : ''}`}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault()
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    setSelectedTaskId(option.id)
                    setQuery(option.text)
                  }}
                  title={option.pathLabel}
                  role="option"
                  aria-selected={isSelected}
                >
                  <span className="suggestion-task-option-main">
                    {option.text}
                  </span>
                  <span className="suggestion-task-option-meta">
                    {option.completed ? 'done' : 'open'}
                    {' · '}
                    {option.pathLabel}
                  </span>
                </button>
              )
            })
          ) : (
            <div className="suggestion-task-empty">
              No blocker tasks match that search.
            </div>
          )}
        </div>,
        document.body,
      )
    : null
  return (
    <div className="suggestion-task-picker">
      <div className="suggestion-task-field" ref={fieldRef}>
        <input
          className="suggestion-task-input"
          type="text"
          value={query}
          placeholder="Search blocker task"
          onChange={(event) => {
            setQuery(event.target.value)
            setSelectedTaskId(null)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && filteredOptions.length > 0) {
              event.preventDefault()
              const [firstOption] = filteredOptions
              if (selectedTaskId === firstOption.id) {
                onApply(firstOption.id)
              } else {
                setSelectedTaskId(firstOption.id)
                setQuery(firstOption.text)
              }
            }
          }}
        />
      </div>
      {floatingList}
      <div className="suggestion-task-selected">
        {selectedTask ? (
          <>
            Selected: {selectedTask.text}{' '}
            <span>· {selectedTask.pathLabel}</span>
          </>
        ) : (
          'Pick a blocker task to hide until it is completed.'
        )}
      </div>
      <button
        className="suggestion-hide-apply"
        onClick={() => {
          if (!selectedTask) {
            return
          }

          onApply(selectedTask.id)
        }}
        disabled={!selectedTask}
      >
        Hide until task
      </button>
    </div>
  )
}
