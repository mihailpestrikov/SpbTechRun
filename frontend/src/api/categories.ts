import { apiClient } from './client'
import type { Category, CategoryWithChildren } from '@/types'

export async function getCategories(): Promise<Category[]> {
  const { data } = await apiClient.get<Category[]>('/categories')
  return data
}

export async function getCategoryTree(): Promise<CategoryWithChildren[]> {
  const { data } = await apiClient.get<CategoryWithChildren[]>('/categories/tree')
  return data
}

export async function getCategory(id: number): Promise<Category> {
  const { data } = await apiClient.get<Category>(`/categories/${id}`)
  return data
}

export async function getCategoryChildren(id: number): Promise<Category[]> {
  const { data } = await apiClient.get<Category[]>(`/categories/${id}/children`)
  return data
}
