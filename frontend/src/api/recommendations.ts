import type { Recommendation, FeedbackRequest } from '@/types'
import { mockProducts } from './mock-data'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const reasons = [
  'Часто покупают вместе',
  'Необходим для работы',
  'Популярный выбор',
  'Рекомендуют покупатели',
]

export async function getRecommendations(productId: number): Promise<Recommendation[]> {
  await delay(400)
  const otherProducts = mockProducts.filter((p) => p.id !== productId).slice(0, 4)
  return otherProducts.map((product, i) => ({
    product,
    score: 0.95 - i * 0.1,
    reason: reasons[i % reasons.length],
  }))
}

export async function sendFeedback(feedback: FeedbackRequest): Promise<void> {
  await delay(200)
  console.log('Feedback sent:', feedback)
}
