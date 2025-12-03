# TDR-001: Реализация системы скидок

## Metadata

| Поле | Значение |
|------|----------|
| **Статус** | Draft |
| **Автор** | - |
| **Дата** | 2025-12-03 |
| **Приоритет** | Medium |
| **Оценка** | 3-4 часа |

---

## 1. Контекст и проблема

### Текущее состояние

В системе есть таблица `promos` с информацией о скидках на товары:

```sql
CREATE TABLE promos (
    id SERIAL PRIMARY KEY,
    promo_id INT NOT NULL,
    product_id INT REFERENCES products(id),
    promo_type VARCHAR(100),
    discount_price DECIMAL(10,2),
    start_date DATE,
    end_date DATE,
    description VARCHAR(500),
    url VARCHAR(500)
);
```

**Backend:**
- Модель `Promo` и DTO `PromoCache` существуют
- `ProductResponse` имеет поля `DiscountPrice` и `DiscountEnds`
- Репозиторий `PromoRepository` с методами `GetActivePromos()`, `GetByProductID()`

**Frontend:**
- Типы `Product` содержат `discount_price?: number` и `discount_ends?: string`
- UI компоненты (`ProductCard`, `ProductPage`) отображают скидки

### Проблема

Скидки не доставляются на фронтенд:
1. Нет механизма загрузки скидок из БД в Redis
2. `ProductHandler` не обогащает ответы данными о скидках
3. Elasticsearch не индексирует скидки — нельзя фильтровать/сортировать

---

## 2. Цели

1. Активные скидки загружаются в Redis при старте сервера
2. API `/products` и `/products/:id` возвращают `discount_price` и `discount_ends`
3. Поиск через Elasticsearch возвращает товары со скидками
4. Скидки обновляются периодически (каждые 5 минут)
5. ML-сервис получает информацию о скидках для буста рекомендаций

---

## 3. Архитектура решения

### 3.1 Поток данных

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  PostgreSQL │────▶│   Redis     │────▶│  API/Search │
│   (promos)  │     │  (cache)    │     │  Response   │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       │            ┌─────────────┐           │
       └───────────▶│Elasticsearch│◀──────────┘
                    │  (index)    │
                    └─────────────┘
```

### 3.2 Redis структура

**Ключ:** `promo:{product_id}`
**Значение:** JSON

```json
{
  "discount_price": 590.00,
  "discount_ends": "2025-12-31T23:59:59Z",
  "promo_type": "sale"
}
```

**TTL:** До конца действия скидки или 24 часа (что меньше)

### 3.3 Компоненты

| Компонент | Ответственность |
|-----------|-----------------|
| `PromoCache` | Загрузка/обновление скидок в Redis |
| `ProductRepository` | Обогащение товаров скидками из кэша |
| `SearchRepository` | Индексация скидок в Elasticsearch |
| `PromoWorker` | Периодическое обновление кэша |

---

## 4. Детальный дизайн

### 4.1 PromoCache (новый файл)

**Путь:** `backend/internal/cache/promo.go`

```go
package cache

import (
    "context"
    "encoding/json"
    "fmt"
    "time"

    "github.com/mpstrkv/spbtechrun/internal/dto"
)

type PromoCache struct {
    client *Client
}

func NewPromoCache(client *Client) *PromoCache {
    return &PromoCache{client: client}
}

// Ключ для хранения скидки товара
func (c *PromoCache) key(productID int) string {
    return fmt.Sprintf("promo:%d", productID)
}

// Set сохраняет скидку в кэш
func (c *PromoCache) Set(ctx context.Context, productID int, promo *dto.PromoCache) error {
    data, err := json.Marshal(promo)
    if err != nil {
        return err
    }

    // TTL = время до окончания скидки, но не более 24 часов
    ttl := time.Until(promo.EndDate)
    if ttl > 24*time.Hour {
        ttl = 24 * time.Hour
    }
    if ttl < 0 {
        return nil // Скидка уже истекла
    }

    return c.client.Set(ctx, c.key(productID), data, ttl)
}

// Get получает скидку из кэша
func (c *PromoCache) Get(ctx context.Context, productID int) (*dto.PromoCache, error) {
    data, err := c.client.Get(ctx, c.key(productID))
    if err != nil {
        return nil, err
    }
    if data == "" {
        return nil, nil
    }

    var promo dto.PromoCache
    if err := json.Unmarshal([]byte(data), &promo); err != nil {
        return nil, err
    }

    return &promo, nil
}

// GetMulti получает скидки для списка товаров
func (c *PromoCache) GetMulti(ctx context.Context, productIDs []int) (map[int]*dto.PromoCache, error) {
    result := make(map[int]*dto.PromoCache)

    for _, id := range productIDs {
        promo, err := c.Get(ctx, id)
        if err != nil {
            continue // Игнорируем ошибки отдельных товаров
        }
        if promo != nil {
            result[id] = promo
        }
    }

    return result, nil
}

// LoadAll загружает все активные скидки из БД в кэш
func (c *PromoCache) LoadAll(ctx context.Context, promos []dto.PromoCache, productIDs []int) error {
    for i, promo := range promos {
        if err := c.Set(ctx, productIDs[i], &promo); err != nil {
            return err
        }
    }
    return nil
}

// Delete удаляет скидку из кэша
func (c *PromoCache) Delete(ctx context.Context, productID int) error {
    return c.client.Del(ctx, c.key(productID))
}
```

### 4.2 PromoService (новый файл)

**Путь:** `backend/internal/service/promo.go`

```go
package service

import (
    "context"
    "log/slog"
    "time"

    "github.com/mpstrkv/spbtechrun/internal/cache"
    "github.com/mpstrkv/spbtechrun/internal/dto"
    "github.com/mpstrkv/spbtechrun/internal/repository"
)

type PromoService struct {
    promoRepo  *repository.PromoRepository
    promoCache *cache.PromoCache
}

func NewPromoService(promoRepo *repository.PromoRepository, promoCache *cache.PromoCache) *PromoService {
    return &PromoService{
        promoRepo:  promoRepo,
        promoCache: promoCache,
    }
}

// LoadActivePromos загружает все активные скидки в Redis
func (s *PromoService) LoadActivePromos(ctx context.Context) error {
    promos, err := s.promoRepo.GetActivePromos(ctx)
    if err != nil {
        return err
    }

    loaded := 0
    for _, promo := range promos {
        promoCache := &dto.PromoCache{
            DiscountPrice: promo.DiscountPrice,
            EndDate:       promo.EndDate,
            PromoType:     promo.PromoType,
        }

        if err := s.promoCache.Set(ctx, promo.ProductID, promoCache); err != nil {
            slog.Error("failed to cache promo",
                slog.Int("product_id", promo.ProductID),
                slog.String("error", err.Error()))
            continue
        }
        loaded++
    }

    slog.Info("promos loaded to cache", slog.Int("count", loaded))
    return nil
}

// StartRefreshWorker запускает периодическое обновление скидок
func (s *PromoService) StartRefreshWorker(ctx context.Context, interval time.Duration) {
    ticker := time.NewTicker(interval)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            slog.Info("promo refresh worker stopped")
            return
        case <-ticker.C:
            if err := s.LoadActivePromos(ctx); err != nil {
                slog.Error("failed to refresh promos", slog.String("error", err.Error()))
            }
        }
    }
}

// EnrichProducts добавляет информацию о скидках к списку товаров
func (s *PromoService) EnrichProducts(ctx context.Context, products []dto.ProductResponse) error {
    if len(products) == 0 {
        return nil
    }

    productIDs := make([]int, len(products))
    for i, p := range products {
        productIDs[i] = p.ID
    }

    promos, err := s.promoCache.GetMulti(ctx, productIDs)
    if err != nil {
        return err
    }

    for i := range products {
        if promo, ok := promos[products[i].ID]; ok {
            products[i].DiscountPrice = &promo.DiscountPrice
            products[i].DiscountEnds = &promo.EndDate
        }
    }

    return nil
}

// EnrichProduct добавляет информацию о скидке к одному товару
func (s *PromoService) EnrichProduct(ctx context.Context, product *dto.ProductResponse) error {
    promo, err := s.promoCache.Get(ctx, product.ID)
    if err != nil {
        return err
    }

    if promo != nil {
        product.DiscountPrice = &promo.DiscountPrice
        product.DiscountEnds = &promo.EndDate
    }

    return nil
}
```

### 4.3 Изменения в ProductHandler

**Путь:** `backend/internal/handler/product.go`

```go
// Добавить PromoService в структуру
type ProductHandler struct {
    productRepo  *repository.ProductRepository
    promoService *service.PromoService  // NEW
}

// GetProducts - добавить обогащение скидками
func (h *ProductHandler) GetProducts(c *gin.Context) {
    // ... существующий код получения товаров ...

    products, total, err := h.productRepo.GetProducts(c.Request.Context(), filter)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }

    // NEW: Обогащаем скидками
    if err := h.promoService.EnrichProducts(c.Request.Context(), products); err != nil {
        slog.Error("failed to enrich products with promos", slog.String("error", err.Error()))
        // Не возвращаем ошибку - товары отдаём без скидок
    }

    c.JSON(http.StatusOK, dto.ProductListResponse{
        Products: products,
        Total:    total,
        Limit:    filter.Limit,
        Offset:   filter.Offset,
    })
}

// GetProduct - добавить обогащение скидками
func (h *ProductHandler) GetProduct(c *gin.Context) {
    // ... существующий код получения товара ...

    product, err := h.productRepo.GetByID(c.Request.Context(), id)
    if err != nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "product not found"})
        return
    }

    // NEW: Обогащаем скидкой
    if err := h.promoService.EnrichProduct(c.Request.Context(), product); err != nil {
        slog.Error("failed to enrich product with promo", slog.String("error", err.Error()))
    }

    c.JSON(http.StatusOK, product)
}
```

### 4.4 Изменения в SearchHandler

**Путь:** `backend/internal/handler/search.go`

```go
// Добавить PromoService в структуру
type SearchHandler struct {
    searchRepo   *search.Repository
    promoService *service.PromoService  // NEW
}

// Search - добавить обогащение скидками
func (h *SearchHandler) Search(c *gin.Context) {
    // ... существующий код поиска ...

    result, err := h.searchRepo.Search(c.Request.Context(), filter)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }

    // NEW: Обогащаем скидками
    if err := h.promoService.EnrichProducts(c.Request.Context(), result.Products); err != nil {
        slog.Error("failed to enrich search results with promos", slog.String("error", err.Error()))
    }

    c.JSON(http.StatusOK, result)
}
```

### 4.5 Изменения в main.go

**Путь:** `backend/cmd/server/main.go`

```go
func main() {
    // ... существующий код ...

    // NEW: Создаём PromoCache и PromoService
    promoCache := cache.NewPromoCache(redisClient)
    promoRepo := repository.NewPromoRepository(db)
    promoService := service.NewPromoService(promoRepo, promoCache)

    // NEW: Загружаем скидки при старте
    if err := promoService.LoadActivePromos(context.Background()); err != nil {
        log.Error("failed to load promos", slog.String("error", err.Error()))
        // Не падаем - система работает без скидок
    }

    // NEW: Запускаем воркер обновления скидок (каждые 5 минут)
    go promoService.StartRefreshWorker(context.Background(), 5*time.Minute)

    // Передаём promoService в RouterDeps
    routerDeps := handler.RouterDeps{
        // ... существующие поля ...
        PromoService: promoService,  // NEW
    }

    // ... остальной код ...
}
```

### 4.6 Индексация скидок в Elasticsearch

**Путь:** `backend/internal/search/document.go`

```go
type ProductDocument struct {
    ID            int      `json:"id"`
    Name          string   `json:"name"`
    // ... существующие поля ...

    // NEW: Поля для скидок
    DiscountPrice *float64 `json:"discount_price,omitempty"`
    HasDiscount   bool     `json:"has_discount"`
}
```

**Путь:** `backend/internal/search/mapping.go`

```go
// Добавить в mapping
"discount_price": {
    "type": "float"
},
"has_discount": {
    "type": "boolean"
}
```

**Путь:** `backend/internal/search/worker.go`

```go
// При индексации товара добавлять скидку
func (w *Worker) indexProduct(ctx context.Context, product *model.Product) error {
    doc := ProductDocument{
        // ... существующие поля ...
    }

    // NEW: Получаем скидку из кэша
    promo, _ := w.promoCache.Get(ctx, product.ID)
    if promo != nil {
        doc.DiscountPrice = &promo.DiscountPrice
        doc.HasDiscount = true
    }

    return w.client.Index(ctx, doc)
}
```

---

## 5. Миграции

Миграции не требуются — таблица `promos` уже существует.

---

## 6. API изменения

### Ответ GET /api/products

```json
{
  "products": [
    {
      "id": 123,
      "name": "Штукатурка KNAUF Ротбанд 30кг",
      "price": 790.00,
      "discount_price": 590.00,      // NEW
      "discount_ends": "2025-12-31", // NEW
      // ...
    }
  ]
}
```

### Ответ GET /api/search

```json
{
  "products": [
    {
      "id": 123,
      "name": "Штукатурка KNAUF Ротбанд 30кг",
      "price": 790.00,
      "discount_price": 590.00,      // NEW
      "discount_ends": "2025-12-31", // NEW
      // ...
    }
  ],
  "aggregations": {
    // ... возможно добавить фильтр "Только со скидкой"
  }
}
```

---

## 7. Тестирование

### 7.1 Unit тесты

- `PromoCache.Set/Get/GetMulti`
- `PromoService.EnrichProducts`
- `PromoService.LoadActivePromos`

### 7.2 Integration тесты

```bash
# 1. Добавить скидку в БД
INSERT INTO promos (promo_id, product_id, discount_price, start_date, end_date)
VALUES (1, 123, 590.00, '2025-01-01', '2025-12-31');

# 2. Перезапустить бэкенд (загрузит скидки)
docker-compose restart backend

# 3. Проверить API
curl http://localhost:8080/api/products/123
# Ожидаем: discount_price: 590.00

# 4. Проверить поиск
curl "http://localhost:8080/api/search?q=штукатурка"
# Ожидаем: товары со скидками имеют discount_price
```

### 7.3 Проверка на фронтенде

1. Открыть страницу товара со скидкой
2. Убедиться что отображается:
   - Бейдж с процентом скидки
   - Зачёркнутая старая цена
   - Новая цена

---

## 8. План реализации

| # | Задача | Время |
|---|--------|-------|
| 1 | Создать `PromoCache` | 30 мин |
| 2 | Создать `PromoService` | 45 мин |
| 3 | Интегрировать в `ProductHandler` | 30 мин |
| 4 | Интегрировать в `SearchHandler` | 20 мин |
| 5 | Обновить `main.go` | 20 мин |
| 6 | Добавить в Elasticsearch | 30 мин |
| 7 | Тестирование | 30 мин |
| **Итого** | | **~3.5 часа** |

---

## 9. Риски и митигации

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Redis недоступен | Low | Graceful degradation — отдаём товары без скидок |
| Скидки устарели в кэше | Medium | TTL = до конца скидки, обновление каждые 5 минут |
| Большое количество скидок | Low | Batch-загрузка, pipeline в Redis |

---

## 10. Метрики успеха

- [ ] API `/products` возвращает `discount_price` для товаров со скидкой
- [ ] Поиск возвращает товары со скидками
- [ ] Frontend отображает скидки на карточках
- [ ] Скидки обновляются автоматически каждые 5 минут
- [ ] Время ответа API не увеличилось более чем на 10мс

---

## 11. Альтернативы (отвергнутые)

### JOIN в каждом запросе

```sql
SELECT p.*, pr.discount_price
FROM products p
LEFT JOIN promos pr ON p.id = pr.product_id
  AND pr.start_date <= NOW()
  AND pr.end_date >= NOW()
```

**Почему отвергнуто:**
- Дополнительная нагрузка на БД при каждом запросе
- Сложнее кэшировать
- Не работает с Elasticsearch

### Хранение скидок в самой таблице products

```sql
ALTER TABLE products ADD COLUMN discount_price DECIMAL(10,2);
```

**Почему отвергнуто:**
- Нужно обновлять товары при изменении скидок
- Теряется история скидок
- Сложнее управлять временными акциями
