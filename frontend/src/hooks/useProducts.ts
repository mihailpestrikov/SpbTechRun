import { useQuery } from '@tanstack/react-query'
import {
  getProducts,
  getProduct,
  getCategories,
  getCategoryTree,
  searchCategories,
  searchProducts,
  getChildCategories,
} from '@/api'

export function useProducts(categoryId?: number) {
  return useQuery({
    queryKey: ['products', categoryId],
    queryFn: () => getProducts({ categoryId }),
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
    queryFn: () => getChildCategories(parentId!),
    enabled: parentId !== null,
  })
}

export function useCategorySearch(query: string) {
  return useQuery({
    queryKey: ['categorySearch', query],
    queryFn: () => searchCategories(query),
    enabled: query.length >= 2,
  })
}

export function useProductSearch(query: string) {
  return useQuery({
    queryKey: ['productSearch', query],
    queryFn: () => searchProducts(query),
    enabled: query.length >= 2,
  })
}
