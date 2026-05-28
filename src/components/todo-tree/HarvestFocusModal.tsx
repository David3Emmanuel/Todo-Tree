import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
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
  const [isEditingNote, setIsEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(focusRoot.note ?? '')

  useEffect(() => {
    setNoteDraft(focusRoot.note ?? '')
    setIsEditingNote(false)
  }, [focusRoot.id, focusRoot.note])

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
        <div className="focus-note-shell">
          {isEditingNote ? (
            <>
              <textarea
                className="focus-note-input"
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                placeholder="Add a sticky note..."
                rows={4}
              />
              <div className="focus-note-actions">
                <button
                  className="focus-note-save"
                  onClick={() => {
                    setTree((prev) =>
                      upd(prev, focusRoot.id, (target) => {
                        target.note = noteDraft.trim() || undefined
                      }),
                    )
                    setIsEditingNote(false)
                  }}
                >
                  Save
                </button>
                <button
                  className="focus-note-cancel"
                  onClick={() => {
                    setNoteDraft(focusRoot.note ?? '')
                    setIsEditingNote(false)
                  }}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : focusRoot.note ? (
            <button
              className="focus-note"
              onClick={() => setIsEditingNote(true)}
              title="Edit note"
            >
              {focusRoot.note}
            </button>
          ) : (
            <button
              className="focus-note focus-note-empty"
              onClick={() => setIsEditingNote(true)}
              title="Add note"
            >
              Add sticky note
            </button>
          )}
        </div>
        <FocusPomodoro />
        <div className="focus-modal-body">{children}</div>
      </section>
    </div>
  )
}
