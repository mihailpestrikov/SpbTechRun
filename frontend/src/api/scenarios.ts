import { apiClient } from './client'
import type { Scenario, ScenarioDetails, ScenarioRecommendationsResponse } from '@/types'

export async function getScenarios(): Promise<Scenario[]> {
  const { data } = await apiClient.get<Scenario[]>('/scenarios')
  return data
}

export async function getScenario(scenarioId: string): Promise<ScenarioDetails> {
  const { data } = await apiClient.get<ScenarioDetails>(`/scenarios/${scenarioId}`)
  return data
}

export async function getScenarioRecommendations(
  scenarioId: string,
  cartProductIds: number[] = []
): Promise<ScenarioRecommendationsResponse> {
  const params = cartProductIds.length > 0 ? `?cart_product_ids=${cartProductIds.join(',')}` : ''
  const { data } = await apiClient.get<ScenarioRecommendationsResponse>(
    `/scenarios/${scenarioId}/recommendations${params}`
  )
  return data
}

export async function getAutoScenarioRecommendations(
  cartProductIds: number[] = []
): Promise<ScenarioRecommendationsResponse> {
  const params = cartProductIds.length > 0 ? `?cart_product_ids=${cartProductIds.join(',')}` : ''
  const { data } = await apiClient.get<ScenarioRecommendationsResponse>(
    `/recommendations/scenario/auto${params}`
  )
  return data
}
