import { Link } from 'react-router-dom'
import { PageLayout } from '@/components/layout'
import { useOrders } from '@/hooks'
import { useAuthStore } from '@/store'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { capitalize } from '@/lib/utils'

export function OrderHistoryPage() {
  const { isAuthenticated } = useAuthStore()
  const { data: orders, isLoading } = useOrders()

  if (!isAuthenticated) {
    return (
      <PageLayout>
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Войдите в аккаунт</h1>
          <p className="text-gray-500 mb-6">Чтобы просматривать заказы, нужно авторизоваться</p>
          <Link to="/login">
            <Button className="bg-red-700 hover:bg-red-800">Войти</Button>
          </Link>
        </div>
      </PageLayout>
    )
  }

  return (
    <PageLayout>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <nav className="text-sm text-gray-500 mb-6">
          <Link to="/profile" className="hover:text-red-700">Профиль</Link>
          <span className="mx-2">/</span>
          <span>История заказов</span>
        </nav>

        <h1 className="text-3xl font-bold text-gray-800 mb-6">История заказов</h1>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Загрузка...</div>
        ) : orders?.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-gray-500 mb-4">У вас пока нет заказов</p>
            <Link to="/" className="text-red-700 hover:underline">
              Перейти в каталог
            </Link>
          </Card>
        ) : (
          <div className="space-y-4">
            {orders?.map((order) => (
              <Card key={order.id} className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-800">Заказ #{order.id}</h3>
                    <p className="text-sm text-gray-500">
                      {new Date(order.created_at).toLocaleDateString('ru-RU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-800">{order.total.toFixed(2)} ₽</p>
                    <Badge variant={order.status === 'completed' ? 'default' : 'secondary'} className="mt-1">
                      {order.status === 'completed' ? 'Завершён' : order.status === 'pending' ? 'В обработке' : 'Отменён'}
                    </Badge>
                  </div>
                </div>
                <div className="border-t pt-4 space-y-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      {item.product?.picture ? (
                        <img
                          src={item.product.picture}
                          alt={item.product.name}
                          className="w-12 h-12 object-contain rounded bg-gray-50"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">
                          Фото
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/product/${item.product_id}`}
                          className="text-sm font-medium text-gray-800 hover:text-red-700 truncate block"
                        >
                          {capitalize(item.product?.name || `Товар #${item.product_id}`)}
                        </Link>
                        <p className="text-xs text-gray-500">
                          {item.quantity} шт. × {item.price.toFixed(2)} ₽
                        </p>
                      </div>
                      <p className="text-sm font-medium text-gray-700">
                        {(item.quantity * item.price).toFixed(2)} ₽
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  )
}
