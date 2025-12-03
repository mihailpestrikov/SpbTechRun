import { apiClient } from './client'
import type { Product, ProductListResponse, ProductFilter } from '@/types'

export async function getProducts(filter?: ProductFilter): Promise<ProductListResponse> {
  const params = new URLSearchParams()

  if (filter?.category_id) params.append('category_id', String(filter.category_id))
  if (filter?.min_price) params.append('min_price', String(filter.min_price))
  if (filter?.max_price) params.append('max_price', String(filter.max_price))
  if (filter?.vendor) params.append('vendor', filter.vendor)
  if (filter?.available !== undefined) params.append('available', String(filter.available))
  if (filter?.search) params.append('search', filter.search)
  if (filter?.limit) params.append('limit', String(filter.limit))
  if (filter?.offset) params.append('offset', String(filter.offset))

  const { data } = await apiClient.get<ProductListResponse>(`/products?${params.toString()}`)
  return data
}

export async function getProduct(id: number): Promise<Product> {
  const { data } = await apiClient.get<Product>(`/products/${id}`)
  return data
}

export async function searchProducts(query: string, limit = 10): Promise<Product[]> {
  const { data } = await apiClient.get<ProductListResponse>(`/products?search=${encodeURIComponent(query)}&limit=${limit}`)
  return data.products
}

export async function trackProductView(productId: number): Promise<void> {
  try {
    await apiClient.post(`/products/${productId}/view`)
  } catch {
  }
}
