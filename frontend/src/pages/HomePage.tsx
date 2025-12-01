import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageLayout } from '@/components/layout'
import { ProductGrid } from '@/components/product'
import { useProducts, useCategories } from '@/hooks'
import { useCartStore } from '@/store'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { ProductFilter } from '@/types'

const ITEMS_PER_PAGE = 21
const DEBOUNCE_MS = 700

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const categoryId = searchParams.get('category')
    ? parseInt(searchParams.get('category')!)
    : undefined

  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [page, setPage] = useState(1)

  const debouncedMinPrice = useDebounce(minPrice, DEBOUNCE_MS)
  const debouncedMaxPrice = useDebounce(maxPrice, DEBOUNCE_MS)

  const { fetchCart } = useCartStore()

  useEffect(() => {
    fetchCart()
  }, [fetchCart])

  useEffect(() => {
    setPage(1)
  }, [categoryId, debouncedMinPrice, debouncedMaxPrice])

  const filter: ProductFilter = useMemo(() => ({
    category_id: categoryId,
    min_price: debouncedMinPrice ? parseFloat(debouncedMinPrice) : undefined,
    max_price: debouncedMaxPrice ? parseFloat(debouncedMaxPrice) : undefined,
    limit: ITEMS_PER_PAGE,
    offset: (page - 1) * ITEMS_PER_PAGE,
  }), [categoryId, debouncedMinPrice, debouncedMaxPrice, page])

  const { data: productsData, isLoading: productsLoading } = useProducts(filter)
  const { data: categories } = useCategories()

  const currentCategory = useMemo(() => {
    if (!categoryId || !categories) return null
    return categories.find((c) => c.id === categoryId)
  }, [categoryId, categories])

  const breadcrumbs = useMemo(() => {
    if (!currentCategory || !categories) return []
    const path: typeof categories = []
    let current: typeof currentCategory | undefined = currentCategory
    while (current) {
      path.unshift(current)
      current = categories.find((c) => c.id === current?.parent_id)
    }
    return path
  }, [currentCategory, categories])

  const handleClearCategory = () => {
    setSearchParams({})
  }

  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {breadcrumbs.length > 0 ? (
          <div className="mb-6">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <button onClick={handleClearCategory} className="hover:text-red-700">
                Все товары
              </button>
              {breadcrumbs.map((cat, idx) => (
                <span key={cat.id} className="flex items-center gap-2">
                  <span>/</span>
                  {idx === breadcrumbs.length - 1 ? (
                    <span className="text-gray-800">{cat.name}</span>
                  ) : (
                    <button
                      onClick={() => setSearchParams({ category: String(cat.id) })}
                      className="hover:text-red-700"
                    >
                      {cat.name}
                    </button>
                  )}
                </span>
              ))}
            </div>
            <h1 className="text-3xl font-bold text-gray-800">{currentCategory?.name}</h1>
          </div>
        ) : (
          <h1 className="text-3xl font-bold text-gray-800 mb-6">Каталог товаров</h1>
        )}

        <div className="flex gap-8">
          <aside className="w-64 shrink-0">
            <Card className="p-4">
              <h2 className="font-semibold text-gray-700 mb-4">Цена, ₽</h2>
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="От"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="w-full"
                />
                <Input
                  type="number"
                  placeholder="До"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="w-full"
                />
              </div>
            </Card>
          </aside>

          <div className="flex-1">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <h2 className="font-semibold text-red-800 mb-2">Рекомендуем вам</h2>
              <p className="text-gray-600 text-sm">Здесь будет карусель рекомендаций</p>
            </div>

            <ProductGrid products={productsData?.products || []} isLoading={productsLoading} />

            {productsData && productsData.total > 0 && (
              <div className="mt-6">
                <p className="text-gray-500 text-sm mb-4">
                  Показано {Math.min(page * ITEMS_PER_PAGE, productsData.total)} из {productsData.total} товаров
                </p>

                {productsData.total > ITEMS_PER_PAGE && (
                  <Pagination
                    currentPage={page}
                    totalPages={Math.ceil(productsData.total / ITEMS_PER_PAGE)}
                    onPageChange={setPage}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  )
}

interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = []
    const showPages = 5

    if (totalPages <= showPages + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)

      let start = Math.max(2, currentPage - 1)
      let end = Math.min(totalPages - 1, currentPage + 1)

      if (currentPage <= 3) {
        end = showPages - 1
      } else if (currentPage >= totalPages - 2) {
        start = totalPages - showPages + 2
      }

      if (start > 2) pages.push('ellipsis')
      for (let i = start; i <= end; i++) pages.push(i)
      if (end < totalPages - 1) pages.push('ellipsis')

      pages.push(totalPages)
    }

    return pages
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        ←
      </Button>

      {getPageNumbers().map((p, idx) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">...</span>
        ) : (
          <Button
            key={p}
            variant={p === currentPage ? 'default' : 'outline'}
            size="sm"
            onClick={() => onPageChange(p)}
            className={p === currentPage ? 'bg-red-700 hover:bg-red-800' : ''}
          >
            {p}
          </Button>
        )
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        →
      </Button>
    </div>
  )
}
