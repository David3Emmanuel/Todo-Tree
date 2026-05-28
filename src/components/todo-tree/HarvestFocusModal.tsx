import { type Dispatch, type SetStateAction } from 'react'
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
        <textarea
          className="focus-note-input"
          value={focusRoot.note ?? ''}
          onChange={(event) => {
            const nextNote = event.target.value
            setTree((prev) =>
              upd(prev, focusRoot.id, (target) => {
                target.note = nextNote || undefined
              }),
            )
          }}
          placeholder="Add a sticky note..."
          rows={6}
          autoFocus
          aria-label="Sticky note"
        />
        <FocusPomodoro />
        <div className="focus-modal-body">{children}</div>
      </section>
    </div>
  )
}
