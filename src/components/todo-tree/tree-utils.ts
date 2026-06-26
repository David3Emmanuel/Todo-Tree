import type {
  Breadcrumb,
  DropPosition,
  DueDateClass,
  HarvestPriority,
  HarvestSection,
  HarvestTreeNode,
  StarredItem,
  TreeNode,
} from './types'

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

export function formatDueDate(dueDate: string): string {
  const cls = classifyDueDate(dueDate)
  if (cls === 'overdue') return 'Overdue'
  if (cls === 'today') return 'Today'
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (dueDate === tomorrow.toISOString().slice(0, 10)) return 'Tomorrow'
  const [year, month, day] = dueDate.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  const thisYear = new Date().getFullYear()
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== thisYear ? { year: 'numeric' } : {}),
  })
}

export function classifyDueDate(dueDate: string): DueDateClass {
  const today = new Date().toISOString().slice(0, 10)
  if (dueDate < today) return 'overdue'
  if (dueDate === today) return 'today'
  return 'soon'
}

function dueDateRank(dueDate: string | undefined): number {
  if (!dueDate) return 0
  const cls = classifyDueDate(dueDate)
  return cls === 'overdue' || cls === 'today' ? 2 : 1
}

function effectiveDueDate(
  own: string | undefined,
  inherited: string | undefined,
): string | undefined {
  if (!own) return inherited
  if (!inherited) return own
  return own < inherited ? own : inherited
}

function getNodeHarvestPriority(node: TreeNode): HarvestPriority | null {
  if (node.starred) return 'starred'
  if (!node.dueDate || node.completed) return null
  const cls = classifyDueDate(node.dueDate)
  if (cls === 'overdue' || cls === 'today') return 'today'
  return 'soon'
}

function priorityRank(p: HarvestPriority | null): number {
  if (p === 'starred') return 3
  if (p === 'today') return 2
  if (p === 'soon') return 1
  return 0
}

function maxPriority(
  a: HarvestPriority | null,
  b: HarvestPriority | null,
): HarvestPriority | null {
  return priorityRank(a) >= priorityRank(b) ? a : b
}

function buildHarvestSubtree(
  nodes: TreeNode[],
  path: string[],
): HarvestTreeNode[] {
  const result: HarvestTreeNode[] = []
  for (const node of nodes) {
    const ownPriority = getNodeHarvestPriority(node)
    const childPath = [...path, node.text]
    const harvestChildren = buildHarvestSubtree(node.children, childPath)
    if (ownPriority !== null || harvestChildren.length > 0) {
      let mp: HarvestPriority | null = ownPriority
      for (const child of harvestChildren) {
        mp = maxPriority(mp, child.maxPriority)
      }
      result.push({
        node,
        path,
        ownPriority,
        maxPriority: mp as HarvestPriority,
        harvestChildren,
      })
    }
  }
  return result
}

function buildHarvestForest(
  nodes: TreeNode[],
  path: string[],
): HarvestTreeNode[] {
  const result: HarvestTreeNode[] = []
  for (const node of nodes) {
    const ownPriority = getNodeHarvestPriority(node)
    const childPath = [...path, node.text]
    if (ownPriority !== null) {
      const harvestChildren = buildHarvestSubtree(node.children, childPath)
      let mp: HarvestPriority = ownPriority
      for (const child of harvestChildren) {
        if (priorityRank(child.maxPriority) > priorityRank(mp)) {
          mp = child.maxPriority
        }
      }
      result.push({ node, path, ownPriority, maxPriority: mp, harvestChildren })
    } else {
      result.push(...buildHarvestForest(node.children, childPath))
    }
  }
  return result
}

export function getHarvestSections(nodes: TreeNode[]): HarvestSection[] {
  const forest = buildHarvestForest(nodes, [])
  const buckets: Record<HarvestPriority, HarvestTreeNode[]> = {
    starred: [],
    today: [],
    soon: [],
  }
  for (const item of forest) {
    buckets[item.maxPriority].push(item)
  }
  // Sort top-level parents in the `soon` bucket by earliest due-date (ascending).
  // Preserve traversal order for ties (stable by original index).
  const earliestDueDate = (h: HarvestTreeNode): string | undefined => {
    let best: string | undefined = h.node.dueDate
    for (const child of h.harvestChildren) {
      const c = earliestDueDate(child)
      if (!c) continue
      if (!best || c < best) best = c
    }
    return best
  }

  buckets.soon = buckets.soon
    .map((item, idx) => ({ item, idx, ed: earliestDueDate(item) }))
    .sort((a, b) => {
      const aEd = a.ed
      const bEd = b.ed
      if (aEd && bEd) {
        if (aEd < bEd) return -1
        if (aEd > bEd) return 1
        return a.idx - b.idx
      }
      if (aEd && !bEd) return -1
      if (!aEd && bEd) return 1
      return a.idx - b.idx
    })
    .map(({ item }) => item)
  const order: HarvestPriority[] = ['starred', 'today', 'soon']
  return order
    .filter((p) => buckets[p].length > 0)
    .map((p) => ({ priority: p, items: buckets[p] }))
}

export function flattenVisibleNodes(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = []
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      result.push(n)
      if (n.children.length && !n.collapsed) walk(n.children)
    }
  }
  walk(nodes)
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
  dueDate,
}: {
  node: TreeNode
  remainingLeaves: number
  totalLeaves: number
  depth: number
  dueDate: string | undefined
}): string {
  const parts: string[] = []

  if (dueDate) {
    const cls = classifyDueDate(dueDate)
    if (cls === 'overdue') {
      parts.push('Overdue')
    } else if (cls === 'today') {
      parts.push('Today')
    } else {
      parts.push('Due soon')
    }
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
  dueDate,
}: {
  node: TreeNode
  remainingLeaves: number
  totalLeaves: number
  doneLeaves: number
  depth: number
  dueDate: string | undefined
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

  if (dueDate) {
    score += dueDateRank(dueDate) === 2 ? 1000 : 500
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
    inheritedDueDate?: string,
  ): { doneLeaves: number; totalLeaves: number } => {
    let doneLeaves = 0
    let totalLeaves = 0
    const nextPath = [...breadcrumbPath, { id: node.id, text: node.text }]
    const nodeDueDate = effectiveDueDate(node.dueDate, inheritedDueDate)

    if (!node.children.length) {
      if (node.kind !== 'folder') {
        totalLeaves = 1
        doneLeaves = node.completed ? 1 : 0
      }
    } else {
      for (const child of node.children) {
        const childMetrics = visitNode(child, nextPath, depth + 1, nodeDueDate)
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
        dueDate: nodeDueDate,
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
            dueDate: nodeDueDate,
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

  const sortedSuggestions = suggestions.sort(
    (left, right) => right.score - left.score,
  )

  const filteredSuggestions: SuggestionItem[] = []

  const conflictsWithSelected = (candidate: SuggestionItem): boolean =>
    filteredSuggestions.some((selected) => {
      const shorterPath =
        selected.path.length <= candidate.path.length
          ? selected.path
          : candidate.path
      const longerPath =
        selected.path.length > candidate.path.length
          ? selected.path
          : candidate.path

      if (shorterPath.length === longerPath.length) {
        return false
      }

      return shorterPath.every(
        (crumb, index) => crumb.id === longerPath[index].id,
      )
    })

  for (const suggestion of sortedSuggestions) {
    if (!conflictsWithSelected(suggestion)) {
      filteredSuggestions.push(suggestion)
    }
  }

  const pool = filteredSuggestions.slice(0, Math.max(limit * 4, 8))

  const rng = mulberry32(
    hashString(`${seed}|${pool.map((item) => item.node.id).join(',')}`),
  )
  const picks: SuggestionItem[] = []

  while (pool.length > 0 && picks.length < limit) {
    const lowestScore = Math.min(...pool.map((item) => item.score))
    const weights = pool.map((item) => (item.score - lowestScore + 1) ** 1.5)
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

  // Check if there is any completed node with children that is currently expanded
  const hasExpandedCompleted = (nodes: TreeNode[]): boolean => {
    for (const node of nodes) {
      if (node.completed && node.children.length > 0 && !node.collapsed) {
        return true
      }
      if (hasExpandedCompleted(node.children)) {
        return true
      }
    }
    return false
  }

  if (hasExpandedCompleted(clone)) {
    // Phase 1: collapse only completed nodes (and their descendants)
    const walkCompleted = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        if (node.completed) {
          node.collapsed = true
        }
        if (node.children.length) {
          walkCompleted(node.children)
        }
      }
    }
    walkCompleted(clone)
  } else {
    // Phase 2: collapse all nodes
    const walkEverything = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        node.collapsed = true
        if (node.children.length) {
          walkEverything(node.children)
        }
      }
    }
    walkEverything(clone)
  }

  return clone
}

export function expandAll(tree: TreeNode[]): TreeNode[] {
  const clone = dc(tree)

  // Check if there is any incomplete node with children that is currently collapsed
  const hasCollapsedIncomplete = (nodes: TreeNode[]): boolean => {
    for (const node of nodes) {
      if (!node.completed && node.children.length > 0 && node.collapsed) {
        return true
      }
      if (hasCollapsedIncomplete(node.children)) {
        return true
      }
    }
    return false
  }

  if (hasCollapsedIncomplete(clone)) {
    // Phase 1: expand only incomplete nodes
    const walkIncomplete = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        if (!node.completed) {
          node.collapsed = false
        }
        if (node.children.length) {
          walkIncomplete(node.children)
        }
      }
    }
    walkIncomplete(clone)
  } else {
    // Phase 2: expand all nodes
    const walkEverything = (nodes: TreeNode[]): void => {
      for (const node of nodes) {
        node.collapsed = false
        if (node.children.length) {
          walkEverything(node.children)
        }
      }
    }
    walkEverything(clone)
  }

  return clone
}

export function parseSubtaskPattern(text: string): {
  parentText: string
  childPrefix: string
  start: number
  end: number
} | null {
  const match = /\{(\d+)\.\.(\d+)\}/.exec(text)
  if (!match) return null
  const start = parseInt(match[1], 10)
  const end = parseInt(match[2], 10)
  if (start > end || end - start > 99) return null
  const beforePattern = text.slice(0, match.index).trim()
  const slashIdx = beforePattern.indexOf('/')
  let parentText: string
  let childPrefix: string
  if (slashIdx !== -1) {
    parentText = beforePattern.slice(0, slashIdx).trim()
    childPrefix = beforePattern.slice(slashIdx + 1).trim()
  } else {
    parentText = beforePattern
    childPrefix = beforePattern
  }
  return { parentText, childPrefix, start, end }
}

export function generateChildNodes(
  tree: TreeNode[],
  childPrefix: string,
  start: number,
  end: number,
): TreeNode[] {
  const usedIds = new Set<string>()
  const collectIds = (nodes: TreeNode[]): void => {
    for (const n of nodes) {
      usedIds.add(n.id)
      collectIds(n.children)
    }
  }
  collectIds(tree)

  const children: TreeNode[] = []
  for (let i = start; i <= end; i++) {
    const text = childPrefix ? `${childPrefix} ${i}` : String(i)
    const base = uid(text)
    let id = base
    let counter = 2
    while (usedIds.has(id)) {
      id = `${base}-${counter}`
      counter++
    }
    usedIds.add(id)
    children.push({
      id,
      text,
      kind: 'task',
      completed: false,
      collapsed: false,
      starred: false,
      children: [],
    })
  }
  return children
}
