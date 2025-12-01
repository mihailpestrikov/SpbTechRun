import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageLayout } from '@/components/layout'
import { useCartStore } from '@/store'
import { useCreateOrder } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function CartPage() {
  const navigate = useNavigate()
  const { items, total, loading, updateQuantity, removeItem, clear, fetchCart } = useCartStore()
  const { mutate: createOrder, isPending } = useCreateOrder()

  useEffect(() => {
    fetchCart()
  }, [fetchCart])

  const handleOrder = () => {
    createOrder(undefined, {
      onSuccess: () => {
        clear()
        alert('Заказ оформлен!')
        navigate('/orders')
      },
    })
  }

  if (loading && items.length === 0) {
    return (
      <PageLayout>
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          <p className="text-gray-500">Загрузка корзины...</p>
        </div>
      </PageLayout>
    )
  }

  if (items.length === 0) {
    return (
      <PageLayout>
        <div className="max-w-7xl mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Корзина пуста</h1>
          <p className="text-gray-500 mb-6">Добавьте товары из каталога</p>
          <Link to="/">
            <Button className="bg-red-700 hover:bg-red-800">Перейти в каталог</Button>
          </Link>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Корзина</h1>

        <div className="flex gap-8">
          <div className="flex-1">
            <Card>
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-4 p-4 border-b last:border-b-0">
                  {item.product?.picture ? (
                    <img
                      src={item.product.picture}
                      alt={item.product.name}
                      className="w-20 h-20 object-contain rounded"
                    />
                  ) : (
                    <div className="w-20 h-20 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs">
                      Фото
                    </div>
                  )}
                  <div className="flex-1">
                    <Link to={`/product/${item.product_id}`} className="font-medium text-gray-800 hover:text-red-700">
                      {item.product?.name || `Товар #${item.product_id}`}
                    </Link>
                    {item.product?.vendor && (
                      <p className="text-sm text-gray-500">{item.product.vendor}</p>
                    )}
                  </div>
                  <div className="flex items-center border rounded">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      disabled={loading}
                      className="px-3 py-1 hover:bg-gray-100 disabled:opacity-50"
                    >
                      -
                    </button>
                    <span className="px-3 py-1 border-x">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      disabled={loading}
                      className="px-3 py-1 hover:bg-gray-100 disabled:opacity-50"
                    >
                      +
                    </button>
                  </div>
                  <p className="font-semibold text-gray-800 w-24 text-right">
                    {item.product ? item.product.price * item.quantity : 0} ₽
                  </p>
                  <button
                    onClick={() => removeItem(item.id)}
                    disabled={loading}
                    className="text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </Card>
          </div>

          <div className="w-80">
            <Card className="p-6 sticky top-4">
              <h2 className="font-semibold text-gray-800 mb-4">Итого</h2>
              <div className="flex justify-between mb-4 pb-4 border-b">
                <span className="text-gray-600">Товары ({items.length})</span>
                <span className="font-medium">{total.toFixed(2)} ₽</span>
              </div>
              <div className="flex justify-between mb-6">
                <span className="text-lg font-bold">К оплате</span>
                <span className="text-lg font-bold text-red-700">{total.toFixed(2)} ₽</span>
              </div>
              <Button
                onClick={handleOrder}
                disabled={isPending || loading}
                className="w-full bg-red-700 hover:bg-red-800"
              >
                {isPending ? 'Оформление...' : 'Оформить заказ'}
              </Button>
              <Link to="/" className="block text-center text-red-700 mt-4 hover:underline">
                Продолжить покупки
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
