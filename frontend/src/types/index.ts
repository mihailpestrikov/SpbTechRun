export interface Category {
  id: number
  name: string
  parentId: number | null
}

export interface CategoryWithChildren extends Category {
  children?: CategoryWithChildren[]
}

export interface Product {
  id: number
  name: string
  description: string
  price: number
  brand: string
  categoryId: number
  category: Category
  imageUrl: string
  params: Record<string, string>
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
}

export interface CartItem {
  product: Product
  quantity: number
}

export interface Order {
  id: number
  createdAt: string
  status: 'pending' | 'completed' | 'cancelled'
  totalPrice: number
  items: OrderItem[]
}

export interface OrderItem {
  product: Product
  quantity: number
  price: number
}

export interface FeedbackRequest {
  mainProductId: number
  recommendedProductId: number
  feedback: 'positive' | 'negative'
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  totalPages: number
}

export interface AuthResponse {
  user: User
  token: string
}
