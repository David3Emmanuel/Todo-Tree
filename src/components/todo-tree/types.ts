import type { Dispatch, SetStateAction } from 'react'

export type TreeNode = {
  id: string
  text: string
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
}
