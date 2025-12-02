import { useQuery } from '@tanstack/react-query'
import { getProducts, getProduct } from '@/api/products'
import { getCategories } from '@/api/categories'
import { search } from '@/api/search'
import type { ProductFilter, SearchFilter } from '@/types'

export function useProducts(filter?: ProductFilter) {
  return useQuery({
    queryKey: ['products', filter],
    queryFn: () => getProducts(filter),
  })
}

export function useProduct(id: number) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => getProduct(id),
    enabled: !!id,
  })
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  })
}

export function useSearch(filter: SearchFilter) {
  return useQuery({
    queryKey: ['search', filter],
    queryFn: () => search(filter),
    placeholderData: (prev) => prev,
  })
}
