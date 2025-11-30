import { Link, useNavigate } from 'react-router-dom'
import { PageLayout } from '@/components/layout'
import { useAuthStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function ProfilePage() {
  const navigate = useNavigate()
  const { user, isAuthenticated, logout } = useAuthStore()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  if (!isAuthenticated) {
    return (
      <PageLayout>
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">Войдите в аккаунт</h1>
          <p className="text-gray-500 mb-6">Чтобы просматривать профиль, нужно авторизоваться</p>
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
        <h1 className="text-3xl font-bold text-gray-800 mb-6">Личный кабинет</h1>

        <Card className="p-6 mb-6">
          <h2 className="font-semibold text-gray-800 mb-4">Контактная информация</h2>
          <div className="space-y-3">
            <div>
              <span className="text-gray-500">Имя:</span>
              <span className="ml-2 text-gray-800">{user?.name}</span>
            </div>
            <div>
              <span className="text-gray-500">Email:</span>
              <span className="ml-2 text-gray-800">{user?.email}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6 mb-6">
          <Link
            to="/orders"
            className="flex items-center justify-between py-3 hover:text-red-700"
          >
            <span>История заказов</span>
            <span>&rarr;</span>
          </Link>
        </Card>

        <Button variant="outline" onClick={handleLogout} className="text-red-600 border-red-600 hover:bg-red-50">
          Выйти из аккаунта
        </Button>
      </div>
    </PageLayout>
  )
}
