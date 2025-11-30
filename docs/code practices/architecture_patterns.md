# Архитектурные паттерны service-marketplace-sale

Этот документ описывает интересные архитектурные решения Go-сервиса. Сервис управляет распродажами на маркетплейсе и содержит ~1000 файлов.

## 1. DI Container с автоматическим определением имени сервиса

**Где:** `internal/containers/`

Контейнер использует runtime reflection для автоматического определения имени сервиса из стека вызовов:

```go
// Container хранит singleton'ы
type Container struct {
    services sync.Map  // thread-safe storage
    shutdown []func()  // cleanup stack
}

// Автоматическое определение имени через рефлексию
func serviceName() ServiceName {
    pcs := make([]uintptr, 10000)
    n := runtime.Callers(1, pcs)
    frames := runtime.CallersFrames(pcs[:n])

    for {
        frame, more := frames.Next()
        // Извлекает имя функции из стека: "SalesService" из "(*Container).SalesService"
        if name := extractServiceName(frame.Function); name != "" {
            return ServiceName(name)
        }
        if !more { break }
    }
}

// Generic getter с автоматическим созданием
func getOrNew[T any](c *Container, factory func() T) T {
    name := serviceName()  // автоматически определяет "T" из стека

    if val, ok := c.services.Load(name); ok {
        return val.(T)
    }

    instance := factory()
    c.services.Store(name, instance)
    return instance
}

// Использование в провайдерах
func (c *Container) SalesService() *sales.Service {
    return getOrNew(c, func() *sales.Service {
        return sales.New(c.SaleRepository(), c.ItemRepository(), ...)
    })
}

// Моки для тестов
c.SetMock("SalesService", mockService)
```

**Фишки:**
- Типобезопасные generic геттеры - не нужно писать `getOrNew[SalesService]("SalesService", ...)`, имя определяется автоматически
- Singleton lifecycle через `sync.Map`
- Поддержка моков: `SetMock(serviceName, mock)`
- Graceful shutdown со стеком cleanup функций в обратном порядке
- 50+ методов-провайдеров для композиции сервисов

**Зачем:** Избегает ручной регистрации сервисов, сохраняя compile-time safety.

---

## 2. Chain Storage Pattern с консистентностью

**Где:** `internal/storage/common/transaction.go`, `internal/storage/item_discount/chain_resolver.go`

Хранилище организовано как цепочка слоев:

```go
// Цепочка хранилищ: Redis → PostgreSQL
type ChainStorage struct {
    first Storage  // Redis cache layer
    rest  Storage  // PostgreSQL database layer
}

// Чтение идет через оба слоя
func (s *ChainStorage) GetItemDiscount(ctx context.Context, itemID int64) (*ItemDiscount, error) {
    // Сначала пробуем кеш
    discount, err := s.first.GetItemDiscount(ctx, itemID)
    if err == nil {
        return discount, nil
    }

    // Fallback на БД
    return s.rest.GetItemDiscount(ctx, itemID)
}

// Запись идет последовательно через оба
func (s *ChainStorage) SetItemDiscount(ctx context.Context, discount *ItemDiscount) error {
    if err := s.first.SetItemDiscount(ctx, discount); err != nil {
        return err
    }
    return s.rest.SetItemDiscount(ctx, discount)
}
```

**Resolver с выбором консистентности:**

```go
type Resolver struct {
    cache   Storage  // Redis (eventual consistency)
    storage Storage  // PostgreSQL (strong consistency)
    roRedis RedisClient
    rwRedis RedisClient
}

// Метод с флагом strong consistency
func (r *Resolver) GetItemDiscount(ctx context.Context, itemID int64, strongConsistency bool) (*ItemDiscount, error) {
    if strongConsistency {
        // Читаем из БД для гарантий консистентности
        return r.storage.GetItemDiscount(ctx, itemID)
    }

    // Eventual consistency: сначала кеш
    discount, err := r.cache.GetItemDiscount(ctx, itemID)
    if err == nil {
        return discount, nil
    }

    // Cache miss - идем в БД и прогреваем кеш
    discount, err = r.storage.GetItemDiscount(ctx, itemID)
    if err == nil {
        r.cache.SetItemDiscount(ctx, discount)  // async warmup
    }
    return discount, err
}

// При обновлении публикуем в очередь для инвалидации кеша
func (r *Resolver) UpdateItemDiscount(ctx context.Context, discount *ItemDiscount) error {
    if err := r.storage.UpdateItemDiscount(ctx, discount); err != nil {
        return err
    }

    // Асинхронная инвалидация через message bus
    r.publisher.Publish(ctx, ItemDiscountUpdatedEvent{ItemID: discount.ItemID})
    return nil
}
```

**Зачем:** Гибкость выбора уровня консистентности для разных use cases.

---

## 3. Многоуровневое кеширование

**Где:** `internal/cache/in_memory/`, `internal/cache/redis/`

**In-Memory кеши с polling:**

```go
type SalesCache struct {
    mu       sync.RWMutex
    data     map[int64]*Sale
    started  chan struct{}  // сигнал о готовности кеша
    interval time.Duration
}

func (c *SalesCache) Start(ctx context.Context) {
    // Первоначальная загрузка
    c.reload(ctx)
    close(c.started)  // сигнализируем, что кеш готов

    ticker := time.NewTicker(c.interval)
    defer ticker.Stop()

    for {
        select {
        case <-ticker.C:
            c.reload(ctx)  // периодическое обновление
        case <-ctx.Done():
            return
        }
    }
}

func (c *SalesCache) Get(ctx context.Context, saleID int64) (*Sale, error) {
    <-c.started  // ждем готовности кеша

    c.mu.RLock()
    defer c.mu.RUnlock()

    sale, ok := c.data[saleID]
    if !ok {
        return nil, ErrNotFound
    }
    return sale, nil
}

func (c *SalesCache) reload(ctx context.Context) {
    newData := c.loadFromDB(ctx)

    c.mu.Lock()
    c.data = newData  // атомарная замена
    c.mu.Unlock()
}
```

**Redis кеши с батчингом:**

```go
type ItemsDiscountCache struct {
    roClient RedisClient  // read-only pool для шардирования
    rwClient RedisClient  // read-write pool
    batchSize int
}

// Батч-операция для загрузки множества товаров
func (c *ItemsDiscountCache) GetBatch(ctx context.Context, itemIDs []int64) (map[int64]*ItemDiscount, error) {
    results := make(map[int64]*ItemDiscount)

    // Разбиваем на батчи по batchSize
    for i := 0; i < len(itemIDs); i += c.batchSize {
        end := min(i+c.batchSize, len(itemIDs))
        batch := itemIDs[i:end]

        // Pipeline для оптимизации
        pipe := c.roClient.Pipeline()
        cmds := make([]*redis.StringCmd, len(batch))

        for j, itemID := range batch {
            key := fmt.Sprintf("item_discount:%d", itemID)
            cmds[j] = pipe.Get(ctx, key)
        }

        pipe.Exec(ctx)

        // Обрабатываем результаты
        for j, cmd := range cmds {
            if val, err := cmd.Result(); err == nil {
                var discount ItemDiscount
                json.Unmarshal([]byte(val), &discount)
                results[batch[j]] = &discount
            }
        }
    }

    return results, nil
}

// Health check
func (c *ItemsDiscountCache) Ping(ctx context.Context) error {
    return c.roClient.Ping(ctx).Err()
}
```

**Зачем:** Минимизация latency для горячих данных + снижение нагрузки на БД.

---

## 4. Strategy Pattern для модерации товаров

**Где:** `internal/services/item_moderator/checker/`

Полиморфная система валидаторов:

```go
// Интерфейс для индивидуальной проверки товара
type ItemChecker interface {
    Check(ctx context.Context, request ItemCheckerRequest) (ItemCheckerResult, error)
    Name() string  // для мониторинга
}

// Интерфейс для батч-проверок
type ItemBatchChecker interface {
    Check(ctx context.Context, request ItemBatchCheckerRequest) (ItemBatchCheckerResult, error)
    Name() string
}

// Основной Checker композирует все проверки
type Checker struct {
    checkerFuncs      []ItemChecker
    checkerBatchFuncs []ItemBatchChecker
    mon               monitoring
}

func (c *Checker) CheckItems(ctx context.Context, items []Item) ([]ItemCheckerResult, error) {
    results := make([]ItemCheckerResult, len(items))

    // Сначала индивидуальные проверки
    for i, item := range items {
        for _, checker := range c.checkerFuncs {
            result, err := checker.Check(ctx, ItemCheckerRequest{Item: item})
            if err != nil {
                return nil, err
            }

            if !result.IsValid {
                results[i].FailedRestrictions = append(results[i].FailedRestrictions, result.FailedRestrictions...)
                c.mon.IncRejection(checker.Name())  // метрики по типу отклонения
            }
        }
    }

    // Затем батч-проверки (например, fair pricing)
    for _, batchChecker := range c.checkerBatchFuncs {
        batchResult, err := batchChecker.Check(ctx, ItemBatchCheckerRequest{Items: items})
        if err != nil {
            return nil, err
        }

        for i, itemResult := range batchResult.Results {
            if !itemResult.IsValid {
                results[i].FailedRestrictions = append(results[i].FailedRestrictions, itemResult.FailedRestrictions...)
                c.mon.IncRejection(batchChecker.Name())
            }
        }
    }

    return results, nil
}
```

**Пример конкретного checker'а:**

```go
// Проверка допустимости скидки
type ValidDiscountChecker struct {
    maxDiscount float64
}

func (v *ValidDiscountChecker) Name() string {
    return "is_valid_discount"
}

func (v *ValidDiscountChecker) Check(ctx context.Context, req ItemCheckerRequest) (ItemCheckerResult, error) {
    item := req.Item
    sale := req.Sale

    if item.Discount > sale.Restrictions.MaxDiscount {
        return ItemCheckerResult{
            IsValid: false,
            FailedRestrictions: []FailedRestriction{
                {
                    Name:      "max_discount",
                    SaleValue: sale.Restrictions.MaxDiscount,
                    ItemValue: item.Discount,
                    Hint:      fmt.Sprintf("Скидка не может превышать %d%%", sale.Restrictions.MaxDiscount),
                },
            },
        }, nil
    }

    return ItemCheckerResult{IsValid: true}, nil
}
```

**Конкретные checker'ы в `/checker_funcs/`:**
- `is_valid_discount/` - проверка допустимости скидки
- `is_valid_fair_price/` - батч-проверка fair pricing через IMV клиент
- `is_valid_location/` - географическая доступность
- `is_valid_microcategory/` - ограничения по категориям
- `is_valid_start_time/` - временные валидации

Каждый checker возвращает массив `FailedRestrictions` с детальными причинами отклонения и подсказками (hint).

**Зачем:** Легко добавлять/удалять правила модерации без изменения основного кода.

---

## 5. Generic Databus Handler с NFR трекингом

**Где:** `internal/databus/handler.go`, `internal/qaas/`

Типобезопасный обработчик сообщений:

```go
// Generic handler для типобезопасной обработки событий
type Handler[T any] struct {
    h     handler[T]
    mon   monitoring
    timer opTimer    // NFR (Non-Functional Requirements) tracking
    topic string
    rl    rateLimiter
}

type handler[T any] interface {
    Handle(ctx context.Context, msg T) error
}

// Конструктор с автоматической конфигурацией мониторинга
func New[T any](h handler[T], mon monitoring, nfr *middleware.Nfr, opName string, topic string) *Handler[T] {
    return &Handler[T]{
        h:     h,
        mon:   mon,
        timer: nfr.NewTimer(opName),  // для SLA трекинга
        topic: topic,
        rl:    newRateLimiter(),
    }
}

// Handle с автоматическими метриками
func (h *Handler[T]) Handle(ctx context.Context, msg T) error {
    // Rate limiting
    if err := h.rl.Wait(ctx); err != nil {
        return err
    }

    // NFR timer для измерения latency
    defer h.timer.ObserveDuration()

    // Выполняем обработку
    err := h.h.Handle(ctx, msg)

    // Метрики
    if err != nil {
        h.mon.IncErrors(h.topic)
    } else {
        h.mon.IncSuccess(h.topic)
    }

    return err
}
```

**Пример использования с QaaS:**

```go
// Событие изменения Sale
type SaleChangedEvent struct {
    SaleID    int64
    HistoryID int64  // для event sourcing
    Changes   map[string]interface{}
}

// Handler для обработки изменений Sale
type SaleChangedHandler struct {
    itemModerator *ItemModerator
    cache         Cache
}

func (h *SaleChangedHandler) Handle(ctx context.Context, event SaleChangedEvent) error {
    // Получаем все товары распродажи
    items, err := h.itemModerator.GetSaleItems(ctx, event.SaleID)
    if err != nil {
        return err
    }

    // Перемодерируем все товары с новыми правилами
    for _, item := range items {
        if err := h.itemModerator.ModerateItem(ctx, item); err != nil {
            return fmt.Errorf("failed to moderate item %d: %w", item.ID, err)
        }
    }

    // Инвалидируем кеш
    return h.cache.Invalidate(ctx, event.SaleID)
}

// Создание generic handler'а
func NewSaleChangedHandlerWithMetrics(
    h *SaleChangedHandler,
    mon monitoring,
    nfr *middleware.Nfr,
) *Handler[SaleChangedEvent] {
    return New(h, mon, nfr, "sale_changed_handler", "sales.changed")
}
```

**QaaS Batch Processing:**

```go
// QaaS handler с батчингом и курсором
type QaaSHandler struct {
    handler   *Handler[SaleChangedEvent]
    batchSize int
    cursor    *Cursor  // для resumable processing
}

func (q *QaaSHandler) ProcessBatch(ctx context.Context) error {
    // Получаем батч событий начиная с курсора
    events, err := q.fetchEvents(ctx, q.cursor.LastHistoryID, q.batchSize)
    if err != nil {
        return err
    }

    for _, event := range events {
        if err := q.handler.Handle(ctx, event); err != nil {
            return fmt.Errorf("failed to process event %d: %w", event.HistoryID, err)
        }

        // Обновляем курсор после успешной обработки
        q.cursor.Update(event.HistoryID)
    }

    return nil
}
```

**Обрабатываемые события:**
- Изменения sale → модерация/обновление товаров
- Обновления репутации → влияние на модерацию продавца
- Обновления товаров → инвалидация Redis
- TDD campaign изменения → управление кампаниями

**Зачем:** Type safety + встроенные метрики/rate limiting + удобный батчинг.

---

## 6. Orchestrator Pattern для сложных запросов

**Где:** `internal/services/sales/orchestrator/service.go`

Оркестратор координирует запросы через несколько репозиториев:

```go
type Orchestrator struct {
    saleRepository     saleRepository
    microcatRepository microcategoryRepository
    itemRepository     itemRepository
}

// Получение Sales с обогащением данными из других репозиториев
func (o *Orchestrator) GetSalesStrong(ctx context.Context, filter sales.SaleQuery) ([]sales.AdminSale, error) {
    // Получаем базовые данные из sale repository
    salesList, err := o.saleRepository.GetSales(ctx, filter)
    if err != nil {
        return nil, fmt.Errorf("failed to get sales: %w", err)
    }

    // Обогащаем каждую sale данными из других репозиториев
    for i := range salesList {
        // Добавляем информацию о микрокатегориях
        if err := o.enrichWithMicroCategoryInfo(ctx, &salesList[i]); err != nil {
            return nil, fmt.Errorf("failed to enrich sale %d: %w", salesList[i].ID, err)
        }

        // Добавляем статистику по товарам
        if err := o.enrichWithItemStats(ctx, &salesList[i]); err != nil {
            return nil, fmt.Errorf("failed to enrich item stats: %w", err)
        }
    }

    return salesList, nil
}

func (o *Orchestrator) enrichWithMicroCategoryInfo(ctx context.Context, sale *sales.AdminSale) error {
    // Если у sale есть ограничения по микрокатегориям
    if len(sale.Restrictions.MicroCategoryIDs) > 0 {
        // Загружаем информацию о микрокатегориях
        microcats, err := o.microcatRepository.GetByIDs(ctx, sale.Restrictions.MicroCategoryIDs)
        if err != nil {
            return err
        }

        // Обогащаем sale
        sale.Restrictions.MicroCategories = microcats
    }
    return nil
}

func (o *Orchestrator) enrichWithItemStats(ctx context.Context, sale *sales.AdminSale) error {
    // Получаем статистику по товарам распродажи
    stats, err := o.itemRepository.GetSaleStats(ctx, sale.ID)
    if err != nil {
        return err
    }

    sale.ItemStats = stats  // количество товаров, средняя скидка, и т.д.
    return nil
}

// Метод для пакетного обогащения (более эффективно)
func (o *Orchestrator) GetSalesWithBatchEnrichment(ctx context.Context, filter sales.SaleQuery) ([]sales.AdminSale, error) {
    salesList, err := o.saleRepository.GetSales(ctx, filter)
    if err != nil {
        return nil, err
    }

    // Собираем все ID микрокатегорий из всех sales
    allMicrocatIDs := make([]int64, 0)
    for _, sale := range salesList {
        allMicrocatIDs = append(allMicrocatIDs, sale.Restrictions.MicroCategoryIDs...)
    }

    // Одним запросом загружаем все микрокатегории
    microcatsMap, err := o.microcatRepository.GetByIDsMap(ctx, allMicrocatIDs)
    if err != nil {
        return nil, err
    }

    // Обогащаем sales данными из map
    for i := range salesList {
        for _, mcID := range salesList[i].Restrictions.MicroCategoryIDs {
            if mc, ok := microcatsMap[mcID]; ok {
                salesList[i].Restrictions.MicroCategories = append(salesList[i].Restrictions.MicroCategories, mc)
            }
        }
    }

    return salesList, nil
}
```

**Зачем:** Инкапсулирует бизнес-логику обогащения данных, не загрязняя репозитории. Позволяет оптимизировать через батч-загрузку.

---

## 7. Domain-Driven Design с Value Objects

**Где:** `internal/services/sales/models.go`

Чистая доменная модель:

```go
type SaleStatus string      // Value object для enum
type ItemStatus string
type Experiment string      // с парсером GetLabels()

type SaleCommon struct { ID, Key, Status, Type, DateFrom, DateTo }

type AdminSale struct {
    SaleCommon
    Restrictions AdminRestrictions
    Selections   []Selection
}

type Item struct {
    ID, SaleID, SellerID, Discount, Status
    Moderation ModerationData
}

type FailedRestriction struct {
    Name, SaleValue, ItemValue, Hint
}
```

**Зачем:** Domain-specific validation + type safety + читаемость кода.

---

## 8. Repository Pattern с Transaction Support

**Где:** `internal/repository/`

Каждый репозиторий (Item, Sale, Participant) следует паттерну:

```go
// Минимальные интерфейсы
type querier interface {
    QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
    QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
}

type monitoring interface {
    ObserveDBQuery(operation string, duration time.Duration, err error)
}

// Sale Repository
type SaleRepository struct {
    db  *sqlx.DB
    mon monitoring
}

// Обычный метод без транзакции
func (r *SaleRepository) CreateSale(ctx context.Context, sale *Sale) error {
    query := `INSERT INTO sales (key, status, type, date_from, date_to)
              VALUES ($1, $2, $3, $4, $5) RETURNING id`

    start := time.Now()
    err := r.db.QueryRowContext(ctx, query, sale.Key, sale.Status, sale.Type, sale.DateFrom, sale.DateTo).Scan(&sale.ID)
    r.mon.ObserveDBQuery("create_sale", time.Since(start), err)

    return err
}

// Транзакционный вариант - принимает *sqlx.Tx
func (r *SaleRepository) CreateSaleTx(ctx context.Context, tx *sqlx.Tx, sale *Sale) error {
    query := `INSERT INTO sales (key, status, type, date_from, date_to)
              VALUES ($1, $2, $3, $4, $5) RETURNING id`

    start := time.Now()
    err := tx.QueryRowContext(ctx, query, sale.Key, sale.Status, sale.Type, sale.DateFrom, sale.DateTo).Scan(&sale.ID)
    r.mon.ObserveDBQuery("create_sale_tx", time.Since(start), err)

    return err
}

// Использование транзакций для атомарности
func (s *SalesService) CreateSaleWithItems(ctx context.Context, sale *Sale, items []*Item) error {
    tx, err := s.db.BeginTxx(ctx, nil)
    if err != nil {
        return err
    }
    defer tx.Rollback()

    // Создаем sale
    if err := s.saleRepo.CreateSaleTx(ctx, tx, sale); err != nil {
        return err
    }

    // Создаем все items в той же транзакции
    for _, item := range items {
        item.SaleID = sale.ID
        if err := s.itemRepo.CreateItemTx(ctx, tx, item); err != nil {
            return err
        }
    }

    return tx.Commit()
}
```

**Специализированные query методы:**

```go
// Пагинация через cursor (LastReceivedItem)
type SalesQuery struct {
    Status         string
    LastReceivedID int64  // курсор для пагинации
    Limit          int
}

func (r *SaleRepository) GetSalesItems(ctx context.Context, query SalesQuery) ([]Item, error) {
    sqlQuery := `
        SELECT id, sale_id, seller_id, discount, status
        FROM items
        WHERE sale_id IN (SELECT id FROM sales WHERE status = $1)
          AND id > $2  -- курсор для пагинации
        ORDER BY id
        LIMIT $3`

    var items []Item
    err := r.db.SelectContext(ctx, &items, sqlQuery, query.Status, query.LastReceivedID, query.Limit)
    return items, err
}

// Batch запрос для агрегированных данных
func (r *SaleRepository) GetSellerAggregatedData(ctx context.Context, sellerIDs []int64) (map[int64]*SellerStats, error) {
    query := `
        SELECT
            seller_id,
            COUNT(*) as items_count,
            AVG(discount) as avg_discount,
            SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count
        FROM items
        WHERE seller_id = ANY($1)
        GROUP BY seller_id`

    rows, err := r.db.QueryContext(ctx, query, pq.Array(sellerIDs))
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    result := make(map[int64]*SellerStats)
    for rows.Next() {
        var stats SellerStats
        if err := rows.Scan(&stats.SellerID, &stats.ItemsCount, &stats.AvgDiscount, &stats.ApprovedCount); err != nil {
            return nil, err
        }
        result[stats.SellerID] = &stats
    }

    return result, nil
}

// Динамическое партиционирование таблиц
func (r *ItemRepository) CreateItemsPartition(ctx context.Context, saleID int64) error {
    partitionName := fmt.Sprintf("items_sale_%d", saleID)
    query := fmt.Sprintf(`
        CREATE TABLE IF NOT EXISTS %s PARTITION OF items
        FOR VALUES IN (%d)`, partitionName, saleID)

    _, err := r.db.ExecContext(ctx, query)
    return err
}
```

**Зачем:** Явное управление транзакциями + batch operations для производительности + cursor-based пагинация для больших датасетов.

---

## 9. Adapter Pattern для внешних клиентов

**Где:** `internal/infrastructure/client/`

Каждый client directory:
- Wrapper с circuit breaker/retry логикой
- Batch декораторы (например `imv.BatchDecorator`)
- Configuration с timeout/threshold настройками
- Fallback persistors (например Clickstream с stdout fallback)

**Примеры клиентов:**
- Item Platform Client - управление товарами
- IMV Client - fair pricing валидация
- TDD Client - управление кампаниями
- Custom Items Client - кастомные товары

**Зачем:** Изоляция внешних зависимостей + resilience + мониторинг.

---

## 10. RPC Handler Conversion Pattern

**Где:** `internal/rpc/common/`

Разделение RPC протокола и domain:
- `convert_sale.go` - Sale ↔ DTO трансформация
- `convert_restrictions.go` - обогащение restrictions
- `convert_microcategories.go` - конвертация категорий
- `convert_selection.go` - логика селекций

Handlers работают с DTO input/output, services - с domain models.

**Зачем:** Протокол (gRPC/HTTP) не влияет на бизнес-логику.

---

## 11. Error Handling с domain-specific ошибками

**Где:** `internal/models/errors.go`

```go
var (
    ErrNoData = errors.New("no data")
    ErrProcessingPermanent = fmt.Errorf("permanent")
)

func MarkPermanent(err error) error {
    return fmt.Errorf("%w (%w)", err, ErrProcessingPermanent)  // wrapping
}
```

Клиенты могут использовать `errors.Is(err, models.ErrNoData)` для type-safe обработки.

**Зачем:** Контрактные ошибки вместо string сравнений.

---

## 12. Configuration Management через envconfig

**Где:** `internal/containers/app_config.go`

```go
type AppConfig struct {
    DatabusConsumer DatabusConsumerConfig
    QueuesConsumer  QueuesConsumerConfig
    ItemDiscountRedisCache items_discount.Config
    // ...20+ конфиг структур
}

func LoadConfig() AppConfig {
    envconfig.MustProcess("", &appConfig)  // kelseyhightower/envconfig
}
```

Иерархическая конфигурация через environment variables со struct tags.

**Зачем:** Декларативная конфигурация + валидация + 12-factor app.

---

## 13. Infrastructure Abstraction Layers

**Где:** `internal/infrastructure/`

- **Storage**: абстракция над `sqlx.DB` с metrics
- **Redis**: wrapper с stats tracking, retry, separate RO pools
- **Log**: декоратор с propagation полей контекста
- **Monitoring**: агрегация метрик с checker counters, databus metrics

**Зачем:** Единая точка для наблюдаемости и управления инфраструктурой.

---

## 14. Entry Point с сложной инициализацией

**Где:** `cmd/service/main.go`

Последовательность:
1. Container creation + config loading
2. RPC server setup + middleware stack
3. 50+ handler registration через container getters
4. Health checkers (storage, cache, geo, sales)
5. Panic recovery с логированием
6. Graceful shutdown через `shutdown.WithCancel()`

GC tuning: `debug.SetGCPercent(200)` для low-latency.

---

## Композиция сервиса (пример)

```
Sales Service
├── Item Repository
├── Item Discount Storage (chain: Redis → PostgreSQL)
├── Sale Repository Orchestrator
├── Databus Publisher
├── QaaS Publisher
├── Custom Items Client
└── TDD Campaign Service
```

---

## Ключевые архитектурные принципы

1. **Type Safety** - максимум generic'ов и интерфейсов
2. **Composability** - чистое разделение ответственности
3. **Observability** - интегрированный мониторинг, NFR tracking, structured logging
4. **Scalability** - многоуровневый кеш, batch processing, connection pooling
5. **Reliability** - error wrapping, graceful shutdown, health checks
6. **Testability** - interface-based зависимости, mock support
7. **Domain Modeling** - богатые domain объекты с валидацией
8. **Async Processing** - DataBus, QaaS, goroutine management с panic recovery

---

## Необычные решения

- **Runtime reflection для DI** - автоматическое определение имени сервиса из стека
- **Consistency flags** - выбор между eventual/strong consistency на уровне запроса
- **Batch decorators** - прозрачный батчинг для внешних API
- **FailedRestriction hints** - подсказки пользователю при валидации
- **Separate RO/RW Redis pools** - оптимизация для read-heavy нагрузки
- **Dynamic table partitioning** - `CreateItemsPartition()` для масштабирования
