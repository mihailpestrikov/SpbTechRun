import { apiClient } from './client'
import type { Category } from '@/types'

export async function getCategories(): Promise<Category[]> {
  const { data } = await apiClient.get<Category[]>('/categories')
  return data
}

export async function getCategory(id: number): Promise<Category> {
  const { data } = await apiClient.get<Category>(`/categories/${id}`)
  return data
}
