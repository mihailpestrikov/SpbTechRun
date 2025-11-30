import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
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
  const { addItem } = useCartStore()

  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, 'positive' | 'negative'>>({})

  const handleFeedback = (recommendedId: number, type: 'positive' | 'negative') => {
    sendFeedback({ mainProductId: productId, recommendedProductId: recommendedId, feedback: type })
    setFeedbackGiven((prev) => ({ ...prev, [recommendedId]: type }))
  }

  const handleAddToCart = () => {
    if (!product) return
    for (let i = 0; i < quantity; i++) {
      addItem(product)
    }
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
            <div className="w-96 h-96 bg-gray-200 rounded-lg flex items-center justify-center text-gray-400 shrink-0">
              Фото товара
            </div>

            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-800 mb-2">{product.name}</h1>
              <p className="text-gray-500 mb-4">Бренд: {product.brand} | Категория: {product.category.name}</p>

              <p className="text-3xl font-bold text-red-700 mb-6">{product.price} ₽</p>

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
                <Button onClick={handleAddToCart} className="bg-red-700 hover:bg-red-800 px-8">
                  Добавить в корзину
                </Button>
              </div>

              <div>
                <h2 className="font-semibold text-gray-700 mb-2">Описание</h2>
                <p className="text-gray-600">{product.description}</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Сопутствующие товары</h2>
          <p className="text-gray-500 text-sm mb-4">Помогите улучшить рекомендации — оцените подборку</p>

          <div className="grid grid-cols-4 gap-4">
            {recommendations?.map((rec) => (
              <div key={rec.product.id} className="border rounded-lg p-4">
                <Link to={`/product/${rec.product.id}`}>
                  <div className="bg-gray-200 h-32 rounded mb-3 flex items-center justify-center text-gray-400">
                    Фото
                  </div>
                  <h3 className="font-medium text-gray-800 text-sm">{rec.product.name}</h3>
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
      </div>
    </PageLayout>
  )
}
