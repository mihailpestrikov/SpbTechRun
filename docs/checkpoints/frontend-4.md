# Frontend Checkpoint 4

**Дата:** 01.12.2025

## Что сделано с checkpoint 3

### Полная интеграция с бэкендом API

Переключены все API с моков на реальные запросы к бэкенду.

#### Products API
- [x] `getProducts(filter)` — получение списка товаров с фильтрацией
- [x] `getProduct(id)` — получение товара по ID
- [x] `searchProducts(query)` — поиск товаров

#### Categories API
- [x] `getCategories()` — плоский список категорий
- [x] `getCategoryTree()` — иерархическое дерево категорий
- [x] `getCategory(id)` — категория по ID
- [x] `getCategoryChildren(id)` — дочерние категории

#### Cart API
- [x] `getCart()` — получение корзины
- [x] `addToCart(productId, quantity)` — добавление товара
- [x] `updateCartItem(itemId, quantity)` — изменение количества
- [x] `removeCartItem(itemId)` — удаление товара
- [x] `clearCart()` — очистка корзины

#### Recommendations API
- [x] `getRecommendations(productId)` — рекомендации для товара
- [x] `sendFeedback(feedback)` — отправка фидбека на рекомендацию

### Обновление типов

Типы синхронизированы с бэкендом (snake_case):

```typescript
// Было (camelCase)
interface Product {
  categoryId: number
  brand: string
  imageUrl: string
}

// Стало (snake_case)
interface Product {
  category_id: number
  vendor?: string
  picture?: string
  discount_price?: number
  available: boolean
  currency: string
}
```

### Cart Store рефакторинг

Store переписан с локального хранения на синхронизацию с API:

```typescript
// Было: zustand persist (localStorage)
// Стало: API-синхронизация

const useCartStore = create<CartState>()((set, get) => ({
  items: [],
  total: 0,
  loading: false,

  fetchCart: async () => {
    const cart = await cartApi.getCart()
    set({ items: cart.items, total: cart.total })
  },

  addItem: async (productId, quantity) => {
    await cartApi.addToCart(productId, quantity)
    await get().fetchCart()
  },
  // ...
}))
```

### Удалённые файлы
- `api/mock-data.ts` — моковые данные больше не нужны

## Изменённые файлы

### `src/types/index.ts`
- `Product`: добавлены `picture`, `vendor`, `currency`, `available`, `discount_price`, `discount_ends`, `market_description`, `weight`
- `Category`: `parentId` → `parent_id`
- `CartItem`: добавлены `id`, `product_id`, `added_at`, опциональный `product`
- `CartResponse`: новый тип `{ items, total }`
- `ProductFilter`: новый тип для фильтрации
- `ProductListResponse`: новый тип `{ products, total, limit, offset }`

### `src/api/products.ts`
```typescript
export async function getProducts(filter?: ProductFilter): Promise<ProductListResponse> {
  const params = new URLSearchParams()
  if (filter?.category_id) params.append('category_id', String(filter.category_id))
  if (filter?.min_price) params.append('min_price', String(filter.min_price))
  // ...
  const { data } = await apiClient.get<ProductListResponse>(`/products?${params}`)
  return data
}
```

### `src/api/categories.ts`
```typescript
export async function getCategories(): Promise<Category[]>
export async function getCategoryTree(): Promise<CategoryWithChildren[]>
export async function getCategory(id: number): Promise<Category>
export async function getCategoryChildren(id: number): Promise<Category[]>
```

### `src/api/cart.ts`
```typescript
export async function getCart(): Promise<CartResponse>
export async function addToCart(productId: number, quantity?: number): Promise<CartItem>
export async function updateCartItem(itemId: number, quantity: number): Promise<void>
export async function removeCartItem(itemId: number): Promise<void>
export async function clearCart(): Promise<void>
```

### `src/hooks/useProducts.ts`
- Убран `useCategorySearch` (фильтрация категорий теперь локальная через `useMemo`)
- Обновлены типы возвращаемых данных

### Компоненты
- `ProductCard.tsx` — использует `product.picture`, `product.vendor`, `product.discount_price`
- `AddToCartButton.tsx` — работает через `product_id` и `item.id`
- `CartPage.tsx` — загружает корзину при монтировании, использует `item.product?.name`
- `HomePage.tsx` — загружает корзину при монтировании, передаёт `ProductFilter`
- `ProductPage.tsx` — использует новые поля продукта
- `CatalogModal.tsx` — локальная фильтрация категорий через `useMemo`

## Структура API

```
frontend/src/api/
├── client.ts          # Axios instance + JWT interceptor
├── auth.ts            # login, register, getProfile
├── products.ts        # getProducts, getProduct, searchProducts
├── categories.ts      # getCategories, getCategoryTree, getCategoryChildren
├── cart.ts            # getCart, addToCart, updateCartItem, removeCartItem, clearCart
├── recommendations.ts # getRecommendations, sendFeedback
├── orders.ts          # TODO: переключить на реальные запросы
└── index.ts           # реэкспорт всех API
```

## API Endpoints (бэкенд)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/products` | Список товаров с фильтрацией |
| GET | `/api/products/:id` | Товар по ID |
| GET | `/api/categories` | Все категории (плоский список) |
| GET | `/api/categories/tree` | Дерево категорий |
| GET | `/api/categories/:id` | Категория по ID |
| GET | `/api/categories/:id/children` | Дочерние категории |
| GET | `/api/cart` | Получить корзину |
| POST | `/api/cart/items` | Добавить товар |
| PUT | `/api/cart/items/:id` | Изменить количество |
| DELETE | `/api/cart/items/:id` | Удалить товар |
| DELETE | `/api/cart` | Очистить корзину |
| GET | `/api/recommendations/:productId` | Рекомендации для товара |
| POST | `/api/recommendations/feedback` | Отправить фидбек |

## Что осталось

### Интеграция
- [ ] Orders API — оформление заказа
- [ ] История заказов пользователя

### Рекомендации
- [ ] Карусель рекомендаций на главной
- [ ] Рекомендации в корзине ("Добавьте к заказу")

### Polish
- [ ] Пагинация товаров
- [ ] Адаптивная вёрстка
- [ ] Скелетоны загрузки
- [ ] Toast уведомления
- [ ] Оптимистичные обновления корзины

## Запуск

### Через Docker (production-like)
```bash
docker-compose up --build
# Фронтенд: http://localhost:3000
# API проксируется через nginx
```

### Локально (development)
```bash
# Терминал 1: бэкенд
cd backend && go run cmd/server/main.go

# Терминал 2: фронтенд
cd frontend
VITE_API_URL=http://localhost:8080/api npm run dev
# Фронтенд: http://localhost:5173
```

## Особенности реализации

### Гостевая корзина
Бэкенд использует cookie `session_id` для идентификации гостей. При логине корзина автоматически мержится в аккаунт пользователя.

### Кеширование
- Бэкенд кеширует корзину в Redis
- Фронтенд использует React Query для кеширования API-ответов
