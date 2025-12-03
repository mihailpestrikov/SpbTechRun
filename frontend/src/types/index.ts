export interface Category {
  id: number
  name: string
  parent_id: number | null
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
  match_reasons?: MatchReason[]
  rank?: number
  group_name?: string
}

export interface MatchReason {
  type: string
  text: string
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
  main_product_id?: number
  recommended_product_id: number
  feedback: 'positive' | 'negative'
  context?: 'product_page' | 'scenario'
  scenario_id?: string
  group_name?: string
  user_id?: number
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

export interface SearchFilter {
  q?: string
  category_ids?: number[]
  min_price?: number
  max_price?: number
  vendors?: string[]
  available?: boolean
  limit?: number
  offset?: number
}

export interface CategoryAgg {
  id: number
  parent_id: number | null
  name: string
  count: number
}

export interface VendorAgg {
  name: string
  count: number
}

export interface PriceRange {
  min: number
  max: number
}

export interface SearchAggregations {
  categories: CategoryAgg[]
  vendors: VendorAgg[]
  price_range?: PriceRange
}

export interface SearchResponse {
  products: Product[]
  total: number
  limit: number
  offset: number
  aggregations: SearchAggregations
}

export interface Scenario {
  id: string
  name: string
  description: string
  image?: string
  groups_count: number
  required_groups: number
}

export interface ScenarioGroup {
  name: string
  category_ids: number[]
  is_required: boolean
  sort_order: number
}

export interface ScenarioDetails extends Scenario {
  groups: ScenarioGroup[]
}

export interface ScenarioProgress {
  completed: number
  total: number
  percentage: number
}

export interface GroupProduct {
  id: number
  name: string
  price: number
  picture?: string
  category_name?: string
  discount_price?: number
  score: number
  reason: string
}

export interface GroupRecommendation {
  group_name: string
  is_required: boolean
  category_ids?: number[]
  products: GroupProduct[]
}

export interface CompletedGroup {
  group_name: string
  is_required: boolean
  status: string
  cart_products: { id: number; name: string; price: number }[]
}

export interface ScenarioRecommendationsResponse {
  scenario: { id: string; name: string }
  progress: ScenarioProgress
  recommendations: GroupRecommendation[]
  completed_groups: CompletedGroup[]
  all_scenarios: { id: string; name: string }[]
}
