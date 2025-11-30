import type { ReactNode } from 'react'
import { Header } from './Header'

interface PageLayoutProps {
  children: ReactNode
}

export function PageLayout({ children }: PageLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {children}
      </main>
      <footer className="bg-gray-100 border-t py-6 text-center text-gray-600">
        <p>SpbTechRun &copy; 2025</p>
      </footer>
    </div>
  )
}
