import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import type { Breadcrumb, TreeNode } from './types'

function resolveZoomFromSegments(
  tree: TreeNode[],
  segments: string[],
): Breadcrumb[] {
  const zoom: Breadcrumb[] = []
  let level = tree

  for (const segment of segments) {
    const node = level.find((candidate) => candidate.id === segment)
    if (!node) {
      break
    }

    zoom.push({ id: node.id, text: node.text })
    level = node.children
  }

  return zoom
}

function isSameZoom(a: Breadcrumb[], b: Breadcrumb[]): boolean {
  if (a.length !== b.length) return false

  for (let index = 0; index < a.length; index += 1) {
    if (a[index].id !== b[index].id || a[index].text !== b[index].text) {
      return false
    }
  }

  return true
}

function toBreadcrumbPath(zoom: Breadcrumb[]): string {
  if (!zoom.length) return '/'

  return `/${zoom.map((crumb) => encodeURIComponent(crumb.id)).join('/')}`
}

export type UseZoomSyncResult = {
  setZoomFromUi: Dispatch<SetStateAction<Breadcrumb[]>>
}

export type UseZoomSyncArgs = {
  isAuthenticated: boolean
  isReady: boolean
  tree: TreeNode[]
  zoom: Breadcrumb[]
  setZoom: Dispatch<SetStateAction<Breadcrumb[]>>
  pathSegments: string[]
  locationPathname: string
  navigate: (options: { to: string; replace?: boolean }) => void | Promise<void>
}

export function useZoomSync({
  isAuthenticated,
  isReady,
  tree,
  zoom,
  setZoom,
  pathSegments,
  locationPathname,
  navigate,
}: UseZoomSyncArgs): UseZoomSyncResult {
  const zoomSyncSourceRef = useRef<'path' | 'ui' | null>(null)
  const pathKey = useMemo(() => pathSegments.join('/'), [pathSegments])
  const resolvedZoomFromPath = useMemo(
    () => resolveZoomFromSegments(tree, pathSegments),
    [tree, pathKey, pathSegments],
  )
  const zoomPath = useMemo(() => toBreadcrumbPath(zoom), [zoom])

  const setZoomFromUi = useCallback<Dispatch<SetStateAction<Breadcrumb[]>>>(
    (value) => {
      zoomSyncSourceRef.current = 'ui'
      setZoom(value)
    },
    [setZoom],
  )

  useEffect(() => {
    if (!isAuthenticated || !isReady) {
      return
    }

    if (locationPathname === zoomPath) {
      if (zoomSyncSourceRef.current === 'ui') {
        zoomSyncSourceRef.current = null
      }
      return
    }

    if (zoomSyncSourceRef.current === 'ui') {
      return
    }

    zoomSyncSourceRef.current = 'path'
    setZoom((prev) =>
      isSameZoom(prev, resolvedZoomFromPath) ? prev : resolvedZoomFromPath,
    )
  }, [
    isAuthenticated,
    isReady,
    locationPathname,
    zoomPath,
    resolvedZoomFromPath,
    setZoom,
  ])

  useEffect(() => {
    if (!isReady) {
      return
    }

    if (
      zoomSyncSourceRef.current === 'path' &&
      !isSameZoom(zoom, resolvedZoomFromPath)
    ) {
      return
    }

    const nextPath = toBreadcrumbPath(zoom)
    if (locationPathname !== nextPath) {
      void navigate({ to: nextPath, replace: true })
      return
    }

    if (zoomSyncSourceRef.current === 'path') {
      zoomSyncSourceRef.current = null
    }
  }, [isReady, zoom, resolvedZoomFromPath, locationPathname, navigate])

  return {
    setZoomFromUi,
  }
}
