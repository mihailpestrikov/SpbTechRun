import { create } from 'zustand'
import * as cartApi from '@/api/cart'
import type { CartItem } from '@/types'

interface CartState {
  items: CartItem[]
  total: number
  loading: boolean
  error: string | null

  fetchCart: () => Promise<void>
  addItem: (productId: number, quantity?: number) => Promise<void>
  updateQuantity: (itemId: number, quantity: number) => Promise<void>
  removeItem: (itemId: number) => Promise<void>
  clear: () => Promise<void>
  totalItems: () => number
}

export const useCartStore = create<CartState>()((set, get) => ({
  items: [],
  total: 0,
  loading: false,
  error: null,

  fetchCart: async () => {
    set({ loading: true, error: null })
    try {
      const cart = await cartApi.getCart()
      set({ items: cart.items, total: cart.total, loading: false })
    } catch (err) {
      set({ error: 'Failed to load cart', loading: false })
    }
  },

  addItem: async (productId, quantity = 1) => {
    set({ loading: true, error: null })
    try {
      await cartApi.addToCart(productId, quantity)
      await get().fetchCart()
    } catch (err) {
      set({ error: 'Failed to add item', loading: false })
    }
  },

  updateQuantity: async (itemId, quantity) => {
    set({ loading: true, error: null })
    try {
      if (quantity <= 0) {
        await cartApi.removeCartItem(itemId)
      } else {
        await cartApi.updateCartItem(itemId, quantity)
      }
      await get().fetchCart()
    } catch (err) {
      set({ error: 'Failed to update item', loading: false })
    }
  },

  removeItem: async (itemId) => {
    set({ loading: true, error: null })
    try {
      await cartApi.removeCartItem(itemId)
      await get().fetchCart()
    } catch (err) {
      set({ error: 'Failed to remove item', loading: false })
    }
  },

  clear: async () => {
    set({ loading: true, error: null })
    try {
      await cartApi.clearCart()
      set({ items: [], total: 0, loading: false })
    } catch (err) {
      set({ error: 'Failed to clear cart', loading: false })
    }
  },

  totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
}))
