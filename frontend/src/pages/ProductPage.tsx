import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { ChevronRight, Minus, Plus, ShoppingCart, Check, ThumbsUp, ThumbsDown, Package, Sparkles } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { useProduct, useRecommendations, useFeedback, useCategories } from '@/hooks'
import { useCartStore } from '@/store'
import { capitalize } from '@/lib/utils'
import { logRecommendationEvent, logRecommendationImpressions } from '@/api/recommendations'
import type { Category } from '@/types'

function ProductSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-4 w-48 bg-gray-200 rounded mb-8" />
      <div className="bg-white rounded-2xl border border-gray-100 p-8">
        <div className="flex gap-10">
          <div className="w-[450px] h-[450px] bg-gray-100 rounded-2xl flex-shrink-0" />
          <div className="flex-1 space-y-4">
            <div className="h-8 bg-gray-100 rounded-lg w-3/4" />
            <div className="h-4 bg-gray-100 rounded w-1/3" />
            <div className="h-10 bg-gray-100 rounded-lg w-1/4 mt-6" />
            <div className="h-12 bg-gray-100 rounded-xl w-1/2 mt-6" />
            <div className="space-y-2 mt-8">
              <div className="h-4 bg-gray-100 rounded w-full" />
              <div className="h-4 bg-gray-100 rounded w-5/6" />
              <div className="h-4 bg-gray-100 rounded w-4/6" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProductPage() {
  const { id } = useParams()
  const productId = Number(id)
  const [quantity, setQuantity] = useState(1)

  const { data: product, isLoading } = useProduct(productId)
  const { data: recommendations } = useRecommendations(productId)
  const { data: categories } = useCategories()
  const { mutate: sendFeedback } = useFeedback()
  const { items, addItem, fetchCart, isProductLoading } = useCartStore()
  const loading = isProductLoading(productId)

  useEffect(() => {
    fetchCart()
  }, [fetchCart])

  const categoryPath = useMemo(() => {
    if (!product || !categories) return []
    const path: Category[] = []
    let currentId: number | null = product.category_id
    while (currentId !== null) {
      const cat = categories.find(c => c.id === currentId)
      if (!cat) break
      path.unshift(cat)
      currentId = cat.parent_id ?? null
    }
    return path
  }, [product, categories])

  const cartItem = items.find((item) => item.product_id === productId)
  const isInCart = !!cartItem

  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, 'positive' | 'negative'>>({})
  const impressionsLogged = useRef(false)

  // Логируем impressions когда рекомендации загрузились
  useEffect(() => {
    if (recommendations && recommendations.length > 0 && !impressionsLogged.current) {
      impressionsLogged.current = true
      logRecommendationImpressions(productId, recommendations, 'product_page')
    }
  }, [recommendations, productId])

  // Сбрасываем флаг при смене товара
  useEffect(() => {
    impressionsLogged.current = false
  }, [productId])

  const handleFeedback = (recommendedId: number, type: 'positive' | 'negative') => {
    sendFeedback({ main_product_id: productId, recommended_product_id: recommendedId, feedback: type })
    setFeedbackGiven((prev) => ({ ...prev, [recommendedId]: type }))
  }

  const handleRecommendationClick = (recommendedId: number, rank: number) => {
    logRecommendationEvent({
      event_type: 'click',
      main_product_id: productId,
      recommended_product_id: recommendedId,
      recommendation_context: 'product_page',
      recommendation_rank: rank,
    })
  }

  const handleAddToCart = () => {
    if (!product) return
    addItem(product.id, quantity)
  }

  if (isLoading) {
    return (
      <PageLayout>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <ProductSkeleton />
        </div>
      </PageLayout>
    )
  }

  if (!product) {
    return (
      <PageLayout>
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-10 h-10 text-gray-300" />
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Товар не найден</h2>
          <p className="text-gray-500 mb-6">Возможно, он был удалён или перемещён</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-500 to-rose-500 text-white font-medium rounded-xl hover:from-red-600 hover:to-rose-600 transition-all shadow-md hover:shadow-lg"
          >
            Перейти в каталог
          </Link>
        </div>
      </PageLayout>
    )
  }

  const displayPrice = product.discount_price || product.price
  const hasDiscount = product.discount_price && product.discount_price < product.price
  const discountPercent = hasDiscount
    ? Math.round((1 - product.discount_price! / product.price) * 100)
    : 0

  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-8 animate-fade-in flex-wrap">
          <Link to="/" className="hover:text-red-600 transition-colors">Каталог</Link>
          {categoryPath.map((cat) => (
            <span key={cat.id} className="flex items-center gap-2">
              <ChevronRight className="w-4 h-4" />
              <Link to={`/?category=${cat.id}`} className="hover:text-red-600 transition-colors">{cat.name}</Link>
            </span>
          ))}
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-800 font-medium truncate max-w-md">{capitalize(product.name)}</span>
        </nav>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-8 animate-slide-up">
          <div className="flex flex-col lg:flex-row">
            <div className="lg:w-[500px] p-8 flex-shrink-0 bg-gray-50/50">
              <div className="relative aspect-square rounded-2xl overflow-hidden bg-white">
                {hasDiscount && (
                  <div className="absolute top-4 left-4 z-10 bg-gradient-to-r from-red-500 to-rose-500 text-white text-sm font-bold px-3 py-1.5 rounded-lg shadow-md">
                    -{discountPercent}%
                  </div>
                )}
                {product.picture ? (
                  <img
                    src={product.picture}
                    alt={product.name}
                    className="w-full h-full object-contain p-4"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                    <Package className="w-24 h-24" />
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 p-8 lg:p-10">
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-3">{capitalize(product.name)}</h1>

              <div className="flex items-center gap-3 text-sm text-gray-500 mb-6">
                {product.vendor && (
                  <span className="px-3 py-1 bg-gray-100 rounded-full">{product.vendor}</span>
                )}
                {product.country && (
                  <span className="px-3 py-1 bg-gray-100 rounded-full">{product.country}</span>
                )}
                {product.available ? (
                  <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" /> В наличии
                  </span>
                ) : (
                  <span className="px-3 py-1 bg-gray-100 text-gray-500 rounded-full">Нет в наличии</span>
                )}
              </div>

              <div className="mb-8">
                {hasDiscount ? (
                  <div className="flex items-baseline gap-3">
                    <span className="text-4xl font-bold text-gray-900">{displayPrice.toLocaleString()} ₽</span>
                    <span className="text-xl text-gray-400 line-through">{product.price.toLocaleString()} ₽</span>
                  </div>
                ) : (
                  <span className="text-4xl font-bold text-gray-900">{displayPrice.toLocaleString()} ₽</span>
                )}
              </div>

              <div className="flex items-center gap-4 mb-8">
                <div className="flex items-center h-12 bg-gray-100 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-12 h-full flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-12 text-center font-semibold text-gray-800">{quantity}</span>
                  <button
                    onClick={() => setQuantity((q) => q + 1)}
                    className="w-12 h-full flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {!product.available ? (
                  <button disabled className="h-12 px-8 bg-gray-200 text-gray-500 font-medium rounded-xl cursor-not-allowed">
                    Нет в наличии
                  </button>
                ) : isInCart ? (
                  <button
                    onClick={handleAddToCart}
                    disabled={loading}
                    className="h-12 px-8 bg-gray-100 text-gray-800 font-medium rounded-xl hover:bg-gray-200 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <Check className="w-5 h-5 text-green-500" />
                    {loading ? 'Добавляем...' : `В корзине (${cartItem.quantity}) — ещё`}
                  </button>
                ) : (
                  <button
                    onClick={handleAddToCart}
                    disabled={loading}
                    className="h-12 px-8 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-medium rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2 disabled:opacity-50"
                  >
                    <ShoppingCart className="w-5 h-5" />
                    {loading ? 'Добавляем...' : 'В корзину'}
                  </button>
                )}
              </div>

              {product.description && (
                <div className="border-t border-gray-100 pt-6">
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Описание</h2>
                  <div
                    className="text-gray-600 leading-relaxed prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(product.description) }}
                  />
                </div>
              )}

              {product.params && Object.keys(product.params).length > 0 && (
                <div className="border-t border-gray-100 pt-6 mt-6">
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Характеристики</h2>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(product.params).map(([key, value]) => (
                      <div key={key} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
                        <dt className="text-sm text-gray-500 flex-shrink-0">{key}:</dt>
                        <dd className="text-sm font-medium text-gray-800">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          </div>
        </div>

        {recommendations && recommendations.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 lg:p-8 animate-slide-up">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-red-500" />
              <h2 className="text-xl font-bold text-gray-900">Сопутствующие товары</h2>
            </div>
            <p className="text-gray-500 text-sm mb-6">Рекомендации на основе ML-анализа. Помогите улучшить подборку — оцените товары</p>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {recommendations.map((rec, index) => {
                const scorePercent = Math.round(rec.score * 100)
                const hasDiscount = rec.product.discount_price && rec.product.discount_price < rec.product.price
                const displayPrice = rec.product.discount_price || rec.product.price
                const rank = index + 1

                return (
                  <div key={rec.product.id} className="group bg-gray-50 rounded-xl p-4 hover:bg-white hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-transparent hover:border-gray-100 flex flex-col">
                    <Link to={`/product/${rec.product.id}`} className="flex-1" onClick={() => handleRecommendationClick(rec.product.id, rank)}>
                      <div className="relative aspect-square rounded-lg overflow-hidden bg-white mb-3">
                        {hasDiscount && (
                          <div className="absolute top-2 left-2 z-10 bg-gradient-to-r from-red-500 to-rose-500 text-white text-xs font-bold px-2 py-1 rounded">
                            Скидка
                          </div>
                        )}
                        {rec.product.picture ? (
                          <img
                            src={rec.product.picture}
                            alt={rec.product.name}
                            className="w-full h-full object-contain p-2 group-hover:scale-110 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-300">
                            <Package className="w-10 h-10" />
                          </div>
                        )}
                      </div>
                      <h3 className="font-medium text-gray-800 text-sm line-clamp-2 min-h-[2.5rem] group-hover:text-red-600 transition-colors">
                        {capitalize(rec.product.name)}
                      </h3>
                      <div className="mt-1">
                        {hasDiscount ? (
                          <div className="flex items-baseline gap-2">
                            <span className="text-red-600 font-bold">{displayPrice.toLocaleString()} ₽</span>
                            <span className="text-xs text-gray-400 line-through">{rec.product.price.toLocaleString()} ₽</span>
                          </div>
                        ) : (
                          <p className="text-red-600 font-bold">{displayPrice.toLocaleString()} ₽</p>
                        )}
                      </div>
                    </Link>

                    <div className="mt-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${scorePercent}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 font-medium w-8">{scorePercent}%</span>
                      </div>

                      {rec.match_reasons && rec.match_reasons.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {rec.match_reasons.slice(0, 2).map((mr, idx) => (
                            <span
                              key={idx}
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                mr.type === 'category' ? 'bg-blue-50 text-blue-600' :
                                mr.type === 'feedback' ? 'bg-green-50 text-green-600' :
                                mr.type === 'semantic' ? 'bg-purple-50 text-purple-600' :
                                'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {mr.text}
                            </span>
                          ))}
                        </div>
                      )}

                      {!rec.match_reasons && rec.reason && (
                        <p className="text-[10px] text-gray-400 line-clamp-1">{rec.reason}</p>
                      )}
                    </div>

                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleFeedback(rec.product.id, 'positive')}
                        disabled={!!feedbackGiven[rec.product.id]}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1 ${
                          feedbackGiven[rec.product.id] === 'positive'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-white border border-gray-200 text-gray-600 hover:border-green-300 hover:text-green-600'
                        } disabled:opacity-60`}
                      >
                        <ThumbsUp className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleFeedback(rec.product.id, 'negative')}
                        disabled={!!feedbackGiven[rec.product.id]}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1 ${
                          feedbackGiven[rec.product.id] === 'negative'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-white border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600'
                        } disabled:opacity-60`}
                      >
                        <ThumbsDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  )
}
