import type {
  Breadcrumb,
  PersistedState,
  SuggestionHideMap,
  TreeNode,
} from './types'

const DB_NAME = 'todo-tree'
const STORE_NAME = 'state'
const STATE_KEY = 'current'
const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:1337'

export type RemotePersistedState = {
  state: PersistedState
  serverUpdatedAtMs: number
}

export type SyncablePersistedState = Pick<
  PersistedState,
  'tree' | 'zoom' | 'view' | 'suggestionHides'
>

function normalizeTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.map((node) => {
    const kind = node.kind === 'folder' ? 'folder' : 'task'
    const children = Array.isArray(node.children)
      ? normalizeTree(node.children)
      : []

    return {
      ...node,
      kind,
      children,
      completed: kind === 'folder' ? false : Boolean(node.completed),
      collapsed: Boolean(node.collapsed),
      starred: Boolean(node.starred),
    }
  })
}

function normalizeSuggestionHides(value: unknown): SuggestionHideMap {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const result: SuggestionHideMap = {}
  for (const [key, rawRule] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!rawRule || typeof rawRule !== 'object') {
      continue
    }

    const parsedRule = rawRule as {
      untilDateMs?: unknown
      untilTaskId?: unknown
    }

    const untilDateMs = Number(parsedRule.untilDateMs)
    const untilTaskId =
      typeof parsedRule.untilTaskId === 'string'
        ? parsedRule.untilTaskId.trim()
        : ''

    const normalizedRule = {
      ...(Number.isFinite(untilDateMs) && untilDateMs > 0
        ? { untilDateMs }
        : {}),
      ...(untilTaskId ? { untilTaskId } : {}),
    }

    if (Object.keys(normalizedRule).length > 0) {
      result[key] = normalizedRule
    }
  }

  return result
}

function emptyPersistedState(): PersistedState {
  return { tree: [], zoom: [], view: 'tree', suggestionHides: {} }
}

function normalizePersistedState(value: unknown): PersistedState {
  const parsed = (value ?? {}) as Partial<PersistedState> & {
    suggestionHides?: unknown
  }

  const serverUpdatedAtMs = Number(parsed.serverUpdatedAtMs)

  return {
    tree:
      Array.isArray(parsed.tree) && parsed.tree.length
        ? normalizeTree(parsed.tree as TreeNode[])
        : [],
    zoom: Array.isArray(parsed.zoom) ? (parsed.zoom as Breadcrumb[]) : [],
    view: parsed.view === 'harvest' ? 'harvest' : 'tree',
    suggestionHides: normalizeSuggestionHides(parsed.suggestionHides),
    serverUpdatedAtMs:
      Number.isFinite(serverUpdatedAtMs) && serverUpdatedAtMs > 0
        ? serverUpdatedAtMs
        : undefined,
  }
}

function normalizeSyncablePersistedState(
  value: SyncablePersistedState,
): SyncablePersistedState {
  return {
    tree: normalizeTree(value.tree),
    zoom: Array.isArray(value.zoom) ? value.zoom : [],
    view: value.view === 'harvest' ? 'harvest' : 'tree',
    suggestionHides: normalizeSuggestionHides(value.suggestionHides),
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseServerUpdatedAtMs(value: unknown): number {
  if (typeof value !== 'string') {
    return 0
  }

  const parsedMs = Date.parse(value)
  return Number.isFinite(parsedMs) && parsedMs > 0 ? parsedMs : 0
}

function parseRemoteEntity(payload: unknown): {
  content: unknown
  serverUpdatedAtMs: number
} | null {
  if (!isObject(payload)) {
    return null
  }

  const data = payload.data
  if (!isObject(data)) {
    return null
  }

  const attributes = isObject(data.attributes) ? data.attributes : null
  const content = attributes?.content ?? data.content
  if (typeof content === 'undefined') {
    return null
  }

  const updatedAtRaw = attributes?.updatedAt ?? data.updatedAt
  const serverUpdatedAtMs = parseServerUpdatedAtMs(updatedAtRaw)

  return { content, serverUpdatedAtMs }
}

function openIndexedDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null)
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB'))
    }
  })
}

async function readStateFromIndexedDb(): Promise<PersistedState | null> {
  const db = await openIndexedDb()
  if (!db) {
    return null
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(STATE_KEY)

    request.onsuccess = () => {
      db.close()
      if (!request.result) {
        resolve(null)
        return
      }

      resolve(normalizePersistedState(request.result))
    }

    request.onerror = () => {
      db.close()
      reject(request.error ?? new Error('Failed to read IndexedDB state'))
    }
  })
}

async function writeStateToIndexedDb(state: PersistedState): Promise<void> {
  const db = await openIndexedDb()
  if (!db) {
    return
  }

  const normalizedState = normalizePersistedState(state)

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    store.put(normalizedState, STATE_KEY)

    transaction.oncomplete = () => {
      db.close()
      resolve()
    }

    transaction.onerror = () => {
      db.close()
      reject(transaction.error ?? new Error('Failed to write IndexedDB state'))
    }
  })
}

export async function loadPersistedState(): Promise<PersistedState> {
  const indexedDbState = await readStateFromIndexedDb()
  if (indexedDbState) {
    return indexedDbState
  }

  return emptyPersistedState()
}

export async function savePersistedState(state: PersistedState): Promise<void> {
  await writeStateToIndexedDb(state)
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown
  } catch {
    return null
  }
}

export async function fetchRemotePersistedState(
  jwt: string,
): Promise<RemotePersistedState | null> {
  const response = await fetch(`${API_BASE_URL}/api/todo-trees/me`, {
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  })

  if (response.status === 401 || response.status === 403) {
    return null
  }

  const payload = await parseJsonResponse(response)
  if (!response.ok) {
    throw new Error('Failed to fetch todo tree snapshot.')
  }

  const remoteEntity = parseRemoteEntity(payload)
  if (!remoteEntity) {
    return null
  }

  const state = normalizePersistedState(remoteEntity.content)
  return {
    state: {
      ...state,
      serverUpdatedAtMs:
        remoteEntity.serverUpdatedAtMs > 0
          ? remoteEntity.serverUpdatedAtMs
          : undefined,
    },
    serverUpdatedAtMs: remoteEntity.serverUpdatedAtMs,
  }
}

export async function saveRemotePersistedState(
  jwt: string,
  state: SyncablePersistedState,
): Promise<RemotePersistedState | null> {
  const normalizedState = normalizeSyncablePersistedState(state)

  const response = await fetch(`${API_BASE_URL}/api/todo-trees/me`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        content: normalizedState,
      },
    }),
  })

  if (response.status === 401 || response.status === 403) {
    return null
  }

  const payload = await parseJsonResponse(response)
  if (!response.ok) {
    throw new Error('Failed to save todo tree snapshot.')
  }

  const remoteEntity = parseRemoteEntity(payload)
  if (!remoteEntity) {
    return null
  }

  const normalized = normalizePersistedState(remoteEntity.content)
  return {
    state: {
      ...normalized,
      serverUpdatedAtMs:
        remoteEntity.serverUpdatedAtMs > 0
          ? remoteEntity.serverUpdatedAtMs
          : undefined,
    },
    serverUpdatedAtMs: remoteEntity.serverUpdatedAtMs,
  }
}
