import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { AddToCartButton } from '@/components/cart'
import { capitalize } from '@/lib/utils'
import type { Product } from '@/types'

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const displayPrice = product.discount_price || product.price
  const hasDiscount = product.discount_price && product.discount_price < product.price

  return (
    <Card className="p-4 hover:shadow-lg transition-shadow h-full flex flex-col">
      <Link to={`/product/${product.id}`} className="flex-1 flex flex-col">
        {product.picture ? (
          <img
            src={product.picture}
            alt={product.name}
            className="h-40 w-full object-contain rounded mb-3"
          />
        ) : (
          <div className="bg-gray-200 h-40 rounded mb-3 flex items-center justify-center text-gray-400">
            Фото
          </div>
        )}
        <h3 className="font-medium text-gray-800 line-clamp-2 min-h-[3rem]">{capitalize(product.name)}</h3>
        {product.vendor && <p className="text-sm text-gray-500">{product.vendor}</p>}
        <div className="mt-auto pt-2">
          {hasDiscount ? (
            <>
              <p className="text-gray-400 line-through text-sm">{product.price} ₽</p>
              <p className="text-red-700 font-semibold">{displayPrice} ₽</p>
            </>
          ) : (
            <p className="text-red-700 font-semibold">{displayPrice} ₽</p>
          )}
        </div>
      </Link>
      <div className="mt-3">
        <AddToCartButton productId={product.id} />
      </div>
    </Card>
  )
}
