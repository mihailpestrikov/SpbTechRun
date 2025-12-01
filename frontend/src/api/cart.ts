import { apiClient } from './client'
import type { CartResponse, CartItem } from '@/types'

export async function getCart(): Promise<CartResponse> {
  const { data } = await apiClient.get<CartResponse>('/cart')
  return data
}

export async function addToCart(productId: number, quantity = 1): Promise<CartItem> {
  const { data } = await apiClient.post<CartItem>('/cart/items', {
    product_id: productId,
    quantity,
  })
  return data
}

export async function updateCartItem(itemId: number, quantity: number): Promise<void> {
  await apiClient.put(`/cart/items/${itemId}`, { quantity })
}

export async function removeCartItem(itemId: number): Promise<void> {
  await apiClient.delete(`/cart/items/${itemId}`)
}

export async function clearCart(): Promise<void> {
  await apiClient.delete('/cart')
}
