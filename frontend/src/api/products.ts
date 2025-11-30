import type { Product, Category, CategoryWithChildren, PaginatedResponse } from '@/types'
import { mockProducts, mockCategories } from './mock-data'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

function getAllDescendantIds(categoryId: number, categories: Category[]): number[] {
  const ids: number[] = [categoryId]
  const children = categories.filter((c) => c.parentId === categoryId)
  for (const child of children) {
    ids.push(...getAllDescendantIds(child.id, categories))
  }
  return ids
}

export async function getProducts(params?: {
  categoryId?: number
  page?: number
  limit?: number
}): Promise<PaginatedResponse<Product>> {
  await delay(300)
  let items = [...mockProducts]
  if (params?.categoryId) {
    const categoryIds = getAllDescendantIds(params.categoryId, mockCategories)
    items = items.filter((p) => categoryIds.includes(p.categoryId))
  }
  return {
    items,
    total: items.length,
    page: params?.page || 1,
    totalPages: 1,
  }
}

export async function getProduct(id: number): Promise<Product> {
  await delay(200)
  const product = mockProducts.find((p) => p.id === id)
  if (!product) throw new Error('Product not found')
  return product
}

export async function getCategories(): Promise<Category[]> {
  await delay(100)
  return mockCategories
}

export async function getRootCategories(): Promise<Category[]> {
  await delay(100)
  return mockCategories.filter((c) => c.parentId === null)
}

export async function getChildCategories(parentId: number): Promise<Category[]> {
  await delay(100)
  return mockCategories.filter((c) => c.parentId === parentId)
}

function buildCategoryTree(categories: Category[], parentId: number | null = null): CategoryWithChildren[] {
  return categories
    .filter((c) => c.parentId === parentId)
    .map((c) => ({
      ...c,
      children: buildCategoryTree(categories, c.id),
    }))
}

export async function getCategoryTree(): Promise<CategoryWithChildren[]> {
  await delay(150)
  return buildCategoryTree(mockCategories)
}

export async function searchCategories(query: string): Promise<Category[]> {
  await delay(100)
  const lowerQuery = query.toLowerCase()
  return mockCategories.filter((c) => c.name.toLowerCase().includes(lowerQuery))
}

export async function searchProducts(query: string): Promise<Product[]> {
  await delay(150)
  const lowerQuery = query.toLowerCase()
  return mockProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(lowerQuery) ||
      p.brand.toLowerCase().includes(lowerQuery)
  )
}
