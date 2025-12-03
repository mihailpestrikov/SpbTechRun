import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Package, ShoppingCart, Check, Sparkles, ArrowRight } from 'lucide-react'
import { useAutoScenarioRecommendations } from '@/hooks'
import { useCartStore } from '@/store'
import { capitalize } from '@/lib/utils'
import type { GroupProduct } from '@/types'

interface CarouselProps {
  cartProductIds: number[]
}

export function ScenarioCarousel({ cartProductIds }: CarouselProps) {
  const { data, isLoading } = useAutoScenarioRecommendations(cartProductIds)
  const { items: cartItems, addItem, isProductLoading } = useCartStore()

  // Собираем все товары из рекомендаций в единый список
  const allProducts = useMemo(() => {
    if (!data?.recommendations) return []
    const products: (GroupProduct & { groupName: string })[] = []
    for (const group of data.recommendations) {
      for (const product of group.products) {
        products.push({ ...product, groupName: group.group_name })
      }
    }
    return products
  }, [data])

  const handleAddToCart = (productId: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    addItem(productId, 1)
  }

  const isInCart = (productId: number) => cartItems.some(item => item.product_id === productId)

  if (isLoading) {
    return (
      <div className="bg-gradient-to-r from-red-50 to-rose-50 rounded-2xl p-6 mb-8 border border-red-100">
        <div className="animate-pulse">
          <div className="h-6 w-48 bg-red-100 rounded mb-4" />
          <div className="flex gap-4 overflow-hidden">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="w-48 h-64 bg-white/50 rounded-xl flex-shrink-0" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!data || allProducts.length === 0) {
    return (
      <div className="bg-gradient-to-r from-red-50 to-rose-50 rounded-2xl p-6 mb-8 border border-red-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-red-500" />
            <h2 className="font-semibold text-gray-900">Сценарии ремонта</h2>
          </div>
          <Link
            to="/scenarios"
            className="flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
          >
            Все сценарии
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <p className="text-gray-600 text-sm">Добавьте товары в корзину, чтобы увидеть персональные рекомендации</p>
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-r from-red-50 to-rose-50 rounded-2xl p-6 mb-8 border border-red-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-red-500" />
            <h2 className="font-semibold text-gray-900">{data.scenario.name}</h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 to-rose-500 rounded-full transition-all"
                style={{ width: `${data.progress.percentage}%` }}
              />
            </div>
            <span>{data.progress.completed}/{data.progress.total}</span>
          </div>
        </div>
        <Link
          to="/scenarios"
          className="flex items-center gap-1 text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
        >
          Все сценарии
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <p className="text-gray-600 text-sm mb-4">Для завершения сценария вам понадобится:</p>

      {/* Horizontal scroll */}
      <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
        {allProducts.map((product) => {
          const inCart = isInCart(product.id)
          const loading = isProductLoading(product.id)
          const hasDiscount = product.discount_price && product.discount_price < product.price
          const displayPrice = product.discount_price || product.price

          return (
            <Link
              key={product.id}
              to={`/product/${product.id}`}
              className="group w-48 flex-shrink-0 bg-white rounded-xl p-4 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-transparent hover:border-gray-100"
            >
              <div className="relative aspect-square rounded-lg overflow-hidden bg-white mb-3">
                {hasDiscount && (
                  <div className="absolute top-2 left-2 z-10 bg-gradient-to-r from-red-500 to-rose-500 text-white text-xs font-bold px-2 py-1 rounded">
                    -{Math.round((1 - product.discount_price! / product.price) * 100)}%
                  </div>
                )}
                {product.picture ? (
                  <img
                    src={product.picture}
                    alt={product.name}
                    className="w-full h-full object-contain p-2 group-hover:scale-110 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <Package className="w-10 h-10" />
                  </div>
                )}
              </div>

              <div className="text-xs text-red-500 font-medium mb-1 truncate">{product.groupName}</div>
              <h3 className="font-medium text-gray-800 text-sm line-clamp-2 min-h-[2.5rem] group-hover:text-red-600 transition-colors">
                {capitalize(product.name)}
              </h3>

              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-red-600 font-bold">{displayPrice.toLocaleString()} ₽</span>
                {hasDiscount && (
                  <span className="text-xs text-gray-400 line-through">{product.price.toLocaleString()} ₽</span>
                )}
              </div>

              <button
                onClick={(e) => handleAddToCart(product.id, e)}
                disabled={loading}
                className={`w-full mt-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1 ${
                  inCart
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-500 text-white hover:bg-red-600'
                } disabled:opacity-50`}
              >
                {inCart ? (
                  <>
                    <Check className="w-4 h-4" />
                    В корзине
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4" />
                    {loading ? '...' : 'В корзину'}
                  </>
                )}
              </button>
            </Link>
          )
        })}
      </div>

      {/* Completed groups hint */}
      {data.completed_groups.length > 0 && (
        <div className="mt-4 pt-4 border-t border-red-100">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Check className="w-4 h-4 text-green-500" />
            <span>
              Уже в корзине: {data.completed_groups.map(g => g.group_name).join(', ')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
