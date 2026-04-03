import { Outlet } from '@tanstack/react-router'
import { AuthProvider } from '../auth/auth-context'

export function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  )
}
