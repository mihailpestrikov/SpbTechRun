import { Link, useNavigate } from 'react-router-dom'
import { PageLayout } from '@/components/layout'
import { useCartStore } from '@/store'
import { useCreateOrder } from '@/hooks'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function CartPage() {
  const navigate = useNavigate()
  const { items, updateQuantity, removeItem, totalPrice, clear } = useCartStore()
  const { mutate: createOrder, isPending } = useCreateOrder()

  const handleOrder = () => {
    createOrder(items, {
      onSuccess: () => {
        clear()
        alert('Заказ оформлен!')
        navigate('/orders')
      },
    })
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
        <h1 className="text-3xl font-bold text-black mb-6">Корзина</h1>

        <div className="flex gap-8">
          <div className="flex-1">
            <Card className="p-0 border-0 shadow-[0_4px_10px_rgba(0,0,0,0.1)] rounded-[20px]">
              {items.map((item) => (
                <div key={item.product.id} className="flex items-center  gap-4 p-4 border-b last:border-b-0">
                  <div className="w-20 h-20 bg-gray-200 rounded-[10px] flex items-center justify-center text-gray-400 text-xs">
                    Фото
                  </div>
                  <div className="flex-1">
                    <Link to={`/product/${item.product.id}`} className="font-medium text-gray-800 hover:text-red-700">
                      {item.product.name}
                    </Link>
                    <p className="text-sm text-gray-500">{item.product.brand}</p>
                  </div>

                  <div className="flex items-center  bg-gray-200 rounded-[10px]">
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      className="px-3 py-1 rounded-[10px] hover:bg-gray-300 font-bold text-lg"
                    >
                      -
                    </button>
                    <span className="px-3 py-1 ">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      className="px-3 py-1 rounded-[10px] hover:bg-gray-300 text-red-700 font-bold text-lg"
                    >
                      +
                    </button>
                  </div>
                  <p className="font-semibold text-gray-800 w-24 text-right text-lg jutify-center text-lg">
                    {item.product.price * item.quantity} ₽
                  </p>
                  <button
                    onClick={() => removeItem(item.product.id)}
                    className="text-white  bg-red-700 hover:bg-red-800 rounded-[12px] p-2 font-semibold"
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </Card>
          </div>

          <div className="w-80">
            <Card className="p-6 sticky top-4 border-0 shadow-[0_4px_10px_rgba(0,0,0,0.1)] rounded-[20px]">
              <h2 className="font-semibold text-gray-800 mb-4">Итого</h2>
              <div className="flex justify-between mb-15 pb-4 border-b">
                <span className="text-gray-600">Товары ({items.length})</span>
                <span className="font-medium">{totalPrice()} ₽</span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-lg font-bold">К оплате</span>
                <span className="text-lg font-bold text-red-700">{totalPrice()} ₽</span>
              </div>
              <Button
                onClick={handleOrder}
                disabled={isPending}
                className="w-full bg-red-700 hover:bg-red-800 rounded-[10px] p-5"
              >
                {isPending ? 'Оформление...' : 'Оформить заказ'}
              </Button>
              <Link to="/" className="block text-center text-gray-700 mt-4 hover:underline">
                Продолжить покупки
              </Link>
            </Card>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
