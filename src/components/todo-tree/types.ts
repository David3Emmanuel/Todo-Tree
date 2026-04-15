import type { Dispatch, SetStateAction } from 'react'

export type TreeNode = {
  id: string
  text: string
  kind?: 'task' | 'folder'
  urgency?: 'soon' | 'today'
  completed: boolean
  collapsed: boolean
  starred: boolean
  children: TreeNode[]
}

export type Breadcrumb = {
  id: string
  text: string
}

export type DropPosition = 'before' | 'after' | 'inside'

export type StarredItem = TreeNode & {
  _path: string[]
}

export type HarvestPriority = 'starred' | 'today' | 'soon'

export type HarvestTreeNode = {
  node: TreeNode
  path: string[]
  ownPriority: HarvestPriority | null
  maxPriority: HarvestPriority
  harvestChildren: HarvestTreeNode[]
}

export type HarvestSection = {
  priority: HarvestPriority
  items: HarvestTreeNode[]
}

export type ViewMode = 'tree' | 'harvest'

export type SuggestionHideRule = {
  untilDateMs?: number
  untilTaskId?: string
}

export type SuggestionHideMap = Record<string, SuggestionHideRule>

export type CtxValue = {
  tree: TreeNode[]
  setTree: Dispatch<SetStateAction<TreeNode[]>>
  editingId: string | null
  setEditingId: Dispatch<SetStateAction<string | null>>
  zoom: Breadcrumb[]
  setZoom: Dispatch<SetStateAction<Breadcrumb[]>>
  openHideMenu: (nodeId: string) => void
}

export type PersistedState = {
  tree: TreeNode[]
  zoom: Breadcrumb[]
  view: ViewMode
  suggestionHides: SuggestionHideMap
  localUpdatedAtMs?: number
  lastSyncedFingerprint?: string
  lastSyncedUserId?: string
  serverUpdatedAtMs?: number
}
