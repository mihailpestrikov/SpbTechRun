import { useQuery, useMutation } from '@tanstack/react-query'
import { getRecommendations, sendFeedback } from '@/api'
import type { FeedbackRequest } from '@/types'

export function useRecommendations(productId: number) {
  return useQuery({
    queryKey: ['recommendations', productId],
    queryFn: () => getRecommendations(productId),
    enabled: !!productId,
  })
}

export function useFeedback() {
  return useMutation({
    mutationFn: (data: FeedbackRequest) => sendFeedback(data),
  })
}
