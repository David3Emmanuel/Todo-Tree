import { useMemo } from 'react'
import { Check, Cloud, FolderTree, Monitor } from 'lucide-react'
import type { LoginReconcileConflict } from './usePersistence'
import {
  buildDiffedTree,
  computeDiffSummary,
  flattenNodes,
  getGhostRoots,
  type DiffedNode,
  type DiffSummary,
} from './treeDiff'
import { classifyDueDate, formatDueDate } from './tree-utils'
import type { TreeNode } from './types'

function formatTimeAgo(ms: number | undefined): string {
  if (!ms) return 'unknown time'
  const diff = Date.now() - ms
  if (diff < 60_000) return 'just now'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(diff / 3_600_000)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function countDescendants(nodes: DiffedNode[]): number {
  let n = 0
  for (const dn of nodes) n += 1 + countDescendants(dn.children)
  return n
}

function DiffNodeRow({ dn, depth = 0 }: { dn: DiffedNode; depth?: number }) {
  const { node, status, subtreeClean, children } = dn
  const isFolder = node.kind === 'folder'
  const hiddenCount = subtreeClean ? countDescendants(children) : 0

  return (
    <>
      <div
        className={`diff-node diff-node-${status}`}
        style={{ paddingLeft: `${0.55 + depth * 1.1}rem` }}
      >
        <span className="diff-node-icon">
          {isFolder ? (
            <FolderTree size={10} />
          ) : node.completed ? (
            <Check size={10} />
          ) : (
            <span className="diff-node-dot" />
          )}
        </span>
        <span className="diff-node-text">{node.text || '(untitled)'}</span>
        {node.dueDate && (
          <span className={`due-badge due-badge--${classifyDueDate(node.dueDate)}`}>
            {formatDueDate(node.dueDate)}
          </span>
        )}
        {status !== 'unchanged' && (
          <span className={`diff-badge diff-badge-${status}`}>
            {status === 'added' ? 'new here' : 'changed'}
          </span>
        )}
        {hiddenCount > 0 && (
          <span className="diff-collapsed-hint">+{hiddenCount}</span>
        )}
      </div>
      {!subtreeClean &&
        children.map((child) => (
          <DiffNodeRow key={child.node.id} dn={child} depth={depth + 1} />
        ))}
    </>
  )
}

function GhostNodeRow({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const isFolder = node.kind === 'folder'

  return (
    <>
      <div
        className="diff-node diff-node-ghost"
        style={{ paddingLeft: `${0.55 + depth * 1.1}rem` }}
      >
        <span className="diff-node-icon">
          {isFolder ? (
            <FolderTree size={10} />
          ) : (
            <span className="diff-node-dot" />
          )}
        </span>
        <span className="diff-node-text">{node.text || '(untitled)'}</span>
        <span className="diff-badge diff-badge-ghost">not here</span>
      </div>
      {node.children.map((child) => (
        <GhostNodeRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  )
}

function SummaryPills({ summary }: { summary: DiffSummary }) {
  const { added, modified, removed } = summary
  const hasAny = added > 0 || modified > 0 || removed > 0

  if (!hasAny) {
    return (
      <div className="diff-summary-pills">
        <span className="diff-summary-pill diff-summary-pill-clean">
          no changes
        </span>
      </div>
    )
  }

  return (
    <div className="diff-summary-pills">
      {added > 0 && (
        <span className="diff-summary-pill diff-summary-pill-added">
          {added === 1 ? '1 new' : `${added} new`}
        </span>
      )}
      {modified > 0 && (
        <span className="diff-summary-pill diff-summary-pill-modified">
          {modified === 1 ? '1 changed' : `${modified} changed`}
        </span>
      )}
      {removed > 0 && (
        <span className="diff-summary-pill diff-summary-pill-removed">
          {removed === 1 ? '1 missing' : `${removed} missing`}
        </span>
      )}
    </div>
  )
}

function DiffPanel({
  label,
  icon,
  updatedAtMs,
  diffed,
  summary,
  ghostRoots,
  isRecommended,
  isPrimary,
  onChoose,
  isDisabled,
}: {
  label: string
  icon: React.ReactNode
  updatedAtMs: number | undefined
  diffed: DiffedNode[]
  summary: DiffSummary
  ghostRoots: TreeNode[]
  isRecommended: boolean
  isPrimary: boolean
  onChoose: () => void
  isDisabled: boolean
}) {
  const hasContent = diffed.length > 0 || ghostRoots.length > 0

  return (
    <div
      className={`diff-panel${isRecommended ? ' diff-panel-recommended' : ''}`}
    >
      <div className="diff-panel-header">
        <div className="diff-panel-label">
          <span className="diff-panel-icon">{icon}</span>
          <span className="diff-panel-title">{label}</span>
          {isRecommended && (
            <span className="diff-panel-rec-badge">Recommended</span>
          )}
        </div>
        <div className="diff-panel-meta">
          Updated {formatTimeAgo(updatedAtMs)}
        </div>
        <SummaryPills summary={summary} />
      </div>

      <div className="diff-panel-tree">
        {!hasContent ? (
          <div className="diff-panel-empty">No items</div>
        ) : (
          <>
            {diffed.map((dn) => (
              <DiffNodeRow key={dn.node.id} dn={dn} />
            ))}
            {ghostRoots.length > 0 && (
              <div className="diff-ghost-section">
                <div className="diff-ghost-divider">Not in this version</div>
                {ghostRoots.map((node) => (
                  <GhostNodeRow key={node.id} node={node} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <button
        className={`diff-choose-btn${isPrimary ? ' diff-choose-btn-primary' : ''}`}
        onClick={onChoose}
        disabled={isDisabled}
      >
        Use this version
      </button>
    </div>
  )
}

type Props = {
  conflict: LoginReconcileConflict
  isResolving: boolean
  error: string | null
  onKeepLocal: () => void
  onKeepCloud: () => void
  onDismiss: () => void
}

export function ConflictDiffModal({
  conflict,
  isResolving,
  error,
  onKeepLocal,
  onKeepCloud,
  onDismiss,
}: Props) {
  const { localState, remoteState } = conflict

  const localFlat = useMemo(
    () => flattenNodes(localState.tree),
    [localState.tree],
  )
  const remoteFlat = useMemo(
    () => flattenNodes(remoteState.tree),
    [remoteState.tree],
  )

  const localDiffed = useMemo(
    () => buildDiffedTree(localState.tree, remoteFlat),
    [localState.tree, remoteFlat],
  )
  const remoteDiffed = useMemo(
    () => buildDiffedTree(remoteState.tree, localFlat),
    [remoteState.tree, localFlat],
  )

  const localSummary = useMemo(
    () => computeDiffSummary(localDiffed, remoteFlat, localState.tree),
    [localDiffed, remoteFlat, localState.tree],
  )
  const remoteSummary = useMemo(
    () => computeDiffSummary(remoteDiffed, localFlat, remoteState.tree),
    [remoteDiffed, localFlat, remoteState.tree],
  )

  const localGhostRoots = useMemo(
    () => getGhostRoots(localFlat, remoteState.tree),
    [localFlat, remoteState.tree],
  )
  const remoteGhostRoots = useMemo(
    () => getGhostRoots(remoteFlat, localState.tree),
    [remoteFlat, localState.tree],
  )

  const localIsNewer =
    (localState.localUpdatedAtMs ?? 0) >= (remoteState.serverUpdatedAtMs ?? 0)

  return (
    <div className="reconcile-modal-backdrop" onClick={onDismiss}>
      <section
        className="reconcile-modal reconcile-diff-modal island-shell"
        role="dialog"
        aria-modal="true"
        aria-label="Review sync conflict"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reconcile-modal-head">
          <div className="reconcile-kicker">Sync conflict</div>
          <h2 className="reconcile-title">
            Your device and the cloud have different versions
          </h2>
          <p className="reconcile-copy">
            Both were updated since the last sync. Review the differences below,
            then choose which version to keep.
          </p>
        </div>

        {error && (
          <div className="reconcile-error" role="alert">
            {error}
          </div>
        )}

        <div className="diff-panels">
          <DiffPanel
            label="On this device"
            icon={<Monitor size={13} />}
            updatedAtMs={localState.localUpdatedAtMs}
            diffed={localDiffed}
            summary={localSummary}
            ghostRoots={localGhostRoots}
            isRecommended={localIsNewer}
            isPrimary={localIsNewer}
            onChoose={onKeepLocal}
            isDisabled={isResolving}
          />
          <DiffPanel
            label="In the cloud"
            icon={<Cloud size={13} />}
            updatedAtMs={remoteState.serverUpdatedAtMs}
            diffed={remoteDiffed}
            summary={remoteSummary}
            ghostRoots={remoteGhostRoots}
            isRecommended={!localIsNewer}
            isPrimary={!localIsNewer}
            onChoose={onKeepCloud}
            isDisabled={isResolving}
          />
        </div>

        <div className="reconcile-actions">
          <button
            className="reconcile-btn reconcile-btn-ghost"
            onClick={onDismiss}
            disabled={isResolving}
          >
            Decide later
          </button>
        </div>
      </section>
    </div>
  )
}
