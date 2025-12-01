import { useQuery } from '@tanstack/react-query'
import { getProducts, getProduct, searchProducts } from '@/api/products'
import { getCategories, getCategoryTree, getCategoryChildren } from '@/api/categories'
import type { ProductFilter } from '@/types'

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

export function useCategoryTree() {
  return useQuery({
    queryKey: ['categoryTree'],
    queryFn: getCategoryTree,
  })
}

export function useChildCategories(parentId: number | null) {
  return useQuery({
    queryKey: ['childCategories', parentId],
    queryFn: () => getCategoryChildren(parentId!),
    enabled: parentId !== null,
  })
}

export function useProductSearch(query: string) {
  return useQuery({
    queryKey: ['productSearch', query],
    queryFn: () => searchProducts(query),
    enabled: query.length >= 2,
  })
}
