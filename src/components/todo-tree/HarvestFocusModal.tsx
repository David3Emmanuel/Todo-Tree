import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { X } from 'lucide-react'
import { FocusPomodoro } from './FocusPomodoro'
import { upd } from './tree-utils'
import type { TreeNode } from './types'

type HarvestFocusModalProps = {
  focusRoot: TreeNode
  setTree: Dispatch<SetStateAction<TreeNode[]>>
  onClose: () => void
  children: React.ReactNode
}

export function HarvestFocusModal({
  focusRoot,
  setTree,
  onClose,
  children,
}: HarvestFocusModalProps) {
  const [isNoteOpen, setIsNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState(focusRoot.note ?? '')
  const [stickyOffset, setStickyOffset] = useState({ x: 0, y: 0 })
  const [isStickyDragging, setIsStickyDragging] = useState(false)
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const stickyDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    elementWidth: number
    elementHeight: number
    startLeft: number
    startTop: number
  } | null>(null)
  const stickyDraggedRef = useRef(false)

  useEffect(() => {
    setIsNoteOpen(false)
    setNoteDraft(focusRoot.note ?? '')
    setStickyOffset({ x: 0, y: 0 })
    setIsStickyDragging(false)
  }, [focusRoot.id, focusRoot.note])

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const clamp = () => {
      const rect = stage.getBoundingClientRect()
      const padding = 8
      let dx = 0
      let dy = 0

      if (rect.left < padding) {
        dx = padding - rect.left
      } else if (rect.right > window.innerWidth - padding) {
        dx = window.innerWidth - padding - rect.right
      }

      if (rect.top < padding) {
        dy = padding - rect.top
      } else if (rect.bottom > window.innerHeight - padding) {
        dy = window.innerHeight - padding - rect.bottom
      }

      if (dx !== 0 || dy !== 0) {
        setStickyOffset((prev) => ({
          x: prev.x + dx,
          y: prev.y + dy,
        }))
      }
    }

    clamp()
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [isNoteOpen])

  useEffect(() => {
    if (!isNoteOpen) {
      return
    }

    const input = noteInputRef.current
    if (!input) {
      return
    }

    const end = input.value.length
    input.focus()
    input.setSelectionRange(end, end)
  }, [isNoteOpen])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const drag = stickyDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) {
        return
      }

      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY

      if (!stickyDraggedRef.current) {
        const movedFarEnough = Math.abs(dx) > 4 || Math.abs(dy) > 4
        if (!movedFarEnough) {
          return
        }

        stickyDraggedRef.current = true
        setIsStickyDragging(true)
      }

      const tentativeLeft = drag.startLeft + dx
      const tentativeTop = drag.startTop + dy
      const padding = 8

      const clampedLeft = Math.max(
        padding,
        Math.min(tentativeLeft, window.innerWidth - drag.elementWidth - padding),
      )
      const clampedTop = Math.max(
        padding,
        Math.min(tentativeTop, window.innerHeight - drag.elementHeight - padding),
      )

      const diffX = clampedLeft - drag.startLeft
      const diffY = clampedTop - drag.startTop

      setStickyOffset({
        x: drag.originX + diffX,
        y: drag.originY + diffY,
      })
    }

    const stopDrag = (event: PointerEvent) => {
      const drag = stickyDragRef.current
      if (!drag || drag.pointerId !== event.pointerId) {
        return
      }

      stickyDragRef.current = null
      setIsStickyDragging(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDrag)
    window.addEventListener('pointercancel', stopDrag)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopDrag)
      window.removeEventListener('pointercancel', stopDrag)
    }
  }, [])

  const commitNote = (nextNote: string) => {
    setTree((prev) =>
      upd(prev, focusRoot.id, (target) => {
        target.note = nextNote.trim() || undefined
      }),
    )
  }

  return (
    <div className="focus-modal-backdrop" onClick={onClose}>
      <section
        className="focus-modal island-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Harvest subtree"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="focus-modal-head">
          <div>
            <div className="suggestions-kicker">Harvest</div>
            <h2 className="focus-modal-title">
              {focusRoot.text || 'Untitled task'}
            </h2>
          </div>
          <button
            className="focus-close-btn"
            onClick={onClose}
            aria-label="Close harvest modal"
            title="Close"
          >
            <X className="icon-sm" aria-hidden="true" />
          </button>
        </div>
        <div
          ref={stageRef}
          className={`focus-note-stage${isNoteOpen ? ' open' : ' closed'}`}
          aria-label="Sticky note"
          style={{
            transform: `translate3d(${stickyOffset.x}px, ${stickyOffset.y}px, 0)`,
          }}
        >
          {isNoteOpen ? (
            <div className="focus-note-card">
              <textarea
                ref={noteInputRef}
                className="focus-note-input"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                onBlur={() => {
                  commitNote(noteDraft)
                  setIsNoteOpen(false)
                }}
                placeholder="Add a sticky note..."
                rows={6}
                autoFocus
                aria-label="Sticky note text"
              />
              <div className="focus-note-fold" aria-hidden="true" />
            </div>
          ) : (
            <button
              className="focus-note-toggle"
              type="button"
              onPointerDown={(event) => {
                const stage = stageRef.current
                if (!stage) return
                const rect = stage.getBoundingClientRect()
                stickyDragRef.current = {
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  originX: stickyOffset.x,
                  originY: stickyOffset.y,
                  elementWidth: rect.width,
                  elementHeight: rect.height,
                  startLeft: rect.left,
                  startTop: rect.top,
                }
                stickyDraggedRef.current = false
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onClick={(event) => {
                if (stickyDraggedRef.current) {
                  event.preventDefault()
                  event.stopPropagation()
                  stickyDraggedRef.current = false
                  return
                }

                setNoteDraft(focusRoot.note ?? '')
                setIsNoteOpen(true)
              }}
              aria-label={
                focusRoot.note ? 'Open sticky note' : 'Add sticky note'
              }
              title={focusRoot.note ? 'Open sticky note' : 'Add sticky note'}
              style={{ cursor: isStickyDragging ? 'grabbing' : 'grab' }}
            >
              <span className="focus-note-label">
                {focusRoot.note?.trim() || 'Add sticky note'}
              </span>
            </button>
          )}
        </div>
        <FocusPomodoro />
        <div className="focus-modal-body">{children}</div>
      </section>
    </div>
  )
}
