# Frontend Checkpoint 5

**Дата:** 01.12.2025

## Что сделано с checkpoint 4

### Пагинация товаров
- [x] Компонент `Pagination` с номерами страниц и стрелками
- [x] 21 товар на страницу (`ITEMS_PER_PAGE`)
- [x] Сброс на первую страницу при изменении фильтров
- [x] Интеграция с бэкендом через `limit` и `offset`
- [x] Показ "1 ... 4 5 6 ... 50" для больших списков

### Debounce для фильтров
- [x] Хук `useDebounce` с задержкой 700мс
- [x] Применяется к фильтрам по цене (min/max)
- [x] Запросы отправляются только после паузы ввода

### HTML в описании товаров
- [x] Поддержка `<br>` тегов и HTML-форматирования в описании
- [x] Использование `dangerouslySetInnerHTML` в `ProductPage`

### CORS и Cookies
- [x] Axios client с `withCredentials: true` для отправки cookies
- [x] CORS middleware на бэкенде с поддержкой credentials
- [x] Гостевая корзина работает через `session_id` cookie

### Исправления багов
- [x] Гостевая корзина: `ID = ProductID` для корректной работы update/delete
- [x] Удалены неиспользуемые моки из `orders.ts` и `recommendations.ts`
- [x] Исправлены типы (`created_at`, `total_price` в OrderHistoryPage)
- [x] SearchBar: заменён `useCategorySearch` на локальную фильтрацию

## Изменённые файлы

### `src/pages/HomePage.tsx`
```typescript
const ITEMS_PER_PAGE = 21
const DEBOUNCE_MS = 700

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

// Использование
const debouncedMinPrice = useDebounce(minPrice, DEBOUNCE_MS)
const debouncedMaxPrice = useDebounce(maxPrice, DEBOUNCE_MS)

const filter: ProductFilter = useMemo(() => ({
  category_id: categoryId,
  min_price: debouncedMinPrice ? parseFloat(debouncedMinPrice) : undefined,
  max_price: debouncedMaxPrice ? parseFloat(debouncedMaxPrice) : undefined,
  limit: ITEMS_PER_PAGE,
  offset: (page - 1) * ITEMS_PER_PAGE,
}), [categoryId, debouncedMinPrice, debouncedMaxPrice, page])
```

### Компонент Pagination (в HomePage.tsx)
```typescript
function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const getPageNumbers = () => {
    // Логика для "1 ... 4 5 6 ... 50"
  }
  return (
    <div className="flex items-center justify-center gap-1">
      <Button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>←</Button>
      {/* номера страниц */}
      <Button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>→</Button>
    </div>
  )
}
```

### `src/api/client.ts`
```typescript
export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,  // Важно для cookies
})
```

### `src/pages/ProductPage.tsx`
```typescript
{product.description && (
  <div>
    <h2 className="font-semibold text-gray-700 mb-2">Описание</h2>
    <p
      className="text-gray-600"
      dangerouslySetInnerHTML={{ __html: product.description }}
    />
  </div>
)}
```

### `src/api/orders.ts`
```typescript
// Переключено с моков на реальные запросы
export async function getOrders(): Promise<Order[]> {
  const { data } = await apiClient.get<Order[]>('/orders')
  return data
}

export async function createOrder(): Promise<Order> {
  const { data } = await apiClient.post<Order>('/orders')
  return data
}
```

### `src/api/recommendations.ts`
```typescript
// Переключено с моков на реальные запросы
export async function getRecommendations(productId: number): Promise<Recommendation[]> {
  const { data } = await apiClient.get<Recommendation[]>(`/recommendations/${productId}`)
  return data
}

export async function sendFeedback(feedback: FeedbackRequest): Promise<void> {
  await apiClient.post('/recommendations/feedback', feedback)
}
```

## Бэкенд изменения

### CORS middleware (`internal/handler/router.go`)
```go
func corsMiddleware() gin.HandlerFunc {
    return func(c *gin.Context) {
        origin := c.Request.Header.Get("Origin")
        if origin != "" {
            c.Header("Access-Control-Allow-Origin", origin)
            c.Header("Access-Control-Allow-Credentials", "true")
            c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
            c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        }
        if c.Request.Method == "OPTIONS" {
            c.AbortWithStatus(http.StatusNoContent)
            return
        }
        c.Next()
    }
}
```

### Гостевая корзина (`internal/service/cart.go`)
```go
// ID = ProductID для гостей (т.к. нет database ID)
result.Items = append(result.Items, CartItemWithProduct{
    Item: model.CartItem{
        ID:        item.ProductID,  // Исправлено
        ProductID: item.ProductID,
        Quantity:  item.Quantity,
        SessionID: sessionID,
    },
    Product: *product,
})
```

## Что осталось

### Фильтрация по категориям
- [ ] Рекурсивный поиск по подкатегориям (WITH RECURSIVE SQL)
- Сейчас фильтрация работает только по точной категории, без вложенных

### Рекомендации
- [ ] Карусель рекомендаций на главной
- [ ] Рекомендации в корзине

### Polish
- [ ] Адаптивная вёрстка
- [ ] Скелетоны загрузки
- [ ] Toast уведомления

## Запуск

```bash
docker-compose up --build
# Фронтенд: http://localhost:3000
# API проксируется через nginx
```

## Известные ограничения

1. **Фильтрация по категории** — показывает только товары из выбранной категории, без подкатегорий
2. **Рекомендации** — API готов, но данные пока mock (нужна ML-модель)
3. **Заказы** — API готов, но endpoint на бэкенде возвращает mock
