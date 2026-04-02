import { INIT } from './init-data'
import type { Breadcrumb, PersistedState, TreeNode } from './types'

const STORAGE_KEY = 'todo-tree-state'

export function loadPersistedState(): PersistedState {
  if (typeof window === 'undefined') {
    return { tree: INIT, zoom: [], view: 'tree' }
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { tree: INIT, zoom: [], view: 'tree' }
    }

    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      tree: Array.isArray(parsed.tree) ? (parsed.tree as TreeNode[]) : INIT,
      zoom: Array.isArray(parsed.zoom) ? (parsed.zoom as Breadcrumb[]) : [],
      view: parsed.view === 'harvest' ? 'harvest' : 'tree',
    }
  } catch {
    return { tree: INIT, zoom: [], view: 'tree' }
  }
}

export function savePersistedState(state: PersistedState): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}
