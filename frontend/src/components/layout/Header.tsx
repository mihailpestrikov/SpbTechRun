import { Link } from 'react-router-dom'
import { ShoppingCart, User, LogIn } from 'lucide-react'
import { useAuthStore, useCartStore } from '@/store'
import { Button } from '@/components/ui/button'
import { SearchBar } from './SearchBar'

export function Header() {
  const { isAuthenticated, user } = useAuthStore()
  const totalItems = useCartStore((s) => s.totalItems())

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200/50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-8">
        <Link
          to="/"
          className="text-xl font-bold text-gray-900 hover:text-red-600 transition-colors shrink-0 flex items-center gap-2"
        >
          <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-rose-600 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-md">
            S
          </div>
          <span className="hidden sm:inline">SpbTechRun</span>
        </Link>

        <div className="flex-1 max-w-2xl">
          <SearchBar />
        </div>

        <nav className="flex items-center gap-2 shrink-0">
          <Link
            to="/cart"
            className="relative p-2.5 rounded-xl hover:bg-gray-100 transition-all duration-200 group"
          >
            <ShoppingCart className="w-5 h-5 text-gray-600 group-hover:text-red-600 transition-colors" />
            {totalItems > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-gradient-to-r from-red-500 to-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow-md animate-fade-in">
                {totalItems > 99 ? '99+' : totalItems}
              </span>
            )}
          </Link>

          {isAuthenticated ? (
            <Link
              to="/profile"
              className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition-all duration-200 group"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-gray-600" />
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 hidden md:inline max-w-[120px] truncate">
                {user?.name}
              </span>
            </Link>
          ) : (
            <Link to="/login">
              <Button
                size="sm"
                className="bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white shadow-md hover:shadow-lg transition-all duration-200 rounded-xl px-4"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Войти
              </Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
