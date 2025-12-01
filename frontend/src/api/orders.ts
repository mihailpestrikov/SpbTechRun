import { apiClient } from './client'
import type { Order } from '@/types'

export async function getOrders(): Promise<Order[]> {
  const { data } = await apiClient.get<Order[]>('/orders')
  return data
}

export async function createOrder(): Promise<Order> {
  const { data } = await apiClient.post<Order>('/orders')
  return data
}
