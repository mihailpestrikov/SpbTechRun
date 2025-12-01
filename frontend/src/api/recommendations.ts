import { apiClient } from './client'
import type { Recommendation, FeedbackRequest } from '@/types'

interface RecommendationsResponse {
  product_id: number
  recommendations: Recommendation[]
}

export async function getRecommendations(productId: number): Promise<Recommendation[]> {
  const { data } = await apiClient.get<RecommendationsResponse>(`/recommendations/${productId}`)
  return data.recommendations
}

export async function sendFeedback(feedback: FeedbackRequest): Promise<void> {
  await apiClient.post('/recommendations/feedback', feedback)
}
