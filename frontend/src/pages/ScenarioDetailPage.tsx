import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ChevronRight,
  Check,
  Package,
  ShoppingCart,
  ThumbsUp,
  ThumbsDown,
  Hammer,
  Layers,
  PaintBucket,
  AlertCircle,
  ExternalLink,
} from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { useScenarioRecommendations } from '@/hooks'
import { useCartStore } from '@/store'
import { sendFeedback } from '@/api/recommendations'
import { capitalize } from '@/lib/utils'

const SCENARIO_ICONS: Record<string, React.ReactNode> = {
  floor: <Layers className="w-6 h-6" />,
  partitions: <Hammer className="w-6 h-6" />,
  walls: <PaintBucket className="w-6 h-6" />,
}

const SCENARIO_COLORS: Record<string, string> = {
  floor: 'from-blue-500 to-cyan-500',
  partitions: 'from-orange-500 to-amber-500',
  walls: 'from-purple-500 to-pink-500',
}

export function ScenarioDetailPage() {
  const { id } = useParams()
  const scenarioId = id || ''

  const { items: cartItems, addItem, fetchCart, isProductLoading } = useCartStore()
  const cartProductIds = cartItems.map(item => item.product_id)

  const { data, isLoading } = useScenarioRecommendations(scenarioId, cartProductIds)

  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, 'positive' | 'negative'>>({})

  useEffect(() => {
    fetchCart()
  }, [fetchCart])

  const handleAddToCart = (productId: number) => {
    addItem(productId, 1)
  }

  const handleFeedback = async (productId: number, groupName: string, type: 'positive' | 'negative') => {
    setFeedbackGiven(prev => ({ ...prev, [productId]: type }))
    await sendFeedback({
      recommended_product_id: productId,
      feedback: type,
      context: 'scenario',
      scenario_id: scenarioId,
      group_name: groupName,
    })
  }

  const isInCart = (productId: number) => cartItems.some(item => item.product_id === productId)

  if (isLoading) {
    return (
      <PageLayout>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse">
            <div className="h-4 w-48 bg-gray-200 rounded mb-8" />
            <div className="h-8 w-64 bg-gray-200 rounded mb-4" />
            <div className="h-4 w-96 bg-gray-200 rounded mb-8" />
            <div className="space-y-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-2xl p-6 border border-gray-100">
                  <div className="h-6 w-32 bg-gray-100 rounded mb-4" />
                  <div className="flex gap-4">
                    {[1, 2, 3].map(j => (
                      <div key={j} className="w-48 h-64 bg-gray-100 rounded-xl" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageLayout>
    )
  }

  if (!data) {
    return (
      <PageLayout>
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-10 h-10 text-gray-300" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Сценарий не найден</h2>
          <Link
            to="/scenarios"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-500 to-rose-500 text-white font-medium rounded-xl hover:from-red-600 hover:to-rose-600 transition-all shadow-md"
          >
            К списку сценариев
          </Link>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-8 animate-fade-in">
          <Link to="/" className="hover:text-red-600 transition-colors">Каталог</Link>
          <ChevronRight className="w-4 h-4" />
          <Link to="/scenarios" className="hover:text-red-600 transition-colors">Сценарии</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-800 font-medium">{data.scenario.name}</span>
        </nav>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8 animate-slide-up">
          <div className="flex items-start gap-4">
            <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${SCENARIO_COLORS[scenarioId] || 'from-gray-500 to-gray-600'} flex items-center justify-center text-white`}>
              {SCENARIO_ICONS[scenarioId] || <Hammer className="w-6 h-6" />}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{data.scenario.name}</h1>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-32 h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-500 to-rose-500 rounded-full transition-all"
                      style={{ width: `${data.progress.percentage}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700">
                    {data.progress.completed}/{data.progress.total} групп
                  </span>
                </div>
                <span className="text-sm text-gray-500">
                  {data.progress.percentage}% готово
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Completed Groups */}
        {data.completed_groups.length > 0 && (
          <div className="mb-6 animate-slide-up">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              Уже в корзине
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.completed_groups.map(group => (
                <div
                  key={group.group_name}
                  className="bg-green-50 border border-green-100 rounded-xl p-4"
                >
                  <div className="font-medium text-green-800 mb-1">{group.group_name}</div>
                  <div className="text-sm text-green-600">
                    {group.cart_products.map(p => p.name).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        <div className="space-y-6">
          {data.recommendations.map(group => (
            <div
              key={group.group_name}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-slide-up"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-gray-900">{group.group_name}</h2>
                  {group.is_required ? (
                    <span className="text-xs font-medium px-2 py-0.5 bg-red-100 text-red-600 rounded-full">
                      Обязательно
                    </span>
                  ) : (
                    <span className="text-xs font-medium px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                      Опционально
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500">Выберите подходящий товар</span>
                  {group.category_ids && group.category_ids.length > 0 && (
                    <Link
                      to={`/?category=${group.category_ids[0]}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                    >
                      Смотреть все
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-4 -mx-2 px-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                {group.products.map(product => {
                  const inCart = isInCart(product.id)
                  const loading = isProductLoading(product.id)
                  const hasDiscount = product.discount_price && product.discount_price < product.price
                  const displayPrice = product.discount_price || product.price
                  const feedback = feedbackGiven[product.id]

                  return (
                    <div
                      key={product.id}
                      className={`group flex-shrink-0 w-48 bg-gray-50 rounded-xl p-4 transition-all duration-300 border-2 ${
                        inCart ? 'border-green-300 bg-green-50' : 'border-transparent hover:bg-white hover:shadow-lg hover:-translate-y-1'
                      }`}
                    >
                      <Link to={`/product/${product.id}`}>
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
                        <h3 className="font-medium text-gray-800 text-sm line-clamp-2 min-h-[2.5rem] group-hover:text-red-600 transition-colors">
                          {capitalize(product.name)}
                        </h3>
                      </Link>

                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-red-600 font-bold">{displayPrice.toLocaleString()} ₽</span>
                        {hasDiscount && (
                          <span className="text-xs text-gray-400 line-through">{product.price.toLocaleString()} ₽</span>
                        )}
                      </div>

                      <p className="text-xs text-gray-400 mt-1 line-clamp-1">{product.reason}</p>

                      <button
                        onClick={() => handleAddToCart(product.id)}
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

                      {/* Feedback buttons */}
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleFeedback(product.id, group.group_name, 'positive')}
                          disabled={!!feedback}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                            feedback === 'positive'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-white border border-gray-200 text-gray-500 hover:border-green-300 hover:text-green-600'
                          } disabled:opacity-60`}
                        >
                          <ThumbsUp className="w-3 h-3" />
                          Подошёл
                        </button>
                        <button
                          onClick={() => handleFeedback(product.id, group.group_name, 'negative')}
                          disabled={!!feedback}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                            feedback === 'negative'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-white border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600'
                          } disabled:opacity-60`}
                        >
                          <ThumbsDown className="w-3 h-3" />
                          Не подошёл
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* All done message */}
        {data.recommendations.length === 0 && data.completed_groups.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-8 text-center animate-slide-up">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-green-800 mb-2">Отлично!</h3>
            <p className="text-green-600">
              Вы собрали все необходимые товары для этого сценария.
            </p>
            <Link
              to="/cart"
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-medium rounded-xl hover:bg-green-700 transition-all shadow-md mt-4"
            >
              <ShoppingCart className="w-5 h-5" />
              Перейти в корзину
            </Link>
          </div>
        )}
      </div>
    </PageLayout>
  )
}
