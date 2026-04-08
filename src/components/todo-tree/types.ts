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
