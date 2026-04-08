import { createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { RootLayout } from '../components/layout/RootLayout'
import '../styles.css'

export const Route = createRootRoute({
  component: Root,
})

function Root() {
  return (
    <>
      <RootLayout />
      <TanStackRouterDevtools />
    </>
  )
}
