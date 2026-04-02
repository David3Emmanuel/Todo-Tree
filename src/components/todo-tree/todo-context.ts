import { createContext, useContext } from 'react'
import type { CtxValue } from './types'

export const TodoCtx = createContext<CtxValue | null>(null)

export function useTodoCtx(): CtxValue {
  const value = useContext(TodoCtx)
  if (!value) throw new Error('TodoTree context not initialized')
  return value
}
