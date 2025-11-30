import { ProductCard } from './ProductCard'
import type { Product } from '@/types'

interface ProductGridProps {
  products: Product[]
  isLoading?: boolean
}

export function ProductGrid({ products, isLoading }: ProductGridProps) {
  if (isLoading) {
    return <div className="text-center py-12 text-gray-500">Загрузка...</div>
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        Товары не найдены
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
