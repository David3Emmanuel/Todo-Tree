import { useState, useEffect } from 'react'
import {
  readParsedFromStorage,
  writeJsonToStorage,
} from '../../utils/storage'
import { getProgress, getAllStarred, getHarvestSections } from './tree-utils'
import type { TreeNode } from './types'

export type DaySnapshot = {
  date: string // "YYYY-MM-DD"
  total: number
  done: number
  today: number
  soon: number
  starred: number
}

const STORAGE_KEY = 'todo-tree-activity'
const MAX_DAYS = 60

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function validateHistory(value: unknown): DaySnapshot[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is DaySnapshot =>
      item !== null &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).date === 'string' &&
      typeof (item as Record<string, unknown>).total === 'number' &&
      typeof (item as Record<string, unknown>).done === 'number',
  )
}

function readHistory(): DaySnapshot[] {
  return readParsedFromStorage(STORAGE_KEY, validateHistory, [])
}

function writeHistory(history: DaySnapshot[]): void {
  const trimmed = [...history]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_DAYS)
  writeJsonToStorage(STORAGE_KEY, trimmed)
}

function computeSnapshot(tree: TreeNode[]): DaySnapshot {
  const syntheticRoot: TreeNode = {
    id: '__root__',
    text: '',
    completed: false,
    collapsed: false,
    starred: false,
    children: tree,
  }
  const { done, total } = getProgress(syntheticRoot)
  const starred = getAllStarred(tree).length
  const sections = getHarvestSections(tree)
  const todayCount =
    sections.find((s) => s.priority === 'today')?.items.length ?? 0
  const soonCount =
    sections.find((s) => s.priority === 'soon')?.items.length ?? 0
  return {
    date: todayStr(),
    total,
    done,
    today: todayCount,
    soon: soonCount,
    starred,
  }
}

export function useActivityHistory(tree: TreeNode[]): DaySnapshot[] {
  const [history, setHistory] = useState<DaySnapshot[]>(() => readHistory())

  useEffect(() => {
    const t = setTimeout(() => {
      const snap = computeSnapshot(tree)
      const existing = readHistory()
      const updated = [
        ...existing.filter((d) => d.date !== snap.date),
        snap,
      ]
      writeHistory(updated)
      setHistory(updated)
    }, 2000)
    return () => clearTimeout(t)
  }, [tree])

  return history
}
