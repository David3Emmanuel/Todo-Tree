import type { TreeNode } from './types'

export type NodeDiffStatus = 'unchanged' | 'modified' | 'added'

export type DiffedNode = {
  node: TreeNode
  status: NodeDiffStatus
  subtreeClean: boolean // true when this node and every descendant are 'unchanged'
  children: DiffedNode[]
}

export type DiffSummary = {
  added: number
  modified: number
  removed: number
}

export function flattenNodes(nodes: TreeNode[]): Map<string, TreeNode> {
  const map = new Map<string, TreeNode>()
  const walk = (ns: TreeNode[]) => {
    for (const n of ns) {
      map.set(n.id, n)
      walk(n.children)
    }
  }
  walk(nodes)
  return map
}

function contentEqual(a: TreeNode, b: TreeNode): boolean {
  return (
    a.text === b.text &&
    a.kind === b.kind &&
    a.dueDate === b.dueDate &&
    a.completed === b.completed &&
    a.starred === b.starred
  )
}

export function buildDiffedTree(
  nodes: TreeNode[],
  otherFlat: Map<string, TreeNode>,
): DiffedNode[] {
  return nodes.map((node) => {
    const status: NodeDiffStatus = !otherFlat.has(node.id)
      ? 'added'
      : !contentEqual(node, otherFlat.get(node.id)!)
        ? 'modified'
        : 'unchanged'
    const children = buildDiffedTree(node.children, otherFlat)
    const subtreeClean =
      status === 'unchanged' && children.every((c) => c.subtreeClean)
    return { node, status, subtreeClean, children }
  })
}

export function computeDiffSummary(
  diffed: DiffedNode[],
  otherFlat: Map<string, TreeNode>,
  thisNodes: TreeNode[],
): DiffSummary {
  let added = 0
  let modified = 0

  const walk = (nodes: DiffedNode[]) => {
    for (const dn of nodes) {
      if (dn.status === 'added') added++
      if (dn.status === 'modified') modified++
      walk(dn.children)
    }
  }
  walk(diffed)

  const thisFlat = flattenNodes(thisNodes)
  let removed = 0
  for (const id of otherFlat.keys()) {
    if (!thisFlat.has(id)) removed++
  }

  return { added, modified, removed }
}

// Returns "root" nodes of subtrees present in otherNodes but absent from thisFlat.
// Only nodes whose parent IS in thisFlat (or are at the root level) are returned —
// their children are handled by the caller rendering the subtree recursively.
export function getGhostRoots(
  thisFlat: Map<string, TreeNode>,
  otherNodes: TreeNode[],
): TreeNode[] {
  const result: TreeNode[] = []

  const walk = (nodes: TreeNode[], parentExistsInThis: boolean) => {
    for (const n of nodes) {
      const existsInThis = thisFlat.has(n.id)
      if (!existsInThis && parentExistsInThis) {
        result.push(n)
      } else if (existsInThis) {
        walk(n.children, true)
      }
      // !existsInThis && !parentExistsInThis: inside a ghost subtree, skip
    }
  }

  walk(otherNodes, true)
  return result
}
