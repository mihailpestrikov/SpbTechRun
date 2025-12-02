import { Link } from 'react-router-dom'
import { ShoppingCart, Check } from 'lucide-react'
import { useCartStore } from '@/store'
import { capitalize } from '@/lib/utils'
import type { Product } from '@/types'

interface ProductCardProps {
  product: Product
}

export function ProductCard({ product }: ProductCardProps) {
  const displayPrice = product.discount_price || product.price
  const hasDiscount = product.discount_price && product.discount_price < product.price
  const discountPercent = hasDiscount
    ? Math.round((1 - product.discount_price! / product.price) * 100)
    : 0

  const { items, addItem, updateQuantity, isProductLoading } = useCartStore()
  const cartItem = items.find((i) => i.product_id === product.id)
  const quantity = cartItem?.quantity || 0
  const loading = isProductLoading(product.id)

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    addItem(product.id)
  }

  const handleUpdateQuantity = (e: React.MouseEvent, newQty: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (cartItem) {
      updateQuantity(cartItem.id, newQty)
    }
  }

  return (
    <div className="group relative bg-white rounded-2xl border border-gray-100 overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-gray-200/50 hover:-translate-y-1 h-full flex flex-col">
      {hasDiscount && (
        <div className="absolute top-3 left-3 z-10 bg-gradient-to-r from-red-500 to-rose-500 text-white text-xs font-bold px-2.5 py-1 rounded-lg shadow-md">
          -{discountPercent}%
        </div>
      )}

      <Link to={`/product/${product.id}`} className="flex-1 flex flex-col p-4">
        <div className="relative h-44 mb-4 overflow-hidden rounded-xl bg-white">
          {product.picture ? (
            <img
              src={product.picture}
              alt={product.name}
              className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <ShoppingCart className="w-12 h-12" />
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col">
          <h3 className="font-medium text-gray-800 text-sm leading-snug group-hover:text-red-600 transition-colors overflow-hidden max-h-[2.75rem]" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {capitalize(product.name)}
          </h3>

          {product.vendor && (
            <p className="text-xs text-gray-400 mt-1 truncate">{product.vendor}</p>
          )}

          <div className="mt-auto pt-3">
            {hasDiscount ? (
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-gray-900">
                  {displayPrice.toLocaleString()} ₽
                </span>
                <span className="text-sm text-gray-400 line-through">
                  {product.price.toLocaleString()} ₽
                </span>
              </div>
            ) : (
              <span className="text-lg font-bold text-gray-900">
                {displayPrice.toLocaleString()} ₽
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="p-4 pt-0">
        {quantity === 0 ? (
          <button
            onClick={handleAddToCart}
            disabled={loading || !product.available}
            className="w-full h-10 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 disabled:from-gray-300 disabled:to-gray-300 text-white text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:shadow-none"
          >
            {!product.available ? (
              'Нет в наличии'
            ) : (
              <>
                <ShoppingCart className="w-4 h-4" />
                В корзину
              </>
            )}
          </button>
        ) : (
          <div className="flex items-center h-10 bg-gray-100 rounded-xl overflow-hidden">
            <button
              onClick={(e) => handleUpdateQuantity(e, quantity - 1)}
              disabled={loading}
              className="w-10 h-full flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors text-lg font-medium disabled:opacity-50"
            >
              −
            </button>
            <div className="flex-1 flex items-center justify-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-green-500" />
              <span className="font-semibold text-gray-800">{quantity}</span>
            </div>
            <button
              onClick={(e) => handleUpdateQuantity(e, quantity + 1)}
              disabled={loading}
              className="w-10 h-full flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors text-lg font-medium disabled:opacity-50"
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
