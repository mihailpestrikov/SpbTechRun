import { Link } from 'react-router-dom'
import { useAuthStore, useCartStore } from '@/store'
import { Button } from '@/components/ui/button'
import { SearchBar } from './SearchBar'

export function Header() {
  const { isAuthenticated, user } = useAuthStore()
  const totalItems = useCartStore((s) => s.totalItems())

  return (
    <header className="bg-red-700 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold hover:text-red-100 shrink-0">
          SpbTechRun
        </Link>

        <div className="flex-1 max-w-xl mx-8">
          <SearchBar />
        </div>

        <nav className="flex items-center gap-6 shrink-0">
          <Link to="/cart" className="hover:text-red-200 transition-colors relative">
            Корзина
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-4 bg-white text-red-700 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {totalItems}
              </span>
            )}
          </Link>

          {isAuthenticated ? (
            <Link to="/profile" className="hover:text-red-200 transition-colors">
              {user?.name}
            </Link>
          ) : (
            <Link to="/login">
              <Button variant="secondary" size="sm" className="bg-white text-red-700 hover:bg-red-50">
                Войти
              </Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
