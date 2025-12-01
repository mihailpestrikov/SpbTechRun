import { useCartStore } from '@/store'
import { Button } from '@/components/ui/button'

interface AddToCartButtonProps {
  productId: number
}

export function AddToCartButton({ productId }: AddToCartButtonProps) {
  const { items, addItem, updateQuantity, loading } = useCartStore()
  const cartItem = items.find((i) => i.product_id === productId)
  const quantity = cartItem?.quantity || 0

  if (quantity === 0) {
    return (
      <Button
        onClick={() => addItem(productId)}
        disabled={loading}
        className="w-full bg-red-700 hover:bg-red-800"
      >
        В корзину
      </Button>
    )
  }

  return (
    <div className="flex items-center justify-between border border-red-700 rounded-md">
      <button
        onClick={() => updateQuantity(cartItem!.id, quantity - 1)}
        disabled={loading}
        className="px-3 py-2 text-red-700 hover:bg-red-50 transition-colors rounded-l-md disabled:opacity-50"
      >
        −
      </button>
      <span className="px-4 py-2 font-medium text-red-700">{quantity}</span>
      <button
        onClick={() => updateQuantity(cartItem!.id, quantity + 1)}
        disabled={loading}
        className="px-3 py-2 text-red-700 hover:bg-red-50 transition-colors rounded-r-md disabled:opacity-50"
      >
        +
      </button>
    </div>
  )
}
