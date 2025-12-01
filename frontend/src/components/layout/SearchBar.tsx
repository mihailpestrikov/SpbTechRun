import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { useProductSearch, useCategories } from '@/hooks'

export function SearchBar() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: products } = useProductSearch(query)
  const { data: allCategories } = useCategories()

  const categories = useMemo(() => {
    if (!query || query.length < 2 || !allCategories) return []
    const q = query.toLowerCase()
    return allCategories.filter((c) => c.name.toLowerCase().includes(q))
  }, [query, allCategories])

  const hasResults = (products && products.length > 0) || categories.length > 0

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
      <Input
        placeholder="Поиск товаров..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        className="bg-white/90 border-0 focus-visible:ring-2 focus-visible:ring-white"
      />

      {isOpen && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border max-h-96 overflow-y-auto z-50">
          {!hasResults ? (
            <div className="p-4 text-center text-gray-500">Ничего не найдено</div>
          ) : (
            <>
              {categories.length > 0 && (
                <div className="p-2 border-b">
                  <div className="text-xs font-medium text-gray-400 px-2 mb-1">Категории</div>
                  {categories.slice(0, 3).map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleCategoryClick(cat.id)}
                      className="w-full text-left px-2 py-1.5 hover:bg-gray-100 rounded text-sm text-gray-700"
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}

              {products && products.length > 0 && (
                <div className="p-2">
                  <div className="text-xs font-medium text-gray-400 px-2 mb-1">Товары</div>
                  {products.slice(0, 5).map((product) => (
                    <button
                      key={product.id}
                      onClick={() => handleProductClick(product.id)}
                      className="w-full text-left px-2 py-2 hover:bg-gray-100 rounded flex items-center gap-3"
                    >
                      {product.picture ? (
                        <img src={product.picture} alt="" className="w-10 h-10 object-contain rounded flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 bg-gray-200 rounded flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800 truncate">{product.name}</div>
                        <div className="text-sm font-medium text-red-700">{product.price} ₽</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
