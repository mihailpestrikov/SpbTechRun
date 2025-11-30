import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getOrders, createOrder } from '@/api'
import type { CartItem } from '@/types'

export function useOrders() {
  return useQuery({
    queryKey: ['orders'],
    queryFn: getOrders,
  })
}

export function useCreateOrder() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (items: CartItem[]) => createOrder(items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}
