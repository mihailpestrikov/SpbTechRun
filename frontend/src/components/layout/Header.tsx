import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore, useCartStore } from '@/store'
import { Button } from '@/components/ui/button'
import { CatalogModal } from '@/components/catalog'
import { SearchBar } from './SearchBar'
import { SlBasket } from "react-icons/sl";
import { GoPerson } from "react-icons/go";


export function Header() {
  const { isAuthenticated, user } = useAuthStore()
  const totalItems = useCartStore((s) => s.totalItems())
  const [isCatalogOpen, setIsCatalogOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)

  // Отслеживаем скролл страницы
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  
  return (
    <>
      <header className={`fixed top-0 left-0 w-full z-50 bg-white/10 backdrop-blur-sm transition-shadow ${isScrolled ? 'shadow-md' : ''}`}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-red-700 text-xl font-bold hover:text-red-800 shrink-0">
              SpbTechRun
            </Link>

            <Button
              onClick={() => setIsCatalogOpen(true)}
              className="bg-red-700 text-white hover:bg-red-800 flex items-center gap-2 shrink-0 rounded-[12px]"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              Каталог
            </Button>
          </div>

          <div className="flex-1 max-w-xl mx-8 p-1 border-[2px] border-red-700 rounded-[15px] ">
            <SearchBar />
          </div>



          <nav className="flex items-center gap-6 shrink-0">
            <Link to="/cart" className="hover:text-red-800 transition-colors relative">

              <div className="flex flex-col items-center">
                <SlBasket className="w-6 h-6 mb-1" />
                <span className="text-xs">Корзина</span>
              </div>
              {totalItems > 0 && (
                <span className="absolute -top-2 -right-4 bg-red-700 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center align-center">
                  {totalItems}
                </span>
              )}
            </Link>

            {isAuthenticated ? (
              <Link to="/profile" className="hover:text-red-800 transition-colors flex flex-col items-center">
                <GoPerson className="w-6 h-6" />
                <span className="text-xs mt-1 text-center leading-tight">
                  {user?.name}
                </span>
              </Link>
            ) : (
              <Link to="/login">
                <Button variant="secondary" size="sm" className="bg-red-700 text-white hover:bg-red-800 flex items-center  justify-center rounded-[12px]">
                  
                  Войти
                </Button>
              </Link>
            )}
          </nav>
          </div>
      </header>
      <div className="h-[80px]"></div>

      <CatalogModal isOpen={isCatalogOpen} onClose={() => setIsCatalogOpen(false)} />
    </>
  )
}
