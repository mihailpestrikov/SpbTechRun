# Checkpoint frontend-6

## Заказы и оптимизации

### Реализовано

#### 1. Полный флоу заказов
- **Backend**: `repository/order.go`, `service/order.go`, `handler/order.go`
- Создание заказа из корзины авторизованного пользователя
- Получение списка заказов и отдельного заказа
- Очистка корзины после оформления (БД + Redis кэш)
- Batch-запросы для получения товаров (без N+1)

#### 2. OptionalAuth middleware
- Парсит JWT токен если он есть, но не блокирует запрос
- Используется для эндпоинтов корзины (`/api/cart/*`)
- Позволяет работать с корзиной как гостям, так и авторизованным

#### 3. Страница истории заказов
- Детальное отображение товаров в каждом заказе
- Миниатюры товаров, количество, цена за единицу, сумма
- Ссылки на страницы товаров
- Статус заказа (В обработке / Завершён / Отменён)

#### 4. Оформление заказа упрощено
- Убран ввод адреса доставки
- Кнопка "Оформить заказ" → переход в историю заказов
- Проверка авторизации перед оформлением

#### 5. UI/UX улучшения
- Фиксированная высота кнопки "В корзину" (`h-9`) — не прыгает при смене состояния
- Функция `capitalize()` для названий товаров — первая буква заглавная

### Изменённые файлы

**Backend:**
- `internal/middleware/auth.go` — добавлен `OptionalAuth`
- `internal/handler/router.go` — cart endpoints через `optionalAuthMiddleware`
- `internal/service/order.go` — инвалидация кэша корзины после заказа
- `internal/dto/order.go` — пустой `CreateOrderRequest`

**Frontend:**
- `src/lib/utils.ts` — функция `capitalize()`
- `src/components/cart/AddToCartButton.tsx` — фиксированная высота `h-9`
- `src/components/product/ProductCard.tsx` — capitalize для названия
- `src/components/layout/SearchBar.tsx` — capitalize для названия
- `src/pages/ProductPage.tsx` — capitalize, фиксированная высота кнопок
- `src/pages/CartPage.tsx` — упрощённое оформление, capitalize
- `src/pages/OrderHistoryPage.tsx` — детальное отображение товаров
- `src/api/orders.ts` — createOrder без параметров
- `src/types/index.ts` — синхронизация Order/OrderItem с бэкендом

### API контракт заказов

```typescript
// POST /api/orders (protected)
// Response: Order

// GET /api/orders (protected)
// Response: Order[]

// GET /api/orders/:id (protected)
// Response: Order

interface Order {
  id: number
  created_at: string
  status: 'pending' | 'completed' | 'cancelled'
  total: number
  address?: string
  items: OrderItem[]
}

interface OrderItem {
  id: number
  product_id: number
  quantity: number
  price: number
  product?: Product
}
```

### Флоу оформления заказа

1. Пользователь добавляет товары в корзину (авторизован)
2. Переходит в корзину → видит товары и сумму
3. Нажимает "Оформить заказ"
4. Backend:
   - Получает корзину по user_id из БД
   - Создаёт заказ с товарами
   - Очищает корзину в БД
   - Инвалидирует кэш корзины в Redis
5. Frontend перенаправляет на `/orders`
