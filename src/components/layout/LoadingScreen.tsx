import { BrandHeader } from './BrandHeader'

export function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="app">
      <header className="header">
        <BrandHeader />
      </header>

      <main className="main loading-main">
        <div className="loading-shell">
          <div className="loading-spinner" />
          <div className="loading-copy">{message}</div>
        </div>
      </main>
    </div>
  )
}
