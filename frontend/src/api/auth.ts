import type { User, AuthResponse } from '@/types'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const mockUser: User = {
  id: 1,
  name: 'Иван Иванов',
  email: 'ivan@example.com',
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  await delay(500)
  if (password.length < 3) throw new Error('Неверный пароль')
  return { user: { ...mockUser, email }, token: 'mock-token-123' }
}

export async function register(name: string, email: string, _password: string): Promise<AuthResponse> {
  await delay(500)
  return { user: { id: 2, name, email }, token: 'mock-token-456' }
}

export async function getMe(): Promise<User> {
  await delay(200)
  return mockUser
}
