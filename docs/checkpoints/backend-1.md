# Backend Checkpoint 1

**Дата:** 01.12.2025

## Что сделано

### Инфраструктура
- [x] Docker-compose с PostgreSQL и Redis
- [x] Dockerfile с multi-stage build
- [x] Nginx конфигурация для проксирования API
- [x] Миграции базы данных (golang-migrate)

### База данных (PostgreSQL)
- [x] Таблица `categories` — иерархические категории
- [x] Таблица `products` — товары с JSONB параметрами
- [x] Таблица `promos` — скидки/акции
- [x] Таблица `users` — пользователи
- [x] Таблица `cart_items` — корзина (user_id или session_id)
- [x] Таблица `orders` + `order_items` — заказы
- [x] Таблица `product_views` — просмотры для ML

### Модели (internal/model)
- [x] Category, CategoryWithChildren
- [x] Product
- [x] Promo
- [x] User
- [x] CartItem
- [x] Order, OrderItem

### Repository слой (internal/repository)
- [x] CategoryRepository — GetAll, GetByID, GetChildren, GetTree
- [x] ProductRepository — GetAll, GetByID, GetByCategory (с подкатегориями)
- [x] UserRepository — Create, GetByID, GetByEmail, ExistsByEmail
- [x] PromoRepository — GetActiveByProductID

### Service слой (internal/service)
- [x] AuthService — Register, Login, ValidateToken, GetUserByID
- [x] JWT токены с HS256 (24h TTL)
- [x] bcrypt хэширование паролей

### Handlers (internal/handler)
- [x] AuthHandler — Register, Login, Profile
- [x] CategoryHandler — GetCategories, GetCategoryTree, GetCategory, GetCategoryChildren
- [x] ProductHandler — GetProducts, GetProduct
- [x] CartHandler — заглушки (GetCart, AddToCart, UpdateCartItem, DeleteCartItem)
- [x] OrderHandler — заглушки (GetOrders, CreateOrder)
- [x] RecommendationHandler — заглушки

### Middleware
- [x] Auth middleware — проверка JWT токена
- [x] Logger middleware — логирование запросов (slog)
- [x] Recovery middleware (gin)

### API эндпоинты

#### Публичные
| Method | Endpoint | Описание |
|--------|----------|----------|
| GET | /health | Health check |
| GET | /api/products | Список товаров |
| GET | /api/products/:id | Товар по ID |
| GET | /api/categories | Список категорий |
| GET | /api/categories/tree | Дерево категорий |
| GET | /api/categories/:id | Категория по ID |
| GET | /api/categories/:id/children | Дочерние категории |
| POST | /api/auth/register | Регистрация |
| POST | /api/auth/login | Вход |
| GET | /api/recommendations/:product_id | Рекомендации |

#### Защищённые (требуют JWT)
| Method | Endpoint | Описание |
|--------|----------|----------|
| GET | /api/auth/profile | Профиль пользователя |
| GET | /api/cart | Корзина |
| POST | /api/cart/items | Добавить в корзину |
| PUT | /api/cart/items/:id | Обновить количество |
| DELETE | /api/cart/items/:id | Удалить из корзины |
| GET | /api/orders | Список заказов |
| POST | /api/orders | Создать заказ |
| POST | /api/recommendations/feedback | Фидбек на рекомендации |

## Структура проекта

```
backend/
├── cmd/server/main.go           # Entry point
├── internal/
│   ├── config/config.go         # Конфигурация из ENV
│   ├── database/postgres.go     # Подключение к PostgreSQL
│   ├── model/                   # Модели данных
│   │   ├── category.go
│   │   ├── product.go
│   │   ├── promo.go
│   │   ├── user.go
│   │   ├── cart.go
│   │   └── order.go
│   ├── dto/                     # Data Transfer Objects
│   │   ├── category.go
│   │   ├── product.go
│   │   ├── user.go
│   │   ├── cart.go
│   │   ├── order.go
│   │   └── promo.go
│   ├── repository/              # Работа с БД
│   │   ├── category.go
│   │   ├── product.go
│   │   ├── user.go
│   │   └── promo.go
│   ├── service/                 # Бизнес-логика
│   │   └── auth.go
│   ├── handler/                 # HTTP handlers
│   │   ├── router.go
│   │   ├── auth.go
│   │   ├── category.go
│   │   ├── product.go
│   │   ├── cart.go
│   │   ├── order.go
│   │   └── recommendation.go
│   └── middleware/              # Middleware
│       └── auth.go
├── migrations/
│   └── 000001_init.up.sql
├── Dockerfile
└── go.mod
```

## Конфигурация (ENV)

```env
DATABASE_URL=postgres://user:pass@localhost:5432/dbname?sslmode=disable
JWT_SECRET=your-secret-key
PORT=8080
```

## Что осталось

---

### 1. Импорт данных из CSV/YML
**Статус:** не начато

- [ ] Парсер для загрузки категорий из датасета
- [ ] Парсер для загрузки товаров (с JSONB параметрами)
- [ ] Парсер для загрузки скидок/акций
- [ ] CLI команда `go run cmd/import/main.go` или эндпоинт для админа

---

### 2. Redis — кэширование и сессии
**Статус:** не начато

**Подключение:**
- [ ] `internal/cache/client.go` — Redis клиент (go-redis/redis)

**Кэш категорий:**
- [ ] `internal/cache/category.go` — кэш дерева категорий (TTL ~1 час)
- [ ] Инвалидация при изменении категорий

**Корзина гостя:**
- [ ] `internal/cache/cart.go` — хранение корзины по session_id до авторизации
- [ ] Мердж корзины гостя с корзиной пользователя при логине

**Rate limiting (опционально):**
- [ ] `internal/middleware/ratelimit.go` — защита от спама

---

### 3. Корзина — реальная логика
**Статус:** заглушки есть

**Repository:**
- [ ] `internal/repository/cart.go` — CRUD операции с cart_items

**Service:**
- [ ] `internal/service/cart.go`:
  - GetCart(userID/sessionID) — получить корзину с товарами
  - AddItem(productID, quantity) — добавить товар
  - UpdateQuantity(itemID, quantity) — изменить количество
  - RemoveItem(itemID) — удалить
  - ClearCart() — очистить
  - MergeGuestCart(sessionID, userID) — при логине

**Handler:**
- [ ] Обновить `internal/handler/cart.go` — заменить заглушки на реальные вызовы

---

### 4. Заказы — реальная логика
**Статус:** заглушки есть

**Repository:**
- [ ] `internal/repository/order.go` — создание заказа, получение списка

**Service:**
- [ ] `internal/service/order.go`:
  - CreateOrder(userID, address) — создать заказ из корзины
  - GetOrders(userID) — список заказов пользователя
  - GetOrderByID(orderID) — детали заказа

**Handler:**
- [ ] Обновить `internal/handler/order.go`

---

### 5. Elasticsearch — полнотекстовый поиск
**Статус:** не начато

**Подключение:**
- [ ] `internal/search/client.go` — ES клиент
- [ ] Docker-compose: добавить Elasticsearch

**Индексация товаров:**
- [ ] `internal/search/product.go`:
  - IndexProduct(product) — индексировать товар
  - IndexAll() — массовая индексация
  - Search(query, filters) — поиск с автодополнением

**Поиск категорий:**
- [ ] `internal/search/category.go` — поиск по названию категории

**Эндпоинты:**
- [ ] `GET /api/products/search?q=штукатурка&category_id=5&min_price=100`
- [ ] `GET /api/categories/search?q=инструмент`

---

### 6. Рекомендации — интеграция с ML сервисом
**Статус:** заглушки есть

**HTTP клиент к Python ML сервису:**
- [ ] `internal/client/ml.go`:
  - GetRecommendations(productID, userID) → []Recommendation

**Service:**
- [ ] `internal/service/recommendation.go`:
  - GetRecommendations(productID, userID) — вызов ML + обогащение данными из БД
  - SaveFeedback(userID, mainProductID, recProductID, feedback)

**Handler:**
- [ ] Обновить `internal/handler/recommendation.go`

**Таблицы (добавить миграцию):**
- [ ] `recommendation_feedback` — сырые оценки
- [ ] `product_feedback_stats` — агрегированная статистика

---

### 7. Скидки/Акции — эндпоинты
**Статус:** репозиторий есть, эндпоинтов нет

**Handler:**
- [ ] `internal/handler/promo.go`:
  - `GET /api/promos` — активные акции
  - `GET /api/promos/products` — товары со скидками
  - `GET /api/products/:id/promo` — скидка на конкретный товар

---

### 8. Просмотры товаров (для ML)
**Статус:** таблица есть, логика не реализована

**Repository:**
- [ ] `internal/repository/product_view.go` — сохранение просмотров

**Middleware или Handler:**
- [ ] При запросе `GET /api/products/:id` сохранять просмотр (user_id или session_id)

---

### 9. Валидация входных данных
**Статус:** частично (gin binding)

- [ ] Добавить go-playground/validator
- [ ] Валидация email, пароля, количества в корзине и т.д.
- [ ] Красивые ошибки валидации

---

### 10. Swagger документация (опционально)
**Статус:** не начато

- [ ] Установить swaggo/swag
- [ ] Добавить комментарии к хендлерам
- [ ] `swag init` → генерация docs/
- [ ] Эндпоинт `/swagger/*`

---

## Приоритеты

| Приоритет | Задача | Оценка |
|-----------|--------|--------|
| 🔴 Высокий | Импорт данных из CSV | 2-3 часа |
| 🔴 Высокий | Redis кэш категорий | 1-2 часа |
| 🔴 Высокий | Корзина (реальная логика) | 2-3 часа |
| 🔴 Высокий | Заказы (реальная логика) | 2 часа |
| 🟡 Средний | Интеграция с ML сервисом | 2-3 часа |
| 🟡 Средний | Elasticsearch поиск | 3-4 часа |
| 🟡 Средний | Эндпоинты скидок | 1 час |
| 🟢 Низкий | Просмотры товаров | 1 час |
| 🟢 Низкий | Swagger | 1-2 часа |
| 🟢 Низкий | Валидация | 1 час |

## Запуск

### Docker
```bash
docker-compose up --build
# API: http://localhost:8080
```

### Локально
```bash
# Запустить PostgreSQL и Redis
docker-compose up -d postgres redis

# Запустить сервер
cd backend
go run cmd/server/main.go
```

## Тестовые запросы

```bash
# Регистрация
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456","name":"Test"}'

# Логин
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"123456"}'

# Профиль (с токеном)
curl http://localhost:8080/api/auth/profile \
  -H "Authorization: Bearer <token>"

# Категории
curl http://localhost:8080/api/categories/tree

# Товары
curl http://localhost:8080/api/products
```
