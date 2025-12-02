import { apiClient } from './client'
import type { SearchFilter, SearchResponse } from '@/types'

export async function search(filter: SearchFilter): Promise<SearchResponse> {
  const params = new URLSearchParams()

  if (filter.q) params.append('q', filter.q)
  if (filter.category_ids?.length) params.append('category_ids', filter.category_ids.join(','))
  if (filter.min_price) params.append('min_price', String(filter.min_price))
  if (filter.max_price) params.append('max_price', String(filter.max_price))
  if (filter.vendors?.length) params.append('vendors', filter.vendors.join(','))
  if (filter.available !== undefined) params.append('available', String(filter.available))
  if (filter.limit) params.append('limit', String(filter.limit))
  if (filter.offset) params.append('offset', String(filter.offset))

  const { data } = await apiClient.get<SearchResponse>(`/search?${params.toString()}`)
  return data
}
