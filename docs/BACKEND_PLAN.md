# Backend Plan

## Стек технологий

- **Gin** - HTTP роутер
- **Squirrel** - SQL query builder
- **PostgreSQL** - основная БД
- **Elasticsearch** - полнотекстовый поиск товаров и категорий
- **Redis** - кэш и сессии

### Дополнительные библиотеки

- **golang-migrate** - миграции БД
- **go-playground/validator** - валидация входных данных
- **uber-go/zap** - логирование
- **swaggo/swag** - Swagger документация
- **golang-jwt/jwt** - JWT токены

## Где использовать Redis

1. **Кэш категорий** - дерево категорий меняется редко, грузить из БД каждый раз дорого
2. **Кэш популярных товаров** - главная страница, топ продаж
3. **Сессии пользователей** - JWT refresh tokens или session storage
4. **Rate limiting** - защита API от спама
5. **Корзина гостя** - до авторизации хранить корзину в Redis по session_id

## Структура проекта

```
backend/
├── cmd/
│   └── server/
│       └── main.go
│
├── internal/
│   ├── config/           # Конфигурация (env, yaml)
│   ├── handler/          # HTTP handlers (Gin)
│   │   ├── product.go
│   │   ├── category.go
│   │   ├── cart.go
│   │   ├── order.go
│   │   ├── auth.go
│   │   └── recommendation.go
│   │
│   ├── service/          # Бизнес-логика
│   │   ├── product.go
│   │   ├── category.go
│   │   ├── cart.go
│   │   ├── order.go
│   │   ├── auth.go
│   │   └── recommendation.go
│   │
│   ├── repository/       # Работа с БД (Squirrel)
│   │   ├── product.go
│   │   ├── category.go
│   │   ├── cart.go
│   │   ├── order.go
│   │   └── user.go
│   │
│   ├── search/           # Elasticsearch
│   │   ├── client.go
│   │   ├── product.go    # Индексация и поиск товаров
│   │   └── category.go
│   │
│   ├── cache/            # Redis
│   │   ├── client.go
│   │   ├── category.go   # Кэш дерева категорий
│   │   └── session.go
│   │
│   ├── model/            # Структуры данных
│   │   ├── product.go
│   │   ├── category.go
│   │   ├── user.go
│   │   ├── order.go
│   │   └── cart.go
│   │
│   └── middleware/       # Gin middleware
│       ├── auth.go       # JWT проверка
│       ├── cors.go
│       └── ratelimit.go
│
├── migrations/           # SQL миграции
├── docker-compose.yml    # Postgres, Redis, Elasticsearch
└── Makefile
```

## Схема БД (PostgreSQL)

```sql
-- Пользователи
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Категории (дерево)
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    parent_id INTEGER REFERENCES categories(id),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    level INTEGER DEFAULT 0,
    path TEXT  -- materialized path: "1/5/23"
);

-- Товары
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    brand VARCHAR(255),
    image_url TEXT,
    params JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Корзина
CREATE TABLE cart_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    session_id VARCHAR(255),  -- для гостей
    product_id INTEGER REFERENCES products(id) NOT NULL,
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT cart_user_or_session CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

-- Заказы
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) NOT NULL,
    product_id INTEGER REFERENCES products(id) NOT NULL,
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL
);

-- Рекомендации / фидбек
CREATE TABLE recommendation_feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    main_product_id INTEGER REFERENCES products(id) NOT NULL,
    recommended_product_id INTEGER REFERENCES products(id) NOT NULL,
    feedback VARCHAR(20) NOT NULL,  -- 'positive' | 'negative'
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE product_feedback_stats (
    product_id INTEGER REFERENCES products(id) NOT NULL,
    recommended_product_id INTEGER REFERENCES products(id) NOT NULL,
    positive_count INTEGER DEFAULT 0,
    negative_count INTEGER DEFAULT 0,
    score DECIMAL(5,4) DEFAULT 0,
    PRIMARY KEY (product_id, recommended_product_id)
);

-- Индексы
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_price ON products(price);
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_cart_user ON cart_items(user_id);
CREATE INDEX idx_cart_session ON cart_items(session_id);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_feedback_stats_product ON product_feedback_stats(product_id);

-- Скидки/акции
CREATE TABLE promos (
    id SERIAL PRIMARY KEY,
    promo_id INTEGER NOT NULL,
    product_id INTEGER REFERENCES products(id) NOT NULL,
    promo_type VARCHAR(100),          -- 'bonus card', 'sale', etc.
    discount_price DECIMAL(10,2),     -- цена со скидкой
    start_date DATE,
    end_date DATE,
    description VARCHAR(500),
    url VARCHAR(500)
);

CREATE INDEX idx_promos_product ON promos(product_id);
CREATE INDEX idx_promos_dates ON promos(start_date, end_date);
```

## API эндпоинты

### Товары
```
GET  /api/products              # Список с фильтрами (category_id, min_price, max_price, page)
GET  /api/products/:id          # Один товар
GET  /api/products/search       # Elasticsearch поиск
```

### Категории
```
GET  /api/categories            # Плоский список
GET  /api/categories/tree       # Дерево (из Redis кэша)
GET  /api/categories/:id/children
GET  /api/categories/search     # Поиск по названию
```

### Корзина
```
GET    /api/cart
POST   /api/cart/items
PUT    /api/cart/items/:id
DELETE /api/cart/items/:id
```

### Заказы
```
GET  /api/orders
POST /api/orders
GET  /api/orders/:id
```

### Авторизация
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
GET  /api/auth/me
```

### Рекомендации
```
GET  /api/recommendations/:product_id
POST /api/recommendations/feedback
```

### Скидки
```
GET  /api/promos                  # Активные акции
GET  /api/promos/products         # Товары со скидками
GET  /api/products/:id/promo      # Скидка на конкретный товар
```


## План реализации

### Этап 1: Базовый каркас
- [ ] Инициализация Go модуля
- [ ] Структура папок
- [ ] Конфигурация (env)
- [ ] Подключение к PostgreSQL
- [ ] Миграции
- [ ] Базовый Gin сервер

### Этап 2: CRUD
- [ ] Модели
- [ ] Репозитории (Squirrel)
- [ ] Сервисы
- [ ] Хендлеры
- [ ] Роуты

### Этап 3: Авторизация
- [ ] JWT токены
- [ ] Middleware auth
- [ ] Register/Login/Me

### Этап 4: Redis
- [ ] Подключение
- [ ] Кэш категорий
- [ ] Сессии

### Этап 5: Elasticsearch
- [ ] Подключение
- [ ] Индексация товаров
- [ ] Поиск с автодополнением

### Этап 6: Рекомендации
- [ ] Эндпоинт рекомендаций
- [ ] Сбор фидбека
- [ ] Обновление статистики
