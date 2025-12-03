# Backend Service

Go-сервис для интернет-магазина строительных материалов. Обеспечивает API для каталога товаров, корзины, заказов, авторизации и интеграцию с ML-сервисом рекомендаций.

## Технологии

| Компонент | Технология |
|-----------|------------|
| Language | Go 1.25 |
| Web Framework | Gin |
| Database | PostgreSQL |
| Search | Elasticsearch |
| Cache | Redis |
| Auth | JWT + bcrypt |

## Структура проекта

```
backend/
├── cmd/server/          # Точка входа
├── internal/
│   ├── cache/           # Redis клиент и кеширование корзины
│   ├── config/          # Конфигурация (env-based)
│   ├── database/        # PostgreSQL подключение и миграции
│   ├── dto/             # Data Transfer Objects
│   ├── handler/         # HTTP handlers
│   ├── middleware/      # JWT auth, CORS, logging
│   ├── model/           # Domain models
│   ├── repository/      # Data access layer
│   ├── search/          # Elasticsearch integration
│   └── service/         # Business logic
├── migrations/          # SQL миграции
├── Dockerfile
└── go.mod
```

## API Endpoints

### Каталог

```
GET  /api/products           # Список товаров с фильтрацией
GET  /api/products/:id       # Детали товара
GET  /api/categories         # Список категорий
GET  /api/search             # Полнотекстовый поиск (Elasticsearch)
```

### Авторизация

```
POST /api/auth/register      # Регистрация
POST /api/auth/login         # Вход (возвращает JWT)
GET  /api/auth/profile       # Профиль пользователя
```

### Корзина

```
GET    /api/cart             # Получить корзину
POST   /api/cart/items       # Добавить товар
PUT    /api/cart/items/:id   # Обновить количество
DELETE /api/cart/items/:id   # Удалить товар
DELETE /api/cart             # Очистить корзину
```

### Заказы

```
GET  /api/orders             # Список заказов
GET  /api/orders/:id         # Детали заказа
POST /api/orders             # Создать заказ
```

### Рекомендации (proxy к ML-сервису)

```
GET  /api/recommendations/:id              # Рекомендации для товара
GET  /api/scenarios                        # Список сценариев
GET  /api/scenarios/:id/recommendations    # Рекомендации сценария
POST /api/feedback                         # Отправка фидбека
POST /api/events                           # Логирование событий
```

## Архитектура

### Clean Architecture

```
HTTP Request → Handler → Service → Repository → Database
                 ↓
              Middleware (Auth, CORS, Logging)
```

### Слои

- **Handler** — обработка HTTP запросов, валидация, формирование ответов
- **Service** — бизнес-логика (авторизация, корзина, заказы)
- **Repository** — работа с БД через Squirrel query builder

### Event Sourcing (Outbox Pattern)

Синхронизация с Elasticsearch через таблицу `outbox_events`:

1. При изменении товара создаётся событие в outbox
2. Background worker читает события каждые 2 секунды
3. Индексирует/удаляет документы в Elasticsearch
4. Помечает события как обработанные

## Конфигурация

Переменные окружения:

```env
HTTP_PORT=8080
RECOMMENDATIONS_URL=http://recommendations:8000

POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=spbtechrun

REDIS_HOST=redis
REDIS_PORT=6379

ELASTIC_URL=http://elasticsearch:9200

JWT_SECRET=your-secret-key
```

## Запуск

### Docker Compose (рекомендуется)

```bash
docker compose up -d backend
```

### Локально

```bash
# Установить зависимости
go mod download

# Запустить
go run cmd/server/main.go
```

## База данных

### Миграции

Применяются автоматически при старте. Основные таблицы:

- `users` — пользователи
- `categories` — категории товаров
- `products` — товары
- `cart_items` — корзина
- `orders`, `order_items` — заказы
- `outbox_events` — события для Elasticsearch

### Подключение

Используется `jackc/pgx/v5` с connection pooling.

## Зависимости

```
github.com/gin-gonic/gin           # Web framework
github.com/jackc/pgx/v5            # PostgreSQL driver
github.com/redis/go-redis/v9       # Redis client
github.com/elastic/go-elasticsearch/v8  # Elasticsearch
github.com/golang-jwt/jwt/v5       # JWT tokens
github.com/Masterminds/squirrel    # SQL query builder
github.com/golang-migrate/migrate/v4   # DB migrations
golang.org/x/crypto                # bcrypt
```

## Health Check

```
GET /health
```

Возвращает статус всех зависимостей:

```json
{
  "status": "ok",
  "services": {
    "postgres": "ok",
    "redis": "ok",
    "elasticsearch": "ok"
  }
}
```
