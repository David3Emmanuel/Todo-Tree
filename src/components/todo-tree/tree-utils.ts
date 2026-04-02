import type { DropPosition, StarredItem, TreeNode } from './types'

export const uid = () => Math.random().toString(36).slice(2, 9)

export const dc = <T>(obj: T): T => JSON.parse(JSON.stringify(obj)) as T

export const makeNode = (): TreeNode => ({
  id: uid(),
  text: '',
  completed: false,
  collapsed: false,
  starred: false,
  children: [],
})

export function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findNode(node.children ?? [], id)
    if (found) return found
  }
  return null
}

export function getLeaves(node: TreeNode): TreeNode[] {
  if (!node.children.length) return [node]
  return node.children.flatMap(getLeaves)
}

export function getProgress(node: TreeNode): {
  done: number
  total: number
  isLeaf: boolean
} {
  if (!node.children.length) {
    return { done: node.completed ? 1 : 0, total: 1, isLeaf: true }
  }

  const leaves = getLeaves(node)
  const done = leaves.filter((leaf) => leaf.completed).length
  return { done, total: leaves.length, isLeaf: false }
}

export function countDescendants(node: TreeNode): number {
  if (!node.children.length) return 0
  return (
    node.children.length +
    node.children.reduce((sum, child) => sum + countDescendants(child), 0)
  )
}

export function getAllStarred(
  nodes: TreeNode[],
  path: string[] = [],
): StarredItem[] {
  const result: StarredItem[] = []
  for (const node of nodes) {
    const nextPath = [...path, node.text]
    if (node.starred) result.push({ ...node, _path: path })
    result.push(...getAllStarred(node.children, nextPath))
  }
  return result
}

export function upd(
  tree: TreeNode[],
  id: string,
  fn: (node: TreeNode) => void,
): TreeNode[] {
  const clone = dc(tree)
  const walk = (nodes: TreeNode[]): boolean => {
    for (const node of nodes) {
      if (node.id === id) {
        fn(node)
        return true
      }
      if (walk(node.children)) return true
    }
    return false
  }
  walk(clone)
  return clone
}

export function rem(nodes: TreeNode[], id: string): TreeNode[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({ ...node, children: rem(node.children, id) }))
}

function propagate(nodes: TreeNode[]): void {
  for (const node of nodes) {
    if (node.children.length) {
      propagate(node.children)
      node.completed = node.children.every((child) => child.completed)
    }
  }
}

export function toggleTree(tree: TreeNode[], id: string): TreeNode[] {
  const clone = dc(tree)

  function walk(nodes: TreeNode[]): boolean {
    for (const node of nodes) {
      if (node.id === id) {
        if (!node.children.length) {
          node.completed = !node.completed
        } else {
          const allDone = getLeaves(node).every((leaf) => leaf.completed)
          const setAll = (target: TreeNode, value: boolean): void => {
            if (!target.children.length) {
              target.completed = value
            } else {
              target.children.forEach((child) => setAll(child, value))
            }
          }
          setAll(node, !allDone)
        }
        return true
      }
      if (walk(node.children)) return true
    }
    return false
  }

  walk(clone)
  propagate(clone)
  return clone
}

export function addSib(
  tree: TreeNode[],
  afterId: string,
  newNode: TreeNode,
): TreeNode[] {
  const clone = dc(tree)
  const insert = (nodes: TreeNode[]): boolean => {
    const index = nodes.findIndex((node) => node.id === afterId)
    if (index !== -1) {
      nodes.splice(index + 1, 0, newNode)
      return true
    }
    for (const node of nodes) {
      if (insert(node.children)) return true
    }
    return false
  }
  if (!insert(clone)) clone.push(newNode)
  return clone
}

export function indentN(tree: TreeNode[], id: string): TreeNode[] {
  const clone = dc(tree)
  const walk = (nodes: TreeNode[]): boolean => {
    const index = nodes.findIndex((node) => node.id === id)
    if (index > 0) {
      const [node] = nodes.splice(index, 1)
      const parent = nodes[index - 1]
      parent.children.push(node)
      parent.collapsed = false
      return true
    }
    for (const node of nodes) {
      if (walk(node.children)) return true
    }
    return false
  }
  return walk(clone) ? clone : tree
}

export function outdentN(tree: TreeNode[], id: string): TreeNode[] {
  const clone = dc(tree)
  const walk = (nodes: TreeNode[]): boolean => {
    for (let index = 0; index < nodes.length; index += 1) {
      const children = nodes[index].children
      const childIndex = children.findIndex((child) => child.id === id)
      if (childIndex !== -1) {
        const [node] = children.splice(childIndex, 1)
        nodes.splice(index + 1, 0, node)
        return true
      }
      if (walk(children)) return true
    }
    return false
  }
  return walk(clone) ? clone : tree
}

export function moveN(
  tree: TreeNode[],
  dragId: string,
  targetId: string,
  pos: DropPosition,
): TreeNode[] {
  if (dragId === targetId) return tree

  const clone = dc(tree)
  let dragged: TreeNode | null = null

  const extract = (nodes: TreeNode[]): boolean => {
    const index = nodes.findIndex((node) => node.id === dragId)
    if (index !== -1) {
      ;[dragged] = nodes.splice(index, 1)
      return true
    }
    for (const node of nodes) {
      if (extract(node.children)) return true
    }
    return false
  }

  extract(clone)
  if (!dragged) return tree

  const insert = (nodes: TreeNode[]): boolean => {
    const index = nodes.findIndex((node) => node.id === targetId)
    if (index !== -1) {
      if (pos === 'before') {
        nodes.splice(index, 0, dragged as TreeNode)
      } else if (pos === 'after') {
        nodes.splice(index + 1, 0, dragged as TreeNode)
      } else {
        nodes[index].children.push(dragged as TreeNode)
        nodes[index].collapsed = false
      }
      return true
    }
    for (const node of nodes) {
      if (insert(node.children)) return true
    }
    return false
  }

  insert(clone)
  return clone
}
