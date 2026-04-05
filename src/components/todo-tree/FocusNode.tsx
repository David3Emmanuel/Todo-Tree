import { Check, FolderTree, Minus } from 'lucide-react'
import { getProgress, toggleTree } from './tree-utils'
import type { Dispatch, SetStateAction } from 'react'
import type { TreeNode } from './types'

type FocusNodeProps = {
  node: TreeNode
  depth?: number
  setTree: Dispatch<SetStateAction<TreeNode[]>>
}

export function FocusNode({ node, depth = 0, setTree }: FocusNodeProps) {
  const isFolder = node.kind === 'folder'
  const { done, total } = getProgress(node)
  const allDone = !isFolder && total > 0 && done === total
  const someDone = !isFolder && !allDone && done > 0

  return (
    <div key={node.id} className="focus-node-wrap">
      <div className="focus-node" style={{ paddingLeft: `${depth * 18}px` }}>
        <button
          className={`check${isFolder ? ' folder' : ''}${allDone ? ' done' : someDone ? ' part' : ''}`}
          onClick={() =>
            !isFolder && setTree((prev) => toggleTree(prev, node.id))
          }
          disabled={isFolder}
          title={isFolder ? 'Category (not completable)' : undefined}
        >
          {isFolder ? (
            <FolderTree className="icon-xs" aria-hidden="true" />
          ) : allDone ? (
            <Check className="icon-xs" aria-hidden="true" />
          ) : someDone ? (
            <Minus className="icon-xs" aria-hidden="true" />
          ) : null}
        </button>
        <div className="focus-node-text-wrap">
          <div
            className={`focus-node-text${isFolder ? ' folder' : ''}${allDone ? ' done' : ''}`}
          >
            {node.text || 'Untitled task'}
          </div>
          {node.children.length > 0 && (
            <div className="focus-node-meta">
              {done}/{total} complete
            </div>
          )}
        </div>
      </div>
      {node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <FocusNode
              key={child.id}
              node={child}
              depth={depth + 1}
              setTree={setTree}
            />
          ))}
        </div>
      )}
    </div>
  )
}
