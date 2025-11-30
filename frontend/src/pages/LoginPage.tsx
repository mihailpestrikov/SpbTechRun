import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageLayout } from '@/components/layout'
import { useAuthStore } from '@/store'
import { login } from '@/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

export function LoginPage() {
  const navigate = useNavigate()
  const { login: setAuth } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { user, token } = await login(email, password)
      setAuth(user, token)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageLayout>
      <div className="max-w-md mx-auto px-4 py-16">
        <Card className="p-8">
          <h1 className="text-2xl font-bold text-gray-800 text-center mb-6">Вход</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Пароль</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <Button type="submit" disabled={loading} className="w-full bg-red-700 hover:bg-red-800">
              {loading ? 'Вход...' : 'Войти'}
            </Button>
          </form>

          <p className="text-center text-gray-600 mt-6">
            Нет аккаунта?{' '}
            <Link to="/register" className="text-red-700 hover:underline">
              Зарегистрироваться
            </Link>
          </p>
        </Card>
      </div>
    </PageLayout>
  )
}
