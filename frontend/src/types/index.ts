export interface Category {
  id: number
  name: string
  parent_id: number | null
}

export interface CategoryWithChildren extends Category {
  children?: CategoryWithChildren[]
}

export interface Product {
  id: number
  category_id: number
  name: string
  url?: string
  price: number
  currency: string
  picture?: string
  vendor?: string
  country?: string
  description?: string
  market_description?: string
  weight?: number
  available: boolean
  params?: Record<string, string>
  created_at: string
  discount_price?: number
  discount_ends?: string
}

export interface ProductListResponse {
  products: Product[]
  total: number
  limit: number
  offset: number
}

export interface CartItem {
  id: number
  product_id: number
  quantity: number
  added_at: string
  product?: Product
}

export interface CartResponse {
  items: CartItem[]
  total: number
}

export interface Recommendation {
  product: Product
  score: number
  reason: string
}

export interface User {
  id: number
  name: string
  email: string
  phone?: string
}

export interface Order {
  id: number
  created_at: string
  status: 'pending' | 'completed' | 'cancelled'
  total: number
  address?: string
  items: OrderItem[]
}

export interface OrderItem {
  id: number
  product_id: number
  quantity: number
  price: number
  product?: Product
}

export interface FeedbackRequest {
  main_product_id: number
  recommended_product_id: number
  feedback: 'positive' | 'negative'
}

export interface AuthResponse {
  user: User
  token: string
}

export interface ProductFilter {
  category_id?: number
  min_price?: number
  max_price?: number
  vendor?: string
  available?: boolean
  search?: string
  limit?: number
  offset?: number
}
