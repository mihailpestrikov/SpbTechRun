import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react'
import { PageLayout } from '@/components/layout'
import { useAuthStore } from '@/store'
import { login } from '@/api'

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
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosErr = err as { response?: { data?: { error?: string } } }
        setError(axiosErr.response?.data?.error || 'Ошибка входа')
      } else {
        setError('Ошибка входа')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <PageLayout>
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-xl p-8 animate-slide-up">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-rose-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
                <LogIn className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900">Вход в аккаунт</h1>
              <p className="text-gray-500 mt-2">Рады видеть вас снова</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                    className="w-full h-12 pl-12 pr-4 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Пароль</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full h-12 pl-12 pr-4 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100 transition-all"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm animate-fade-in">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-medium rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? 'Входим...' : 'Войти'}
              </button>
            </form>

            <p className="text-center text-gray-600 mt-8">
              Нет аккаунта?{' '}
              <Link to="/register" className="text-red-600 hover:text-red-700 font-medium transition-colors">
                Зарегистрироваться
              </Link>
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
