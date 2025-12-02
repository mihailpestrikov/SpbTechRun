import { Package } from 'lucide-react'
import { ProductCard } from './ProductCard'
import type { Product } from '@/types'

interface ProductGridProps {
  products: Product[]
  isLoading?: boolean
}

function ProductSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden h-full flex flex-col animate-pulse">
      <div className="p-4 flex-1 flex flex-col">
        <div className="h-44 mb-4 rounded-xl bg-gray-100" />
        <div className="flex-1 flex flex-col">
          <div className="h-4 bg-gray-100 rounded-lg w-full mb-2" />
          <div className="h-4 bg-gray-100 rounded-lg w-2/3 mb-3" />
          <div className="h-3 bg-gray-100 rounded-lg w-1/3 mb-auto" />
          <div className="h-6 bg-gray-100 rounded-lg w-1/2 mt-3" />
        </div>
      </div>
      <div className="p-4 pt-0">
        <div className="h-10 bg-gray-100 rounded-xl" />
      </div>
    </div>
  )
}

export function ProductGrid({ products, isLoading }: ProductGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <ProductSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Package className="w-10 h-10 text-gray-300" />
        </div>
        <h3 className="text-lg font-medium text-gray-800 mb-2">Товары не найдены</h3>
        <p className="text-gray-500 text-sm">Попробуйте изменить параметры поиска</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
