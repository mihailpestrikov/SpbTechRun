import { useState, useMemo, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X, SlidersHorizontal, Check, Sparkles } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { ProductGrid } from '@/components/product'
import { CategoryTree, buildCountsMap } from '@/components/filters'
import { useSearch, useCategories } from '@/hooks'
import { useCartStore } from '@/store'
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
  const categoryParam = searchParams.get('category')

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

  const skipNextReset = useRef(false)

  const getCategoryPath = (categoryId: number): number[] => {
    if (!categories) return [categoryId]
    const path: number[] = []
    let currentId: number | null = categoryId
    while (currentId !== null) {
      path.unshift(currentId)
      const cat = categories.find(c => c.id === currentId)
      if (!cat) break
      currentId = cat.parent_id ?? null
    }
    return path
  }

  useEffect(() => {
    if (categoryParam && categories) {
      const categoryId = parseInt(categoryParam, 10)
      if (!isNaN(categoryId)) {
        skipNextReset.current = true
        setPage(1)
        setSelectedCategories(getCategoryPath(categoryId))
        setSelectedVendors([])
        setAvailable(undefined)
        setMinPrice('')
        setMaxPrice('')
        const newParams = new URLSearchParams(searchParams)
        newParams.delete('category')
        setSearchParams(newParams, { replace: true })
      }
    }
  }, [categoryParam, categories])

  const prevSearchQuery = useRef(searchQuery)
  useEffect(() => {
    if (prevSearchQuery.current !== searchQuery) {
      prevSearchQuery.current = searchQuery
      if (skipNextReset.current) {
        skipNextReset.current = false
        return
      }
      setPage(1)
      setSelectedCategories([])
      setSelectedVendors([])
      setAvailable(undefined)
      setMinPrice('')
      setMaxPrice('')
    }
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
    if (allVendors) {
      for (const v of allVendors) {
        map.set(v.name, v.count)
      }
    }
    return map
  }, [allVendors])

  const handleClearSearch = () => {
    const newParams = new URLSearchParams(searchParams)
    newParams.delete('q')
    setSearchParams(newParams)
  }

  const hasActiveFilters = selectedCategories.length > 0 || selectedVendors.length > 0 || debouncedMinPrice || debouncedMaxPrice || available
  const activeFiltersCount = selectedCategories.length + selectedVendors.length + (debouncedMinPrice ? 1 : 0) + (debouncedMaxPrice ? 1 : 0) + (available ? 1 : 0)

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
          <div className="mb-8 animate-fade-in">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
              <button onClick={handleClearSearch} className="hover:text-red-600 transition-colors">
                Все товары
              </button>
              <ChevronRight className="w-4 h-4" />
              <span className="text-gray-800 font-medium">Поиск: "{searchQuery}"</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">
              Результаты поиска
              {total !== undefined && (
                <span className="text-lg font-normal text-gray-400 ml-3">
                  {total.toLocaleString()} товаров
                </span>
              )}
            </h1>
          </div>
        ) : (
          <div className="mb-8 animate-fade-in">
            <h1 className="text-3xl font-bold text-gray-900">
              Каталог товаров
              {total !== undefined && (
                <span className="text-lg font-normal text-gray-400 ml-3">
                  {total.toLocaleString()} товаров
                </span>
              )}
            </h1>
          </div>
        )}

        <div className="flex gap-8">
          <aside className="w-90 shrink-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden sticky top-20">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-gray-500" />
                  <span className="font-semibold text-gray-800">Фильтры</span>
                  {activeFiltersCount > 0 && (
                    <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                      {activeFiltersCount}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleResetFilters}
                  disabled={!hasActiveFilters}
                  className="text-sm text-gray-500 hover:text-red-600 disabled:opacity-40 disabled:hover:text-gray-500 transition-colors flex items-center gap-1"
                >
                  <X className="w-3.5 h-3.5" />
                  Сбросить
                </button>
              </div>

              <div className="p-5 space-y-6 max-h-[calc(100vh-180px)] overflow-y-auto scrollbar-thin">
                {categories && categories.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                      Категории
                    </h3>
                    <CategoryTree
                      categories={categories}
                      counts={categoryCounts}
                      selected={selectedCategories}
                      onChange={setSelectedCategories}
                    />
                  </div>
                )}

                <div className="border-t border-gray-100 pt-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                    Цена, ₽
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="От"
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 transition-all"
                    />
                    <input
                      type="number"
                      placeholder="До"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 transition-all"
                    />
                  </div>
                </div>

                {allVendors && allVendors.length > 0 && (
                  <div className="border-t border-gray-100 pt-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                      Производитель
                    </h3>
                    <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                      {allVendors.map((v) => {
                        const isChecked = selectedVendors.includes(v.name)
                        const count = vendorCounts.get(v.name) ?? 0
                        return (
                          <label
                            key={v.name}
                            className={`flex items-center gap-3 cursor-pointer p-2 rounded-lg transition-colors ${
                              isChecked ? 'bg-red-50' : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                              isChecked
                                ? 'bg-red-500 border-red-500'
                                : 'border-gray-300 hover:border-gray-400'
                            }`}>
                              {isChecked && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedVendors([...selectedVendors, v.name])
                                } else {
                                  setSelectedVendors(selectedVendors.filter(x => x !== v.name))
                                }
                              }}
                              className="sr-only"
                            />
                            <span className={`text-sm flex-1 truncate ${isChecked ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                              {v.name}
                            </span>
                            <span className={`text-xs ${isChecked ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                              {count}
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="border-t border-gray-100 pt-6">
                  <label
                    className={`flex items-center gap-3 cursor-pointer p-2 rounded-lg transition-colors ${
                      available ? 'bg-green-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                      available
                        ? 'bg-green-500 border-green-500'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}>
                      {available && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <input
                      type="checkbox"
                      checked={available === true}
                      onChange={(e) => setAvailable(e.target.checked ? true : undefined)}
                      className="sr-only"
                    />
                    <span className={`text-sm ${available ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                      Только в наличии
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {!searchQuery && (
              <div className="bg-gradient-to-r from-red-50 to-rose-50 rounded-2xl p-6 mb-8 border border-red-100">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-red-500" />
                  <h2 className="font-semibold text-gray-900">Рекомендуем вам</h2>
                </div>
                <p className="text-gray-600 text-sm">Персональные рекомендации появятся здесь</p>
              </div>
            )}

            <ProductGrid products={products || []} isLoading={isLoading} />

            {total !== undefined && total > 0 && (
              <div className="mt-8 animate-fade-in">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-gray-500 text-sm">
                    Показано <span className="font-medium text-gray-700">{Math.min(page * ITEMS_PER_PAGE, total)}</span> из{' '}
                    <span className="font-medium text-gray-700">{total.toLocaleString()}</span> товаров
                  </p>
                </div>

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
    <div className="flex items-center justify-center gap-1.5">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-gray-200 transition-all"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      {getPageNumbers().map((p, idx) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${idx}`} className="w-10 text-center text-gray-400">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`w-10 h-10 rounded-xl font-medium text-sm transition-all ${
              p === currentPage
                ? 'bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-md'
                : 'border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300'
            }`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-gray-200 transition-all"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  )
}
