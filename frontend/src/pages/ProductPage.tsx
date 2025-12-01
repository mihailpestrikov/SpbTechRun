import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import DOMPurify from 'dompurify'
import { PageLayout } from '@/components/layout'
import { useProduct, useRecommendations, useFeedback } from '@/hooks'
import { useCartStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function ProductPage() {
  const { id } = useParams()
  const productId = Number(id)
  const [quantity, setQuantity] = useState(1)

  const { data: product, isLoading } = useProduct(productId)
  const { data: recommendations } = useRecommendations(productId)
  const { mutate: sendFeedback } = useFeedback()
  const { items, addItem, loading, fetchCart } = useCartStore()

  useEffect(() => {
    fetchCart()
  }, [fetchCart])

  const cartItem = items.find((item) => item.product_id === productId)
  const isInCart = !!cartItem

  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, 'positive' | 'negative'>>({})

  const handleFeedback = (recommendedId: number, type: 'positive' | 'negative') => {
    sendFeedback({ main_product_id: productId, recommended_product_id: recommendedId, feedback: type })
    setFeedbackGiven((prev) => ({ ...prev, [recommendedId]: type }))
  }

  const handleAddToCart = () => {
    if (!product) return
    addItem(product.id, quantity)
  }

  if (isLoading) {
    return (
      <PageLayout>
        <div className="max-w-7xl mx-auto px-4 py-8 text-center text-gray-500">Загрузка...</div>
      </PageLayout>
    )
  }

  if (!product) {
    return (
      <PageLayout>
        <div className="max-w-7xl mx-auto px-4 py-8 text-center text-gray-500">Товар не найден</div>
      </PageLayout>
    )
  }

  const displayPrice = product.discount_price || product.price
  const hasDiscount = product.discount_price && product.discount_price < product.price

  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <nav className="text-sm text-gray-500 mb-6">
          <Link to="/" className="hover:text-red-700">Каталог</Link>
          <span className="mx-2">/</span>
          <span>{product.name}</span>
        </nav>

        <Card className="p-6 mb-8">
          <div className="flex gap-8">
            {product.picture ? (
              <img
                src={product.picture}
                alt={product.name}
                className="w-96 h-96 object-contain rounded-lg shrink-0"
              />
            ) : (
              <div className="w-96 h-96 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 shrink-0">
                Фото товара
              </div>
            )}

            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-800 mb-2">{product.name}</h1>
              <p className="text-gray-500 mb-4">
                {product.vendor && `Бренд: ${product.vendor}`}
                {product.country && ` | Страна: ${product.country}`}
              </p>

              <div className="mb-6">
                {hasDiscount ? (
                  <>
                    <p className="text-gray-400 line-through">{product.price} ₽</p>
                    <p className="text-3xl font-bold text-red-700">{displayPrice} ₽</p>
                  </>
                ) : (
                  <p className="text-3xl font-bold text-red-700">{displayPrice} ₽</p>
                )}
              </div>

              <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center border rounded">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="px-3 py-2 hover:bg-gray-100"
                  >
                    -
                  </button>
                  <span className="px-4 py-2 border-x">{quantity}</span>
                  <button
                    onClick={() => setQuantity((q) => q + 1)}
                    className="px-3 py-2 hover:bg-gray-100"
                  >
                    +
                  </button>
                </div>
                {!product.available ? (
                  <Button disabled className="px-8">
                    Нет в наличии
                  </Button>
                ) : isInCart ? (
                  <Button
                    onClick={handleAddToCart}
                    disabled={loading}
                    variant="outline"
                    className="px-8 border-red-700 text-red-700 hover:bg-red-50"
                  >
                    {loading ? 'Добавляем...' : `В корзине (${cartItem.quantity} шт.) — добавить ещё`}
                  </Button>
                ) : (
                  <Button
                    onClick={handleAddToCart}
                    disabled={loading}
                    className="bg-red-700 hover:bg-red-800 px-8"
                  >
                    {loading ? 'Добавляем...' : 'Добавить в корзину'}
                  </Button>
                )}
              </div>

              {product.description && (
                <div>
                  <h2 className="font-semibold text-gray-700 mb-2">Описание</h2>
                  <p
                    className="text-gray-600"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(product.description) }}
                  />
                </div>
              )}

              {product.params && Object.keys(product.params).length > 0 && (
                <div className="mt-4">
                  <h2 className="font-semibold text-gray-700 mb-2">Характеристики</h2>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    {Object.entries(product.params).map(([key, value]) => (
                      <div key={key} className="flex">
                        <dt className="text-gray-500 w-1/2">{key}:</dt>
                        <dd className="text-gray-800">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          </div>
        </Card>

        {recommendations && recommendations.length > 0 && (
          <Card className="p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-2">Сопутствующие товары</h2>
            <p className="text-gray-500 text-sm mb-4">Помогите улучшить рекомендации — оцените подборку</p>

            <div className="grid grid-cols-4 gap-4">
              {recommendations.map((rec) => (
                <div key={rec.product.id} className="border rounded-lg p-4">
                  <Link to={`/product/${rec.product.id}`}>
                    {rec.product.picture ? (
                      <img
                        src={rec.product.picture}
                        alt={rec.product.name}
                        className="h-32 w-full object-contain rounded mb-3"
                      />
                    ) : (
                      <div className="bg-gray-200 h-32 rounded mb-3 flex items-center justify-center text-gray-400">
                        Фото
                      </div>
                    )}
                    <h3 className="font-medium text-gray-800 text-sm line-clamp-2">{rec.product.name}</h3>
                    <p className="text-red-700 font-semibold text-sm mt-1">{rec.product.price} ₽</p>
                  </Link>
                  <p className="text-xs text-gray-500 mt-1">{rec.reason}</p>

                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleFeedback(rec.product.id, 'positive')}
                      disabled={!!feedbackGiven[rec.product.id]}
                      className={`flex-1 py-1 border rounded text-sm transition-colors ${
                        feedbackGiven[rec.product.id] === 'positive'
                          ? 'bg-green-100 border-green-500 text-green-700'
                          : 'border-green-500 text-green-600 hover:bg-green-50'
                      } disabled:opacity-50`}
                    >
                      👍
                    </button>
                    <button
                      onClick={() => handleFeedback(rec.product.id, 'negative')}
                      disabled={!!feedbackGiven[rec.product.id]}
                      className={`flex-1 py-1 border rounded text-sm transition-colors ${
                        feedbackGiven[rec.product.id] === 'negative'
                          ? 'bg-red-100 border-red-500 text-red-700'
                          : 'border-red-500 text-red-600 hover:bg-red-50'
                      } disabled:opacity-50`}
                    >
                      👎
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </PageLayout>
  )
}
