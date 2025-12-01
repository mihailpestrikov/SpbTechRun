import { apiClient } from './client'
import type { User, AuthResponse } from '@/types'

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/login', { email, password })
  return data
}

export async function register(name: string, email: string, password: string): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>('/auth/register', { name, email, password })
  return data
}

export async function getProfile(): Promise<User> {
  const { data } = await apiClient.get<User>('/auth/profile')
  return data
}
