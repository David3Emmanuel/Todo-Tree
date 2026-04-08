import type { Breadcrumb, DropPosition, StarredItem, TreeNode } from './types'

export type SuggestionItem = {
  node: TreeNode
  path: Breadcrumb[]
  score: number
  reason: string
}

function toSlug(value: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalized || 'task'
}

export function uid(label = 'task'): string {
  return toSlug(label)
}

export function makeUniqueUid(
  tree: TreeNode[],
  label = 'task',
  excludeId?: string,
): string {
  const base = uid(label)
  const used = new Set<string>()

  const collect = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      if (node.id !== excludeId) used.add(node.id)
      collect(node.children)
    }
  }

  collect(tree)

  if (!used.has(base)) return base

  let count = 2
  let candidate = `${base}-${count}`
  while (used.has(candidate)) {
    count += 1
    candidate = `${base}-${count}`
  }

  return candidate
}

export const dc = <T>(obj: T): T => JSON.parse(JSON.stringify(obj)) as T

export const makeNode = (tree: TreeNode[], label = 'task'): TreeNode => ({
  id: makeUniqueUid(tree, label),
  text: '',
  kind: 'task',
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
  if (!node.children.length) {
    return node.kind === 'folder' ? [] : [node]
  }
  return node.children.flatMap(getLeaves)
}

export function getProgress(node: TreeNode): {
  done: number
  total: number
  isLeaf: boolean
} {
  if (!node.children.length) {
    if (node.kind === 'folder') {
      return { done: 0, total: 0, isLeaf: true }
    }

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

function hashString(value: string): number {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function getSuggestionReason({
  node,
  remainingLeaves,
  totalLeaves,
  depth,
}: {
  node: TreeNode
  remainingLeaves: number
  totalLeaves: number
  depth: number
}): string {
  const parts: string[] = []

  if (node.urgency === 'today') {
    parts.push('Today')
  } else if (node.urgency === 'soon') {
    parts.push('Soon')
  }

  if (node.starred) {
    parts.push('Starred')
  }

  if (!node.children.length) {
    parts.push('Leaf task')
  } else if (remainingLeaves === 1) {
    parts.push('1 task left')
  } else if (remainingLeaves <= 3) {
    parts.push(`${remainingLeaves} tasks left`)
  } else if (totalLeaves > 0) {
    parts.push(`${totalLeaves - remainingLeaves} done`)
  }

  if (node.kind === 'folder') {
    parts.push('Category')
  } else if (depth === 0) {
    parts.push('Top level')
  } else if (depth === 1) {
    parts.push('Near top')
  }

  return parts.slice(0, 2).join(' · ') || 'Next action'
}

function scoreSuggestion({
  node,
  remainingLeaves,
  totalLeaves,
  doneLeaves,
  depth,
}: {
  node: TreeNode
  remainingLeaves: number
  totalLeaves: number
  doneLeaves: number
  depth: number
}): number {
  if (remainingLeaves <= 0) {
    return 0
  }

  let score = node.children.length ? 40 : 66

  if (node.starred) {
    score += 28
  }

  if (!node.children.length) {
    score += 18
  }

  if (remainingLeaves === 1) {
    score += 24
  } else if (remainingLeaves === 2) {
    score += 18
  } else if (remainingLeaves <= 4) {
    score += 10
  }

  if (node.children.length > 0 && remainingLeaves <= 2) {
    score += 20
  }

  if (doneLeaves > 0) {
    score += Math.min(12, doneLeaves * 3)
  }

  if (totalLeaves >= 4 && doneLeaves / totalLeaves >= 0.6) {
    score += 10
  }

  if (node.kind === 'folder') {
    score -= 18
  }

  score -= depth * 3

  if (depth === 0) {
    score += 8
  }

  if (!node.text.trim()) {
    score -= 25
  }

  if (node.urgency === 'soon') {
    score += 20
  } else if (node.urgency === 'today') {
    score += 40
  }

  return score
}

export function getNextActionSuggestions(
  nodes: TreeNode[],
  seed: string,
  limit = 3,
): SuggestionItem[] {
  const suggestions: SuggestionItem[] = []

  const visitNode = (
    node: TreeNode,
    breadcrumbPath: Breadcrumb[],
    depth: number,
  ): { doneLeaves: number; totalLeaves: number } => {
    let doneLeaves = 0
    let totalLeaves = 0
    const nextPath = [...breadcrumbPath, { id: node.id, text: node.text }]

    if (!node.children.length) {
      if (node.kind !== 'folder') {
        totalLeaves = 1
        doneLeaves = node.completed ? 1 : 0
      }
    } else {
      for (const child of node.children) {
        const childMetrics = visitNode(child, nextPath, depth + 1)
        doneLeaves += childMetrics.doneLeaves
        totalLeaves += childMetrics.totalLeaves
      }
    }

    const remainingLeaves = totalLeaves - doneLeaves
    const trimmedText = node.text.trim()
    const actionable =
      trimmedText.length > 0 &&
      !node.completed &&
      (node.kind !== 'folder' || remainingLeaves > 0)

    if (actionable && remainingLeaves > 0) {
      const score = scoreSuggestion({
        node,
        remainingLeaves,
        totalLeaves,
        doneLeaves,
        depth,
      })

      if (score > 0) {
        suggestions.push({
          node,
          path: nextPath,
          score,
          reason: getSuggestionReason({
            node,
            remainingLeaves,
            totalLeaves,
            depth,
          }),
        })
      }
    }

    return { doneLeaves, totalLeaves }
  }

  for (const node of nodes) {
    visitNode(node, [], 0)
  }

  if (!suggestions.length) {
    return []
  }

  const pool = suggestions
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(limit * 4, 8))

  const rng = mulberry32(
    hashString(`${seed}|${pool.map((item) => item.node.id).join(',')}`),
  )
  const picks: SuggestionItem[] = []

  while (pool.length > 0 && picks.length < limit) {
    const lowestScore = Math.min(...pool.map((item) => item.score))
    const weights = pool.map((item) => item.score - lowestScore + 1)
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)

    let roll = rng() * totalWeight
    let index = 0
    for (; index < pool.length; index += 1) {
      roll -= weights[index]
      if (roll <= 0) {
        break
      }
    }

    const [picked] = pool.splice(Math.min(index, pool.length - 1), 1)
    picks.push(picked)
  }

  return picks
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

      if (node.kind === 'folder') {
        node.completed = false
        continue
      }

      const leaves = getLeaves(node)
      node.completed =
        leaves.length > 0 && leaves.every((leaf) => leaf.completed)
      continue
    }

    if (node.kind === 'folder') {
      node.completed = false
    }
  }
}

export function toggleTree(tree: TreeNode[], id: string): TreeNode[] {
  const clone = dc(tree)

  function walk(nodes: TreeNode[]): boolean {
    for (const node of nodes) {
      if (node.id === id) {
        if (node.kind === 'folder') {
          return true
        }

        if (!node.children.length) {
          node.completed = !node.completed
        } else {
          const allDone = getLeaves(node).every((leaf) => leaf.completed)
          const setAll = (target: TreeNode, value: boolean): void => {
            if (!target.children.length) {
              if (target.kind !== 'folder') {
                target.completed = value
              }
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

export function collapseAll(tree: TreeNode[]): TreeNode[] {
  const clone = dc(tree)

  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      node.collapsed = true
      if (node.children.length) {
        walk(node.children)
      }
    }
  }

  walk(clone)
  return clone
}

export function expandAll(tree: TreeNode[]): TreeNode[] {
  const clone = dc(tree)

  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      node.collapsed = false
      if (node.children.length) {
        walk(node.children)
      }
    }
  }

  walk(clone)
  return clone
}
