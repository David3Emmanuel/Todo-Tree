import { useEffect, useMemo, useState } from 'react'
import { Check, FolderTree, Minus } from 'lucide-react'
import { findNode } from './tree-utils'
import type { TreeNode } from './types'

type UseFocusOptions = {
  tree: TreeNode[]
}

type UseFocusResult = {
  focusRootId: string | null
  focusRoot: TreeNode | null
  openFocus: (nodeId: string) => void
  closeFocus: () => void
}

export function useFocus({ tree }: UseFocusOptions): UseFocusResult {
  const [focusRootId, setFocusRootId] = useState<string | null>(null)

  const focusRoot = useMemo(
    () => (focusRootId ? findNode(tree, focusRootId) : null),
    [tree, focusRootId],
  )

  useEffect(() => {
    if (!focusRootId) {
      return
    }

    if (!focusRoot) {
      setFocusRootId(null)
    }
  }, [focusRoot, focusRootId])

  useEffect(() => {
    if (!focusRoot) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFocusRootId(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusRoot])

  return {
    focusRootId,
    focusRoot,
    openFocus: setFocusRootId,
    closeFocus: () => setFocusRootId(null),
  }
}
