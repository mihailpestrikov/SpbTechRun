import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { AddToCartButton } from '@/components/cart'
import type { Product } from '@/types'

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Card className="hover:shadow-lg transition-shadow h-full flex flex-col border-0 p-0 rounded-[20px] overflow-hidden [&>*]:p-0 shadow-[0_4px_10px_rgba(0,0,0,0.1)]">
      <Link to={`/product/${product.id}`} className="flex-1 flex flex-col">
        <div className="bg-gray-200 h-80 w-full mb-3  flex items-center justify-center text-gray-400">
          Фото
        </div>
        <div className='pl-3 pr-3 flex-col flex-1 '>
          <h3 className="font-medium text-gray-800 line-clamp-2 min-h-[3rem]">{product.name}</h3>
          <p className="text-sm text-gray-500">{product.brand}</p>

          
        </div>
      </Link>
      <div className="m-3 mb-5 p-3">
        <Link to={`/product/${product.id}`} className="flex-1 flex flex-col">
          <p className="text-black font-bold text-xl mt-auto pt-2 mb-3">{product.price} ₽/шт.</p>
        </Link>
        <AddToCartButton product={product} />
      </div>
    </Card>
  )
}
