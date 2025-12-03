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

export interface RecommendationEvent {
  event_type: 'impression' | 'click' | 'add_to_cart'
  main_product_id: number
  recommended_product_id: number
  recommendation_context?: string
  recommendation_rank?: number
  user_id?: number
  session_id?: string
}

function getSessionId(): string {
  let sessionId = localStorage.getItem('rec_session_id')
  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    localStorage.setItem('rec_session_id', sessionId)
  }
  return sessionId
}

export async function logRecommendationEvent(event: Omit<RecommendationEvent, 'session_id'>): Promise<void> {
  try {
    await apiClient.post('/events', {
      ...event,
      session_id: getSessionId(),
    })
  } catch (error) {
    // Не блокируем UI при ошибках логирования
    console.warn('Failed to log recommendation event:', error)
  }
}

export async function logRecommendationImpressions(
  mainProductId: number,
  recommendations: Recommendation[],
  context: string = 'product_page'
): Promise<void> {
  try {
    const events = recommendations.map((rec, index) => ({
      event_type: 'impression' as const,
      main_product_id: mainProductId,
      recommended_product_id: rec.product.id,
      recommendation_context: context,
      recommendation_rank: index + 1,
      session_id: getSessionId(),
    }))

    await apiClient.post('/events/batch', events)
  } catch (error) {
    console.warn('Failed to log recommendation impressions:', error)
  }
}
