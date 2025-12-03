import { apiClient } from './client'
import type { Recommendation, FeedbackRequest } from '@/types'

interface RecommendationsResponse {
  product_id: number
  product_name: string
  detected_scenario?: { id: string; name: string }
  recommendations: Recommendation[]
  total_count: number
}

export async function getRecommendations(productId: number): Promise<Recommendation[]> {
  const { data } = await apiClient.get<RecommendationsResponse>(`/recommendations/${productId}`)
  return data.recommendations
}

export async function sendFeedback(feedback: FeedbackRequest): Promise<void> {
  await apiClient.post('/feedback', feedback)
}
