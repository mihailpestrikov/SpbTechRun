import { create } from 'zustand'
import * as cartApi from '@/api/cart'
import type { CartItem } from '@/types'

interface CartState {
  items: CartItem[]
  total: number
  loading: boolean
  loadingProductId: number | null
  error: string | null

  fetchCart: () => Promise<void>
  addItem: (productId: number, quantity?: number) => Promise<void>
  updateQuantity: (itemId: number, quantity: number) => Promise<void>
  removeItem: (itemId: number) => Promise<void>
  clear: () => Promise<void>
  totalItems: () => number
  isProductLoading: (productId: number) => boolean
}

export const useCartStore = create<CartState>()((set, get) => ({
  items: [],
  total: 0,
  loading: false,
  loadingProductId: null,
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
    set({ loadingProductId: productId, error: null })
    try {
      await cartApi.addToCart(productId, quantity)
      await get().fetchCart()
    } catch (err) {
      set({ error: 'Failed to add item' })
    } finally {
      set({ loadingProductId: null })
    }
  },

  updateQuantity: async (itemId, quantity) => {
    const item = get().items.find(i => i.id === itemId)
    const productId = item?.product_id ?? null
    set({ loadingProductId: productId, error: null })
    try {
      if (quantity <= 0) {
        await cartApi.removeCartItem(itemId)
      } else {
        await cartApi.updateCartItem(itemId, quantity)
      }
      await get().fetchCart()
    } catch (err) {
      set({ error: 'Failed to update item' })
    } finally {
      set({ loadingProductId: null })
    }
  },

  removeItem: async (itemId) => {
    const item = get().items.find(i => i.id === itemId)
    const productId = item?.product_id ?? null
    set({ loadingProductId: productId, error: null })
    try {
      await cartApi.removeCartItem(itemId)
      await get().fetchCart()
    } catch (err) {
      set({ error: 'Failed to remove item' })
    } finally {
      set({ loadingProductId: null })
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

  isProductLoading: (productId) => get().loadingProductId === productId,
}))
