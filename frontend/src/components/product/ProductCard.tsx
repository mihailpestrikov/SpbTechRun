import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { AddToCartButton } from '@/components/cart'
import type { Product } from '@/types'

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Card className="p-4 hover:shadow-lg transition-shadow h-full flex flex-col">
      <Link to={`/product/${product.id}`} className="flex-1 flex flex-col">
        <div className="bg-gray-200 h-40 rounded mb-3 flex items-center justify-center text-gray-400">
          Фото
        </div>
        <h3 className="font-medium text-gray-800 line-clamp-2 min-h-[3rem]">{product.name}</h3>
        <p className="text-sm text-gray-500">{product.brand}</p>
        <p className="text-red-700 font-semibold mt-auto pt-2">{product.price} ₽</p>
      </Link>
      <div className="mt-3">
        <AddToCartButton product={product} />
      </div>
    </Card>
  )
}
