# Backend Service (Go/Gin)

Go-сервис для интернет-магазина строительных материалов. REST API для каталога, корзины, заказов, авторизации. Прокси к ML-сервису рекомендаций.

## Технологии

| Компонент | Технология | Версия |
|-----------|------------|--------|
| Language | Go | 1.23 |
| Web Framework | Gin | 1.10 |
| Database | PostgreSQL | 16 |
| Search | Elasticsearch | 8.11 |
| Cache | Redis | 7 |
| Auth | JWT + bcrypt | - |

## Структура проекта

```
backend/
├── cmd/server/main.go       # Точка входа, инициализация всех компонентов
├── internal/
│   ├── config/              # Конфигурация из env
│   ├── database/            # PostgreSQL подключение, миграции
│   ├── cache/               # Redis: сессии, корзина гостей
│   ├── search/              # Elasticsearch: индексация, поиск, outbox worker
│   ├── handler/             # HTTP handlers (Gin)
│   ├── service/             # Бизнес-логика
│   ├── repository/          # Data Access Layer (Squirrel)
│   ├── middleware/          # JWT auth, CORS, session
│   ├── model/               # Domain models
│   └── dto/                 # Request/Response objects
├── migrations/              # SQL миграции (golang-migrate)
├── Dockerfile
└── go.mod
```

## Архитектура

### Clean Architecture

```
HTTP Request
     ↓
  Handler (валидация, HTTP)
     ↓
  Service (бизнес-логика)
     ↓
  Repository (SQL через Squirrel)
     ↓
  PostgreSQL / Redis / Elasticsearch
```

### Внедрение зависимостей

Все зависимости инжектятся в `main.go`:

```go
// cmd/server/main.go
func main() {
    cfg := config.Load()

    // Инфраструктура
    db := database.Connect(cfg.Postgres)
    redis := cache.NewClient(cfg.Redis)
    es := search.NewClient(cfg.Elastic)

    // Repositories
    productRepo := repository.NewProductRepository(db)
    cartRepo := repository.NewCartRepository(db)
    userRepo := repository.NewUserRepository(db)

    // Services
    authService := service.NewAuthService(userRepo, cfg.JWT)
    cartService := service.NewCartService(cartRepo, redis)

    // Handlers
    productHandler := handler.NewProductHandler(productRepo)
    cartHandler := handler.NewCartHandler(cartService)
    authHandler := handler.NewAuthHandler(authService)

    // Router
    router := handler.NewRouter(productHandler, cartHandler, authHandler, ...)
    router.Run(":8080")
}
```

## API Endpoints

### Каталог товаров

```
GET  /api/products
     ?category_id=123        # Фильтр по категории
     &min_price=100          # Минимальная цена
     &max_price=5000         # Максимальная цена
     &vendor=KNAUF           # Производитель
     &available=true         # Только в наличии
     &limit=20&offset=0      # Пагинация

GET  /api/products/:id       # Детали товара с характеристиками
POST /api/products/:id/view  # Трекинг просмотра (для статистики)
```

### Категории

```
GET  /api/categories         # Плоский список всех категорий
GET  /api/categories/tree    # Иерархическое дерево
```

### Поиск (Elasticsearch)

```
GET  /api/search
     ?q=штукатурка           # Поисковый запрос
     &category_ids=123,456   # Фильтр по категориям
     &vendors=KNAUF,CERESIT  # Фильтр по производителям
     &min_price=100          # Ценовой диапазон
     &max_price=5000
     &available=true
     &limit=20&offset=0

Response:
{
  "products": [...],
  "total": 150,
  "aggregations": {
    "categories": [{"id": 123, "name": "Штукатурка", "count": 45}],
    "vendors": [{"name": "KNAUF", "count": 30}],
    "price_range": {"min": 150, "max": 4500}
  }
}
```

### Авторизация

```
POST /api/auth/register
     Body: {"name": "...", "email": "...", "password": "..."}

POST /api/auth/login
     Body: {"email": "...", "password": "..."}
     Response: {"token": "jwt...", "user": {...}}

POST /api/auth/refresh        # Обновление токена
POST /api/auth/logout         # Инвалидация токена (blacklist)
GET  /api/auth/profile        # Профиль текущего пользователя
```

### Корзина

```
GET    /api/cart              # Получить корзину (по session или user)
POST   /api/cart/items        # Добавить товар
       Body: {"product_id": 123, "quantity": 2}
PUT    /api/cart/items/:id    # Обновить количество
       Body: {"quantity": 5}
DELETE /api/cart/items/:id    # Удалить товар
DELETE /api/cart              # Очистить корзину
```

### Заказы

```
POST /api/orders              # Создать заказ из корзины
     Body: {"address": "...", "phone": "..."}
GET  /api/orders              # Список заказов пользователя
GET  /api/orders/:id          # Детали заказа с товарами
```

### Рекомендации (прокси к ML-сервису)

```
GET  /api/recommendations/:product_id
GET  /api/scenarios
GET  /api/scenarios/:id
GET  /api/scenarios/:id/recommendations?cart_product_ids=1,2,3
GET  /api/recommendations/scenario/auto?cart_product_ids=1,2,3
POST /api/feedback
POST /api/events
```

## Детали реализации

### Сессии и корзина гостей

```go
// middleware/session.go
func SessionMiddleware(redis *cache.Client) gin.HandlerFunc {
    return func(c *gin.Context) {
        sessionID := c.GetHeader("X-Session-ID")
        if sessionID == "" {
            sessionID = uuid.New().String()
            c.Header("X-Session-ID", sessionID)
        }
        c.Set("session_id", sessionID)
        c.Next()
    }
}

// cache/cart.go
func (c *CartCache) GetGuestCart(sessionID string) (*Cart, error) {
    key := fmt.Sprintf("cart:guest:%s", sessionID)
    return c.redis.Get(ctx, key).Result()  // TTL: 7 дней
}
```

### Merge корзины при авторизации

```go
// service/cart.go
func (s *CartService) MergeGuestCart(userID int, sessionID string) error {
    guestCart, _ := s.cache.GetGuestCart(sessionID)
    if guestCart == nil {
        return nil
    }

    for _, item := range guestCart.Items {
        // Добавляем или увеличиваем количество
        s.repo.UpsertCartItem(userID, item.ProductID, item.Quantity)
    }

    s.cache.DeleteGuestCart(sessionID)
    return nil
}
```

### JWT с blacklist

```go
// service/auth.go
func (s *AuthService) Logout(token string) error {
    claims, _ := s.parseToken(token)
    ttl := time.Until(claims.ExpiresAt.Time)

    // Добавляем в blacklist до истечения TTL
    return s.redis.Set(ctx, "blacklist:"+token, "1", ttl).Err()
}

func (s *AuthService) IsTokenBlacklisted(token string) bool {
    _, err := s.redis.Get(ctx, "blacklist:"+token).Result()
    return err == nil
}
```

### Elasticsearch Outbox Worker

```go
// search/worker.go
func (w *Worker) Run(ctx context.Context) {
    ticker := time.NewTicker(100 * time.Millisecond)
    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            w.processOutbox()
        }
    }
}

func (w *Worker) processOutbox() {
    events, _ := w.repo.GetUnprocessedEvents(100)
    for _, event := range events {
        switch event.Operation {
        case "index":
            w.es.Index("products", event.EntityID, event.Payload)
        case "delete":
            w.es.Delete("products", event.EntityID)
        }
        w.repo.MarkProcessed(event.ID)
    }
}
```

### Repository с Squirrel

```go
// repository/product.go
func (r *ProductRepository) List(filter ProductFilter) ([]Product, error) {
    query := sq.Select("*").From("products").Where("1=1")

    if filter.CategoryID != nil {
        query = query.Where(sq.Eq{"category_id": *filter.CategoryID})
    }
    if filter.MinPrice != nil {
        query = query.Where(sq.GtOrEq{"price": *filter.MinPrice})
    }
    if filter.Available != nil {
        query = query.Where(sq.Eq{"available": *filter.Available})
    }

    query = query.Limit(uint64(filter.Limit)).Offset(uint64(filter.Offset))

    sql, args, _ := query.PlaceholderFormat(sq.Dollar).ToSql()
    return r.db.Query(ctx, sql, args...)
}
```

## Конфигурация

```env
# Server
HTTP_PORT=8080

# ML Service
RECOMMENDATIONS_URL=http://recommendations:8000

# PostgreSQL
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=spbtechrun

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Elasticsearch
ELASTIC_URL=http://elasticsearch:9200

# JWT
JWT_SECRET=your-secret-key
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=168h
```

## Миграции

Автоматически применяются при старте через `golang-migrate`:

```sql
-- 001_init.up.sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cart_items (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    session_id VARCHAR(255),
    product_id INT NOT NULL,
    quantity INT DEFAULT 1,
    added_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT user_or_session CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE TABLE search_outbox (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT NOT NULL,
    operation VARCHAR(20) NOT NULL,
    payload JSONB,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Запуск

### Docker Compose

```bash
docker compose up -d backend
```

### Локально

```bash
go mod download
go run cmd/server/main.go
```

## Health Check

```
GET /health

{
  "status": "ok",
  "services": {
    "postgres": "ok",
    "redis": "ok",
    "elasticsearch": "ok"
  }
}
```

## Зависимости

| Пакет | Назначение |
|-------|------------|
| `github.com/gin-gonic/gin` | Web framework |
| `github.com/jackc/pgx/v5` | PostgreSQL driver с пулингом |
| `github.com/redis/go-redis/v9` | Redis client |
| `github.com/elastic/go-elasticsearch/v8` | Elasticsearch client |
| `github.com/golang-jwt/jwt/v5` | JWT токены |
| `github.com/Masterminds/squirrel` | SQL query builder |
| `github.com/golang-migrate/migrate/v4` | Миграции БД |
| `golang.org/x/crypto` | bcrypt для паролей |
