# Frontend — React + TypeScript + Vite

Интерфейс интернет-магазина строительных материалов с системой рекомендаций.

## Технологии

| Технология | Версия | Назначение |
|------------|--------|------------|
| React | 19.2 | UI-библиотека |
| TypeScript | 5.9 | Типизация |
| Vite | 7.2 | Сборка и dev-сервер |
| TanStack Query | 5.90 | Server state management |
| Zustand | 5.0 | Client state management |
| React Router | 7.9 | Маршрутизация |
| Tailwind CSS | 4.1 | Стилизация |
| Axios | 1.13 | HTTP-клиент |
| Lucide React | 0.555 | Иконки |

## Структура проекта

```
src/
├── api/                    # API-клиенты
│   ├── client.ts           # Axios instance с interceptors
│   ├── products.ts         # CRUD товаров
│   ├── cart.ts             # Операции с корзиной
│   ├── auth.ts             # Авторизация
│   ├── orders.ts           # Заказы
│   ├── categories.ts       # Категории
│   ├── search.ts           # Elasticsearch поиск
│   ├── recommendations.ts  # ML-рекомендации
│   └── scenarios.ts        # Сценарии ремонта
│
├── components/
│   ├── ui/                 # Базовые UI-компоненты (button, card, input, badge)
│   ├── layout/             # Header, SearchBar, PageLayout
│   ├── product/            # ProductCard, ProductGrid
│   ├── cart/               # AddToCartButton
│   ├── filters/            # CategoryTree
│   └── recommendations/    # ScenarioCarousel
│
├── pages/
│   ├── HomePage.tsx        # Главная с каталогом и каруселью сценариев
│   ├── ProductPage.tsx     # Карточка товара с рекомендациями
│   ├── CartPage.tsx        # Корзина
│   ├── ScenariosPage.tsx   # Список сценариев ремонта
│   ├── ScenarioDetailPage.tsx # Детали сценария с прогрессом
│   ├── LoginPage.tsx       # Авторизация
│   ├── RegisterPage.tsx    # Регистрация
│   ├── ProfilePage.tsx     # Профиль пользователя
│   └── OrderHistoryPage.tsx # История заказов
│
├── hooks/                  # React Query хуки
│   ├── useProducts.ts      # useProducts, useProduct, useCategories, useSearch
│   ├── useRecommendations.ts # useRecommendations, useFeedback
│   ├── useScenarios.ts     # useScenarios, useScenarioRecommendations
│   └── useOrders.ts        # useOrders, useCreateOrder
│
├── store/                  # Zustand stores
│   ├── cartStore.ts        # Состояние корзины
│   └── authStore.ts        # Состояние авторизации
│
├── types/                  # TypeScript типы
│   └── index.ts            # Product, CartItem, Recommendation, Scenario...
│
├── lib/
│   └── utils.ts            # Утилиты (cn, capitalize, formatPrice)
│
├── App.tsx                 # Роутинг
└── main.tsx                # Entry point
```

## Архитектурные решения

### Server State vs Client State

**Проблема:** Как разделить данные с сервера (товары, рекомендации) и локальные данные (корзина, UI)?

**Решение:** Два инструмента для разных задач:

| Тип данных | Инструмент | Примеры |
|------------|------------|---------|
| Server state | TanStack Query | Товары, категории, рекомендации, заказы |
| Client state | Zustand | Корзина, авторизация, UI-состояние |

### TanStack Query — кэширование и дедупликация

```typescript
// hooks/useProducts.ts
export function useProduct(id: number) {
  return useQuery({
    queryKey: ['product', id],
    queryFn: () => getProduct(id),
    staleTime: 5 * 60 * 1000,  // 5 минут — данные считаются свежими
  })
}

// При переходе на страницу товара:
// 1. Если данные в кэше и свежие — показываем сразу (0ms)
// 2. Если устарели — показываем кэш + запрашиваем новые в фоне
// 3. Если нет — показываем loading
```

**placeholderData для плавного UX:**

```typescript
// hooks/useScenarios.ts
export function useScenarioRecommendations(scenarioId: string, cartIds: number[]) {
  return useQuery({
    queryKey: ['scenarioRecommendations', scenarioId, cartIds],
    queryFn: () => getScenarioRecommendations(scenarioId, cartIds),
    placeholderData: (prev) => prev,  // Показываем старые данные пока грузятся новые
  })
}
```

Без `placeholderData`: добавил товар → экран моргнул (loading) → новые данные
С `placeholderData`: добавил товар → старые данные на месте → плавно обновились

### Zustand — глобальное состояние корзины

```typescript
// store/cartStore.ts
export const useCartStore = create<CartState>()((set, get) => ({
  items: [],
  loadingProductId: null,

  addItem: async (productId, quantity = 1) => {
    set({ loadingProductId: productId })  // Показываем спиннер на кнопке
    try {
      await cartApi.addToCart(productId, quantity)
      await get().fetchCart()  // Обновляем корзину с сервера
    } finally {
      set({ loadingProductId: null })
    }
  },

  isProductLoading: (productId) => get().loadingProductId === productId,
}))
```

**Почему Zustand, а не Redux:**
- Нет boilerplate (actions, reducers, selectors)
- Встроенная поддержка async
- 1.5 KB vs 7+ KB
- Можно использовать вне React-компонентов

### API Client с Interceptors

```typescript
// api/client.ts
const client = axios.create({
  baseURL: '/api',
  withCredentials: true,  // Для httpOnly cookies
})

// Автоматически добавляем token
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Автоматически обновляем token при 401
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Пробуем refresh token
      await refreshToken()
      return client(error.config)
    }
    throw error
  }
)
```

## Страницы

### HomePage — Главная

- Каталог товаров с фильтрами (категории, цена, наличие)
- Поиск с морфологией через Elasticsearch
- Карусель сценариев ремонта с прогрессом
- Бесконечный скролл товаров

### ProductPage — Карточка товара

- Детальная информация о товаре
- Галерея изображений
- Характеристики (params JSONB)
- **Рекомендации:** блок "С этим товаром покупают"
- Кнопки фидбека (👍/👎) для улучшения ML

### CartPage — Корзина

- Список товаров с изменением количества
- Итоговая сумма с учётом скидок
- Оформление заказа
- Рекомендации на основе корзины

### ScenariosPage — Сценарии ремонта

- Три сценария: наливной пол, перегородки, выравнивание стен
- Прогресс-бар заполнения для каждого
- Переход к детальному просмотру

### ScenarioDetailPage — Детали сценария

- Группы товаров (смеси, грунтовки, инструменты)
- Прогресс: какие группы уже в корзине
- Рекомендации недостающих товаров
- Быстрое добавление в корзину

## Типы данных

```typescript
// Товар
interface Product {
  id: number
  name: string
  price: number
  discount_price?: number
  picture?: string
  vendor?: string
  description?: string
  params?: Record<string, string>
  available: boolean
}

// Рекомендация
interface Recommendation {
  product: Product
  score: number
  reason: string
  match_reasons?: MatchReason[]
}

// Сценарий
interface Scenario {
  id: string
  name: string
  description: string
  groups_count: number
  required_groups: number
}

// Рекомендации по сценарию
interface ScenarioRecommendationsResponse {
  scenario: { id: string; name: string }
  progress: { completed: number; total: number; percentage: number }
  recommendations: GroupRecommendation[]
  completed_groups: CompletedGroup[]
}
```

## Запуск

### Development

```bash
npm install
npm run dev
```

Откроется http://localhost:5173

### Production build

```bash
npm run build
npm run preview
```

### Docker

```bash
# Из корня проекта
docker-compose up frontend
```

Откроется http://localhost:3000

## Переменные окружения

В production сборке API проксируется через nginx:

```nginx
location /api/ {
    proxy_pass http://backend:8080/api/;
}

location /recommendations/ {
    proxy_pass http://recommendations:8000/;
}
```

В development Vite проксирует запросы (настроено в `vite.config.ts`).

## Скрипты

| Команда | Описание |
|---------|----------|
| `npm run dev` | Запуск dev-сервера с HMR |
| `npm run build` | Production сборка |
| `npm run preview` | Превью production сборки |
| `npm run lint` | ESLint проверка |

## Скриншоты

### Главная страница

Каталог товаров с фильтрами по категориям, цене и производителю. Карусель сценариев ремонта с рекомендациями товаров для завершения выбранного сценария.

![Главная страница](../img/frontend/home.png)

### Карточка товара

Детальная информация о товаре: изображение, описание, характеристики, цена. Кнопка добавления в корзину с выбором количества.

![Карточка товара](../img/frontend/product.png)

### Рекомендации на странице товара

Блок "Сопутствующие товары" с ML-рекомендациями. Показывается схожесть с основным товаром и кнопки фидбека для улучшения качества рекомендаций.

![Рекомендации](../img/frontend/recommendations.png)

### Сценарии ремонта

Список доступных сценариев ремонта White Box: наливной пол, перегородки, выравнивание стен. Инструкция "Как это работает" для пользователей.

![Сценарии ремонта](../img/frontend/scenarios.png)

### Детали сценария

Страница конкретного сценария с группами товаров. Прогресс-бар показывает сколько групп уже собрано. Товары разделены на обязательные и опциональные.

![Детали сценария](../img/frontend/scenario-detail.png)

### Корзина

Список товаров в корзине с возможностью изменения количества. Итоговая сумма и кнопка оформления заказа.

![Корзина](../img/frontend/cart.png)
