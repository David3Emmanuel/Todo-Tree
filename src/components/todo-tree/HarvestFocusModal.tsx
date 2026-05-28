import {
  useEffect,
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
  const noteInputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    setIsNoteOpen(false)
    setNoteDraft(focusRoot.note ?? '')
  }, [focusRoot.id, focusRoot.note])

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
          className={`focus-note-stage${isNoteOpen ? ' open' : ' closed'}`}
          aria-label="Sticky note"
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
              onClick={() => {
                setNoteDraft(focusRoot.note ?? '')
                setIsNoteOpen(true)
              }}
              aria-label={
                focusRoot.note ? 'Open sticky note' : 'Add sticky note'
              }
              title={focusRoot.note ? 'Open sticky note' : 'Add sticky note'}
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
