import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageLayout } from '@/components/layout'
import { ProductGrid } from '@/components/product'
import { CategoryTree, buildCountsMap } from '@/components/filters'
import { useSearch, useCategories } from '@/hooks'
import { useCartStore } from '@/store'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { SearchFilter } from '@/types'

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
  const searchQuery = searchParams.get('q') || ''

  const [selectedCategories, setSelectedCategories] = useState<number[]>([])
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [selectedVendors, setSelectedVendors] = useState<string[]>([])
  const [available, setAvailable] = useState<boolean | undefined>()
  const [page, setPage] = useState(1)

  const debouncedCategories = useDebounce(selectedCategories, DEBOUNCE_MS)
  const debouncedMinPrice = useDebounce(minPrice, DEBOUNCE_MS)
  const debouncedMaxPrice = useDebounce(maxPrice, DEBOUNCE_MS)
  const debouncedVendors = useDebounce(selectedVendors, DEBOUNCE_MS)

  const { fetchCart } = useCartStore()
  const { data: categories } = useCategories()

  useEffect(() => {
    fetchCart()
  }, [fetchCart])

  useEffect(() => {
    setPage(1)
    setSelectedCategories([])
    setSelectedVendors([])
    setAvailable(undefined)
    setMinPrice('')
    setMaxPrice('')
  }, [searchQuery])

  useEffect(() => {
    setPage(1)
  }, [debouncedCategories, debouncedMinPrice, debouncedMaxPrice, debouncedVendors, available])

  const leafCategories = useMemo(() => {
    if (!categories || debouncedCategories.length === 0) return []
    const selectedSet = new Set(debouncedCategories)
    return debouncedCategories.filter(id => {
      const hasSelectedChild = categories.some(c => c.parent_id === id && selectedSet.has(c.id))
      return !hasSelectedChild
    })
  }, [categories, debouncedCategories])

  const searchFilter: SearchFilter = useMemo(() => ({
    q: searchQuery || undefined,
    category_ids: leafCategories.length > 0 ? leafCategories : undefined,
    min_price: debouncedMinPrice ? parseFloat(debouncedMinPrice) : undefined,
    max_price: debouncedMaxPrice ? parseFloat(debouncedMaxPrice) : undefined,
    vendors: debouncedVendors.length > 0 ? debouncedVendors : undefined,
    available,
    limit: ITEMS_PER_PAGE,
    offset: (page - 1) * ITEMS_PER_PAGE,
  }), [searchQuery, leafCategories, debouncedMinPrice, debouncedMaxPrice, debouncedVendors, available, page])

  const { data: searchData, isLoading } = useSearch(searchFilter)
  const { data: initialSearchData } = useSearch({ limit: 1 })

  const products = searchData?.products
  const total = searchData?.total
  const aggregations = searchData?.aggregations
  const categoryCounts = useMemo(() => buildCountsMap(aggregations?.categories), [aggregations?.categories])

  const allVendors = initialSearchData?.aggregations?.vendors
  const vendorCounts = useMemo(() => {
    const map = new Map<string, number>()
    if (aggregations?.vendors) {
      for (const v of aggregations.vendors) {
        map.set(v.name, v.count)
      }
    }
    return map
  }, [aggregations?.vendors])

  const handleClearSearch = () => {
    const newParams = new URLSearchParams(searchParams)
    newParams.delete('q')
    setSearchParams(newParams)
  }

  const hasActiveFilters = selectedCategories.length > 0 || selectedVendors.length > 0 || debouncedMinPrice || debouncedMaxPrice || available

  const handleResetFilters = () => {
    setSelectedCategories([])
    setMinPrice('')
    setMaxPrice('')
    setSelectedVendors([])
    setAvailable(undefined)
  }

  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {searchQuery ? (
          <div className="mb-6">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
              <button onClick={handleClearSearch} className="hover:text-red-700">
                Все товары
              </button>
              <span>/</span>
              <span className="text-gray-800">Поиск: "{searchQuery}"</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-800">
              Результаты поиска
              {total !== undefined && <span className="text-lg font-normal text-gray-500 ml-2">({total})</span>}
            </h1>
          </div>
        ) : (
          <h1 className="text-3xl font-bold text-gray-800 mb-6">
            Каталог товаров
            {total !== undefined && <span className="text-lg font-normal text-gray-500 ml-2">({total})</span>}
          </h1>
        )}

        <div className="flex gap-8">
          <aside className="w-64 shrink-0">
            <Card className="p-4 space-y-6">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                disabled={!hasActiveFilters}
                className="w-full"
              >
                Сбросить фильтры
              </Button>

              {categories && categories.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3">Категории</h3>
                  <CategoryTree
                    categories={categories}
                    counts={categoryCounts}
                    selected={selectedCategories}
                    onChange={setSelectedCategories}
                  />
                </div>
              )}

              <div>
                <h3 className="font-semibold text-gray-700 mb-3">Цена, ₽</h3>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder={aggregations?.price_range ? `от ${Math.floor(aggregations.price_range.min)}` : 'От'}
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className="w-full"
                  />
                  <Input
                    type="number"
                    placeholder={aggregations?.price_range ? `до ${Math.ceil(aggregations.price_range.max)}` : 'До'}
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              {allVendors && allVendors.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3">Производитель</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {allVendors.map((v) => (
                      <label key={v.name} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedVendors.includes(v.name)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedVendors([...selectedVendors, v.name])
                            } else {
                              setSelectedVendors(selectedVendors.filter(x => x !== v.name))
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm flex-1 truncate">{v.name}</span>
                        <span className="text-xs text-gray-500">({vendorCounts.get(v.name) ?? 0})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={available === true}
                    onChange={(e) => setAvailable(e.target.checked ? true : undefined)}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm">Только в наличии</span>
                </label>
              </div>
            </Card>
          </aside>

          <div className="flex-1">
            {!searchQuery && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                <h2 className="font-semibold text-red-800 mb-2">Рекомендуем вам</h2>
                <p className="text-gray-600 text-sm">Здесь будет карусель рекомендаций</p>
              </div>
            )}

            <ProductGrid products={products || []} isLoading={isLoading} />

            {total !== undefined && total > 0 && (
              <div className="mt-6">
                <p className="text-gray-500 text-sm mb-4">
                  Показано {Math.min(page * ITEMS_PER_PAGE, total)} из {total} товаров
                </p>

                {total > ITEMS_PER_PAGE && (
                  <Pagination
                    currentPage={page}
                    totalPages={Math.ceil(total / ITEMS_PER_PAGE)}
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
