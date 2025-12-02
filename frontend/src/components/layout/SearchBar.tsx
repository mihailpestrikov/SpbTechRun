import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowRight, Folder } from 'lucide-react'
import { useSearch } from '@/hooks'
import { capitalize } from '@/lib/utils'
import type { Product } from '@/types'

export function SearchBar() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: searchData } = useSearch({ q: query.length >= 2 ? query : undefined, limit: 5 })
  const products = searchData?.products
  const categories = searchData?.aggregations?.categories?.filter(c => c.count > 0) || []

  const hasResults = (products && products.length > 0) || categories.length > 0

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setIsFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSearch = () => {
    if (query.trim()) {
      navigate(`/?q=${encodeURIComponent(query.trim())}`)
      setIsOpen(false)
      inputRef.current?.blur()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
    if (e.key === 'Escape') {
      setIsOpen(false)
      inputRef.current?.blur()
    }
  }

  const handleProductClick = (productId: number) => {
    navigate(`/product/${productId}`)
    setQuery('')
    setIsOpen(false)
  }

  const handleCategoryClick = (categoryId: number) => {
    navigate(`/?category=${categoryId}`)
    setQuery('')
    setIsOpen(false)
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={`
          relative flex items-center transition-all duration-300
          ${isFocused ? 'scale-[1.02]' : 'scale-100'}
        `}
      >
        <Search className={`
          absolute left-3.5 w-4 h-4 transition-colors duration-200 pointer-events-none
          ${isFocused ? 'text-red-500' : 'text-gray-400'}
        `} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Поиск товаров..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            setIsOpen(true)
            setIsFocused(true)
          }}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          className={`
            w-full h-11 pl-10 pr-4 rounded-xl text-sm
            bg-gray-100/80 border-2 border-transparent
            placeholder:text-gray-400
            transition-all duration-300 ease-out
            focus:outline-none focus:bg-white focus:border-red-200 focus:shadow-lg focus:shadow-red-100/50
            hover:bg-gray-100
          `}
        />
      </div>

      {isOpen && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 max-h-[420px] overflow-hidden z-50 animate-slide-down">
          {!hasResults ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Search className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-gray-500 text-sm">Ничего не найдено по запросу "{query}"</p>
            </div>
          ) : (
            <div className="overflow-y-auto max-h-[420px] scrollbar-thin">
              {categories.length > 0 && (
                <div className="p-2">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-2">
                    Категории
                  </div>
                  {categories.slice(0, 3).map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleCategoryClick(cat.id)}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 rounded-xl text-sm text-gray-700 flex items-center gap-3 transition-colors group"
                    >
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center group-hover:bg-red-50 transition-colors flex-shrink-0">
                        <Folder className="w-4 h-4 text-gray-400 group-hover:text-red-500 transition-colors" />
                      </div>
                      <span className="flex-1 line-clamp-2">{cat.name}</span>
                      <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-red-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {products && products.length > 0 && (
                <div className="p-2 border-t border-gray-100">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-2">
                    Товары
                  </div>
                  {products.slice(0, 5).map((product: Product) => (
                    <button
                      key={product.id}
                      onClick={() => handleProductClick(product.id)}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 rounded-xl flex items-center gap-3 transition-colors group"
                    >
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                        {product.picture ? (
                          <img
                            src={product.picture}
                            alt=""
                            className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800 truncate font-medium">{capitalize(product.name)}</div>
                        <div className="text-sm font-semibold text-red-600">{product.price.toLocaleString()} ₽</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="p-2 border-t border-gray-100 bg-gray-50/50">
                <button
                  onClick={handleSearch}
                  className="w-full p-3 text-center text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  Показать все результаты
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
