import { useMemo, useState, useEffect } from 'react'
import { Check, Cloud, FolderTree, Monitor, GitMerge, Eye } from 'lucide-react'
import type { LoginReconcileConflict } from './usePersistence'
import {
  buildDiffedTree,
  computeDiffSummary,
  flattenNodes,
  getGhostRoots,
  contentEqual,
  type DiffedNode,
  type DiffSummary,
} from './treeDiff'
import { classifyDueDate, formatDueDate } from './tree-utils'
import type { TreeNode, SuggestionHideMap } from './types'

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

export type MergeNode = {
  id: string
  localNode?: TreeNode
  remoteNode?: TreeNode
  status: 'unchanged' | 'conflict-content' | 'only-local' | 'only-remote'
  children: MergeNode[]
}

function mergeNodeLists(localList: TreeNode[], remoteList: TreeNode[]): string[] {
  const ids = new Set<string>()
  const result: string[] = []

  for (const n of localList) {
    if (!ids.has(n.id)) {
      ids.add(n.id)
      result.push(n.id)
    }
  }

  for (const n of remoteList) {
    if (!ids.has(n.id)) {
      const prevIdx = remoteList.indexOf(n) - 1
      let targetIdx = -1
      if (prevIdx >= 0) {
        const prevId = remoteList[prevIdx].id
        targetIdx = result.indexOf(prevId)
      }
      if (targetIdx !== -1) {
        result.splice(targetIdx + 1, 0, n.id)
        ids.add(n.id)
      } else {
        result.push(n.id)
        ids.add(n.id)
      }
    }
  }
  return result
}

export function buildMergeTree(
  localList: TreeNode[],
  remoteList: TreeNode[],
): MergeNode[] {
  const mergedIds = mergeNodeLists(localList, remoteList)
  return mergedIds.map((id) => {
    const localNode = localList.find((n) => n.id === id)
    const remoteNode = remoteList.find((n) => n.id === id)

    let status: MergeNode['status']
    if (localNode && remoteNode) {
      status = contentEqual(localNode, remoteNode) ? 'unchanged' : 'conflict-content'
    } else if (localNode) {
      status = 'only-local'
    } else {
      status = 'only-remote'
    }

    const children = buildMergeTree(
      localNode ? localNode.children : [],
      remoteNode ? remoteNode.children : [],
    )

    return {
      id,
      localNode,
      remoteNode,
      status,
      children,
    }
  })
}

function resolveMerge(
  mergeNodes: MergeNode[],
  choices: Record<string, 'local' | 'remote'>,
): TreeNode[] {
  const result: TreeNode[] = []

  for (const mn of mergeNodes) {
    const choice = choices[mn.id] ?? (mn.localNode ? 'local' : 'remote')

    if (mn.status === 'only-local' && choice === 'remote') {
      continue
    }
    if (mn.status === 'only-remote' && choice === 'local') {
      continue
    }

    const sourceNode = choice === 'local' ? mn.localNode : mn.remoteNode
    if (!sourceNode) {
      continue
    }

    const children = resolveMerge(mn.children, choices)

    result.push({
      ...sourceNode,
      children,
    })
  }

  return result
}

function resolveSuggestionHides(
  localHides: SuggestionHideMap,
  remoteHides: SuggestionHideMap,
  mergedTree: TreeNode[],
): SuggestionHideMap {
  const merged: SuggestionHideMap = { ...remoteHides, ...localHides }
  const flatMergedIds = flattenNodes(mergedTree)
  const result: SuggestionHideMap = {}
  for (const [key, val] of Object.entries(merged)) {
    if (flatMergedIds.has(key)) {
      result[key] = val
    }
  }
  return result
}

function MergeNodeRow({
  mn,
  choices,
  onChoose,
  depth = 0,
}: {
  mn: MergeNode
  choices: Record<string, 'local' | 'remote'>
  onChoose: (nodeId: string, choice: 'local' | 'remote') => void
  depth?: number
}) {
  const { id, localNode, remoteNode, status, children } = mn
  const currentChoice = choices[id] ?? (localNode ? 'local' : 'remote')

  const isFolder = (localNode?.kind ?? remoteNode?.kind) === 'folder'
  const localText = localNode?.text || '(untitled)'
  const remoteText = remoteNode?.text || '(untitled)'

  if (status === 'unchanged') {
    return (
      <>
        <div
          className="merge-status-unchanged"
          style={{ paddingLeft: `${0.55 + depth * 1.1}rem` }}
        >
          <span className="merge-node-icon-inline" style={{ marginRight: '0.35rem' }}>
            {isFolder ? <FolderTree size={11} /> : <span className="diff-node-dot" />}
          </span>
          <span>{localText}</span>
        </div>
        {children.map((child) => (
          <MergeNodeRow
            key={child.id}
            mn={child}
            choices={choices}
            onChoose={onChoose}
            depth={depth + 1}
          />
        ))}
      </>
    )
  }

  return (
    <>
      <div
        className={`merge-node-card merge-status-${status}`}
        style={{ marginLeft: `${depth * 1.1}rem` }}
      >
        <div className="merge-card-header">
          <div className="merge-card-meta">
            <span className="merge-node-icon-inline">
              {isFolder ? <FolderTree size={12} /> : <span className="diff-node-dot" />}
            </span>
            <span className={`merge-status-badge badge-${
              status === 'conflict-content'
                ? 'conflict'
                : status === 'only-local'
                ? 'device-only'
                : 'cloud-only'
            }`}>
              {status === 'conflict-content'
                ? 'Modified in both'
                : status === 'only-local'
                ? 'On Device Only'
                : 'In Cloud Only'}
            </span>
          </div>
        </div>

        {status === 'conflict-content' ? (
          <div className="merge-options-grid">
            <div
              className={`merge-option-row${currentChoice === 'local' ? ' is-selected' : ''}`}
              onClick={() => onChoose(id, 'local')}
            >
              <div className="merge-option-content">
                <span className={`merge-checkbox-dummy${currentChoice === 'local' ? ' checked' : ''}`} />
                <span className="merge-option-text">{localText}</span>
                {localNode?.dueDate && (
                  <span className={`due-badge due-badge--${classifyDueDate(localNode.dueDate)}`}>
                    {formatDueDate(localNode.dueDate)}
                  </span>
                )}
                {localNode?.completed && <span className="diff-badge diff-badge-added">completed</span>}
                {localNode?.starred && <span style={{ color: '#e8c547' }}>★</span>}
              </div>
              <span className="merge-badge-source badge-source-local">Device</span>
            </div>

            <div
              className={`merge-option-row${currentChoice === 'remote' ? ' is-selected' : ''}`}
              onClick={() => onChoose(id, 'remote')}
            >
              <div className="merge-option-content">
                <span className={`merge-checkbox-dummy${currentChoice === 'remote' ? ' checked' : ''}`} />
                <span className="merge-option-text">{remoteText}</span>
                {remoteNode?.dueDate && (
                  <span className={`due-badge due-badge--${classifyDueDate(remoteNode.dueDate)}`}>
                    {formatDueDate(remoteNode.dueDate)}
                  </span>
                )}
                {remoteNode?.completed && <span className="diff-badge diff-badge-added">completed</span>}
                {remoteNode?.starred && <span style={{ color: '#e8c547' }}>★</span>}
              </div>
              <span className="merge-badge-source badge-source-remote">Cloud</span>
            </div>
          </div>
        ) : status === 'only-local' ? (
          <div className="merge-options-grid">
            <div
              className={`merge-option-row${currentChoice === 'local' ? ' is-selected' : ' is-discarded'}`}
              onClick={() => onChoose(id, currentChoice === 'local' ? 'remote' : 'local')}
            >
              <div className="merge-option-content">
                <span className={`merge-checkbox-dummy${currentChoice === 'local' ? ' checked' : ''}`} />
                <span className="merge-option-text">{localText}</span>
                {localNode?.dueDate && (
                  <span className={`due-badge due-badge--${classifyDueDate(localNode.dueDate)}`}>
                    {formatDueDate(localNode.dueDate)}
                  </span>
                )}
                {localNode?.completed && <span className="diff-badge diff-badge-added">completed</span>}
                {localNode?.starred && <span style={{ color: '#e8c547' }}>★</span>}
              </div>
              <div className="merge-option-actions">
                <span className="merge-badge-source badge-source-local">Device</span>
                <button
                  type="button"
                  className={`merge-action-btn${currentChoice === 'local' ? ' is-active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChoose(id, 'local')
                  }}
                >
                  Keep
                </button>
                <button
                  type="button"
                  className={`merge-action-btn${currentChoice === 'remote' ? ' is-danger-active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChoose(id, 'remote')
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="merge-options-grid">
            <div
              className={`merge-option-row${currentChoice === 'remote' ? ' is-selected' : ' is-discarded'}`}
              onClick={() => onChoose(id, currentChoice === 'remote' ? 'local' : 'remote')}
            >
              <div className="merge-option-content">
                <span className={`merge-checkbox-dummy${currentChoice === 'remote' ? ' checked' : ''}`} />
                <span className="merge-option-text">{remoteText}</span>
                {remoteNode?.dueDate && (
                  <span className={`due-badge due-badge--${classifyDueDate(remoteNode.dueDate)}`}>
                    {formatDueDate(remoteNode.dueDate)}
                  </span>
                )}
                {remoteNode?.completed && <span className="diff-badge diff-badge-added">completed</span>}
                {remoteNode?.starred && <span style={{ color: '#e8c547' }}>★</span>}
              </div>
              <div className="merge-option-actions">
                <span className="merge-badge-source badge-source-remote">Cloud</span>
                <button
                  type="button"
                  className={`merge-action-btn${currentChoice === 'remote' ? ' is-active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChoose(id, 'remote')
                  }}
                >
                  Keep
                </button>
                <button
                  type="button"
                  className={`merge-action-btn${currentChoice === 'local' ? ' is-danger-active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onChoose(id, 'local')
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {children.map((child) => (
        <MergeNodeRow
          key={child.id}
          mn={child}
          choices={choices}
          onChoose={onChoose}
          depth={depth + 1}
        />
      ))}
    </>
  )
}

type Props = {
  conflict: LoginReconcileConflict
  isResolving: boolean
  error: string | null
  onKeepLocal: () => void
  onKeepCloud: () => void
  onResolveCustomMerge: (mergedState: { tree: TreeNode[]; suggestionHides: SuggestionHideMap }) => void
  onDismiss: () => void
}

export function ConflictDiffModal({
  conflict,
  isResolving,
  error,
  onKeepLocal,
  onKeepCloud,
  onResolveCustomMerge,
  onDismiss,
}: Props) {
  const { localState, remoteState } = conflict
  const [activeTab, setActiveTab] = useState<'interactive' | 'compare'>('interactive')

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

  const mergeTree = useMemo(
    () => buildMergeTree(localState.tree, remoteState.tree),
    [localState.tree, remoteState.tree],
  )

  const [choices, setChoices] = useState<Record<string, 'local' | 'remote'>>({})

  useEffect(() => {
    const initial: Record<string, 'local' | 'remote'> = {}
    const walk = (nodes: MergeNode[]) => {
      for (const node of nodes) {
        if (node.status === 'conflict-content') {
          initial[node.id] = localIsNewer ? 'local' : 'remote'
        } else if (node.status === 'only-local') {
          initial[node.id] = 'local'
        } else if (node.status === 'only-remote') {
          initial[node.id] = 'remote'
        }
        walk(node.children)
      }
    }
    walk(mergeTree)
    setChoices(initial)
  }, [conflict, mergeTree, localIsNewer])

  const handleChoose = (nodeId: string, choice: 'local' | 'remote') => {
    setChoices((prev) => ({
      ...prev,
      [nodeId]: choice,
    }))
  }

  const handleSelectAllLocal = () => {
    const updated = { ...choices }
    const walk = (nodes: MergeNode[]) => {
      for (const node of nodes) {
        if (node.status !== 'unchanged') {
          updated[node.id] = 'local'
        }
        walk(node.children)
      }
    }
    walk(mergeTree)
    setChoices(updated)
  }

  const handleSelectAllRemote = () => {
    const updated = { ...choices }
    const walk = (nodes: MergeNode[]) => {
      for (const node of nodes) {
        if (node.status !== 'unchanged') {
          updated[node.id] = 'remote'
        }
        walk(node.children)
      }
    }
    walk(mergeTree)
    setChoices(updated)
  }

  const conflictCounts = useMemo(() => {
    let content = 0
    let localOnly = 0
    let remoteOnly = 0
    const walk = (nodes: MergeNode[]) => {
      for (const node of nodes) {
        if (node.status === 'conflict-content') content++
        if (node.status === 'only-local') localOnly++
        if (node.status === 'only-remote') remoteOnly++
        walk(node.children)
      }
    }
    walk(mergeTree)
    return { content, localOnly, remoteOnly, total: content + localOnly + remoteOnly }
  }, [mergeTree])

  const handleConfirmMerge = () => {
    const mergedTree = resolveMerge(mergeTree, choices)
    const mergedHides = resolveSuggestionHides(
      localState.suggestionHides,
      remoteState.suggestionHides,
      mergedTree,
    )
    onResolveCustomMerge({
      tree: mergedTree,
      suggestionHides: mergedHides,
    })
  }

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
            Both were updated since the last sync. Use the line-by-line merge tool to pick the correct version of each item, or compare the full versions side-by-side.
          </p>
        </div>

        {error && (
          <div className="reconcile-error" role="alert">
            {error}
          </div>
        )}

        <div className="tabs">
          <button
            type="button"
            className={`tab ${activeTab === 'interactive' ? 'active' : ''}`}
            onClick={() => setActiveTab('interactive')}
          >
            <GitMerge size={12} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
            Line-by-Line Merge
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'compare' ? 'active' : ''}`}
            onClick={() => setActiveTab('compare')}
          >
            <Eye size={12} style={{ verticalAlign: 'middle', marginRight: '0.25rem' }} />
            Side-by-Side Diff
          </button>
        </div>

        {activeTab === 'interactive' ? (
          <div className="merge-workspace">
            <div className="merge-instructions">
              Review the tree below. Click on the version of each item you want to keep.
              By default, newly added tasks from both sides are kept.
            </div>

            <div className="merge-summary-banner">
              <span>
                <strong>{conflictCounts.total}</strong> differing items: {conflictCounts.content} content conflicts,{' '}
                {conflictCounts.localOnly + conflictCounts.remoteOnly} additions.
              </span>
            </div>

            <div className="merge-tree-container">
              {mergeTree.map((mn) => (
                <MergeNodeRow
                  key={mn.id}
                  mn={mn}
                  choices={choices}
                  onChoose={handleChoose}
                />
              ))}
            </div>
          </div>
        ) : (
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
        )}

        <div className="reconcile-actions" style={{ marginTop: '0.4rem' }}>
          {activeTab === 'interactive' ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="reconcile-btn reconcile-btn-primary"
                  onClick={handleConfirmMerge}
                  disabled={isResolving}
                >
                  Confirm and Sync Merge
                </button>
                <button
                  type="button"
                  className="reconcile-btn reconcile-btn-ghost"
                  onClick={onDismiss}
                  disabled={isResolving}
                >
                  Decide later
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="merge-action-btn"
                  onClick={handleSelectAllLocal}
                  disabled={isResolving}
                >
                  Use Device All
                </button>
                <button
                  type="button"
                  className="merge-action-btn"
                  onClick={handleSelectAllRemote}
                  disabled={isResolving}
                >
                  Use Cloud All
                </button>
              </div>
            </div>
          ) : (
            <button
              className="reconcile-btn reconcile-btn-ghost"
              onClick={onDismiss}
              disabled={isResolving}
            >
              Decide later
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
