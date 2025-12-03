import { useQuery } from '@tanstack/react-query'
import {
  getScenarios,
  getScenario,
  getScenarioRecommendations,
  getAutoScenarioRecommendations,
} from '@/api'

export function useScenarios() {
  return useQuery({
    queryKey: ['scenarios'],
    queryFn: getScenarios,
  })
}

export function useScenario(scenarioId: string) {
  return useQuery({
    queryKey: ['scenario', scenarioId],
    queryFn: () => getScenario(scenarioId),
    enabled: !!scenarioId,
  })
}

export function useScenarioRecommendations(scenarioId: string, cartProductIds: number[] = []) {
  return useQuery({
    queryKey: ['scenarioRecommendations', scenarioId, cartProductIds],
    queryFn: () => getScenarioRecommendations(scenarioId, cartProductIds),
    enabled: !!scenarioId,
    placeholderData: (previousData) => previousData,
  })
}

export function useAutoScenarioRecommendations(cartProductIds: number[] = []) {
  return useQuery({
    queryKey: ['autoScenarioRecommendations', cartProductIds],
    queryFn: () => getAutoScenarioRecommendations(cartProductIds),
    placeholderData: (previousData) => previousData,
  })
}
