import type { Order, CartItem } from '@/types'
import { mockOrders } from './mock-data'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function getOrders(): Promise<Order[]> {
  await delay(300)
  return mockOrders
}

export async function createOrder(items: CartItem[]): Promise<Order> {
  await delay(500)
  const totalPrice = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  return {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    status: 'pending',
    totalPrice,
    items: items.map((item) => ({
      product: item.product,
      quantity: item.quantity,
      price: item.product.price,
    })),
  }
}
