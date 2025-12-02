import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { useProductSearch, useCategorySearch } from '@/hooks'
import { AiOutlineClose} from 'react-icons/ai'


export function SearchBar() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: products } = useProductSearch(query)
  const { data: categories } = useCategorySearch(query)

  const hasResults = (products && products.length > 0) || (categories && categories.length > 0)

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
      <div className="relative flex items-center">
        <Input
          placeholder="Поиск товаров..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => setIsOpen(true)}
          className="w-full border-0 rounded-[10px] bg-white/70 focus-visible:ring-2 focus-visible:ring-white pr-10"
          
        />
        {/* Кнопка крестик для очистки */}
        {query && (
          <button 
            onClick={() => setQuery('')} 
            className="absolute right-2 text-gray-400 hover:text-gray-700"
          >
            <AiOutlineClose size={18} />
          </button>
        )}
        
      </div>

      {isOpen && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-[15px] shadow-lg max-h-100 overflow-y-auto z-50"
        style={{
          marginLeft: '-5px',
          marginRight: '-5px',

        }}>
          {!hasResults ? (
            <div className="p-4 text-center text-gray-500 ">Ничего не найдено</div>
          ) : (
            <>
              {categories && categories.length > 0 && (
                <div className="p-2 border-b mb-1">
                  <div className="text-xs font-medium text-gray-500 px-2 mb-1">Категории</div>
                  {categories.slice(0, 3).map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleCategoryClick(cat.id)}
                      className="w-full text-left px-2 py-1.5 hover:bg-red-700 hover:text-white rounded-[10px] text-sm text-gray-700"
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}

              {products && products.length > 0 && (
                <div className="p-2 ">
                  <div className="text-xs font-medium text-gray-500 px-2 mb-1">Товары</div>
                  
                  {products.slice(0, 5).map((product) => (
                    <button
                      key={product.id}
                      onClick={() => handleProductClick(product.id)}
                      className="w-full text-left px-2 py-2 hover:bg-red-700 group rounded-[10px] flex items-center gap-3"
                    >
                      <div className="w-10 h-10 bg-gray-200 rounded-[10px] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800  truncate group-hover:text-white">{product.name}</div>
                        <div className="text-sm font-medium text-text text-lg group-hover:text-white">{product.price} ₽/шт.</div>
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
