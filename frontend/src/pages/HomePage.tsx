import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageLayout } from '@/components/layout'
import { ProductGrid } from '@/components/product'
import { useProducts, useCategories } from '@/hooks'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const categoryId = searchParams.get('category')
    ? parseInt(searchParams.get('category')!)
    : undefined

  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')

  const { data: productsData, isLoading: productsLoading } = useProducts(categoryId)
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
      current = categories.find((c) => c.id === current?.parentId)
    }
    return path
  }, [currentCategory, categories])

  const filteredProducts = useMemo(() => {
    if (!productsData?.items) return []

    return productsData.items.filter((product) => {
      const min = minPrice ? parseFloat(minPrice) : 0
      const max = maxPrice ? parseFloat(maxPrice) : Infinity
      return product.price >= min && product.price <= max
    })
  }, [productsData?.items, minPrice, maxPrice])

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

            <ProductGrid products={filteredProducts} isLoading={productsLoading} />
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
