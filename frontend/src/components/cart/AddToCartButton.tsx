import { useCartStore } from '@/store'
import { Button } from '@/components/ui/button'
import type { Product } from '@/types'

interface AddToCartButtonProps {
  product: Product
}

export function AddToCartButton({ product }: AddToCartButtonProps) {
  const { items, addItem, updateQuantity } = useCartStore()
  const cartItem = items.find((i) => i.product.id === product.id)
  const quantity = cartItem?.quantity || 0

  if (quantity === 0) {
    return (
      <Button
        onClick={() => addItem(product)}
        className="w-full bg-red-700 hover:bg-red-800"
      >
        В корзину
      </Button>
    )
  }

  return (
    <div className="flex items-center justify-between border border-red-700 rounded-md">
      <button
        onClick={() => updateQuantity(product.id, quantity - 1)}
        className="px-3 py-2 text-red-700 hover:bg-red-50 transition-colors rounded-l-md"
      >
        −
      </button>
      <span className="px-4 py-2 font-medium text-red-700">{quantity}</span>
      <button
        onClick={() => addItem(product)}
        className="px-3 py-2 text-red-700 hover:bg-red-50 transition-colors rounded-r-md"
      >
        +
      </button>
    </div>
  )
}
