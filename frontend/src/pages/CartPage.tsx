import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, Minus, Plus, Trash2, ArrowRight, Package, ShoppingBag } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { useCartStore, useAuthStore } from '@/store'
import { useCreateOrder } from '@/hooks'
import { capitalize } from '@/lib/utils'

function CartSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-10 w-48 bg-gray-200 rounded-lg mb-8" />
      <div className="flex gap-8">
        <div className="flex-1 space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-6 flex gap-6">
              <div className="w-24 h-24 bg-gray-100 rounded-xl" />
              <div className="flex-1 space-y-3">
                <div className="h-5 bg-gray-100 rounded w-2/3" />
                <div className="h-4 bg-gray-100 rounded w-1/3" />
              </div>
              <div className="w-32 h-10 bg-gray-100 rounded-xl" />
            </div>
          ))}
        </div>
        <div className="w-80">
          <div className="bg-white rounded-2xl p-6 space-y-4">
            <div className="h-6 bg-gray-100 rounded w-1/2" />
            <div className="h-4 bg-gray-100 rounded w-full" />
            <div className="h-12 bg-gray-100 rounded-xl" />
          </div>
        </div>
      </div>
    </div>
  )
}

export function CartPage() {
  const navigate = useNavigate()
  const { items, total, loading, updateQuantity, removeItem, fetchCart, isProductLoading } = useCartStore()
  const { isAuthenticated } = useAuthStore()
  const { mutate: createOrder, isPending } = useCreateOrder()

  useEffect(() => {
    fetchCart()
  }, [fetchCart])

  const handleOrder = () => {
    createOrder(undefined, {
      onSuccess: () => {
        fetchCart()
        navigate('/orders')
      },
      onError: (error: Error) => {
        alert(error.message || 'Ошибка при оформлении заказа')
      },
    })
  }

  if (loading && items.length === 0) {
    return (
      <PageLayout>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <CartSkeleton />
        </div>
      </PageLayout>
    )
  }

  if (items.length === 0) {
    return (
      <PageLayout>
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShoppingCart className="w-12 h-12 text-gray-300" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Корзина пуста</h1>
          <p className="text-gray-500 mb-8 max-w-md mx-auto">
            Добавьте товары из каталога, чтобы оформить заказ
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-500 to-rose-500 text-white font-medium rounded-xl hover:from-red-600 hover:to-rose-600 transition-all shadow-md hover:shadow-lg"
          >
            <ShoppingBag className="w-5 h-5" />
            Перейти в каталог
          </Link>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 flex items-center gap-3">
          <ShoppingCart className="w-8 h-8 text-red-500" />
          Корзина
          <span className="text-lg font-normal text-gray-400 ml-2">
            {items.length} {items.length === 1 ? 'товар' : items.length < 5 ? 'товара' : 'товаров'}
          </span>
        </h1>

        <div className="flex gap-8">
          <div className="flex-1 space-y-4">
            {items.map((item) => {
              const itemLoading = isProductLoading(item.product_id)
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-6 hover:shadow-md transition-shadow animate-fade-in"
                >
                  <Link to={`/product/${item.product_id}`} className="flex-shrink-0">
                    <div className="w-24 h-24 rounded-xl overflow-hidden bg-gray-50">
                      {item.product?.picture ? (
                        <img
                          src={item.product.picture}
                          alt={item.product.name}
                          className="w-full h-full object-contain p-2"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <Package className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="flex-1 min-w-0">
                    <Link
                      to={`/product/${item.product_id}`}
                      className="font-medium text-gray-900 hover:text-red-600 transition-colors line-clamp-2"
                    >
                      {capitalize(item.product?.name || `Товар #${item.product_id}`)}
                    </Link>
                    {item.product?.vendor && (
                      <p className="text-sm text-gray-500 mt-1">{item.product.vendor}</p>
                    )}
                    <p className="text-lg font-bold text-gray-900 mt-2">
                      {item.product ? (item.product.price * item.quantity).toLocaleString() : 0} ₽
                      {item.quantity > 1 && (
                        <span className="text-sm font-normal text-gray-400 ml-2">
                          ({item.product?.price.toLocaleString()} ₽ × {item.quantity})
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center h-10 bg-gray-100 rounded-xl overflow-hidden">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        disabled={itemLoading}
                        className="w-10 h-full flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-10 text-center font-semibold text-gray-800">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        disabled={itemLoading}
                        className="w-10 h-full flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeItem(item.id)}
                      disabled={itemLoading}
                      className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="w-80 flex-shrink-0">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sticky top-20">
              <h2 className="font-semibold text-gray-900 text-lg mb-4">Ваш заказ</h2>

              <div className="space-y-3 pb-4 border-b border-gray-100">
                <div className="flex justify-between text-gray-600">
                  <span>Товары ({items.length})</span>
                  <span>{total.toLocaleString()} ₽</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Доставка</span>
                  <span className="text-green-600 font-medium">Бесплатно</span>
                </div>
              </div>

              <div className="flex justify-between py-4 border-b border-gray-100">
                <span className="text-lg font-bold text-gray-900">Итого</span>
                <span className="text-lg font-bold text-gray-900">{total.toLocaleString()} ₽</span>
              </div>

              <div className="pt-4">
                {isAuthenticated ? (
                  <button
                    onClick={handleOrder}
                    disabled={isPending || loading}
                    className="w-full h-12 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-medium rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isPending ? (
                      'Оформление...'
                    ) : (
                      <>
                        Оформить заказ
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-gray-500 text-sm text-center">
                      Для оформления заказа войдите в аккаунт
                    </p>
                    <Link to="/login" className="block">
                      <button className="w-full h-12 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-medium rounded-xl transition-all shadow-md hover:shadow-lg">
                        Войти
                      </button>
                    </Link>
                  </div>
                )}

                <Link
                  to="/"
                  className="block text-center text-red-600 hover:text-red-700 font-medium mt-4 transition-colors"
                >
                  Продолжить покупки
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
