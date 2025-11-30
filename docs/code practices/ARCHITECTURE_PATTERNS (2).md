# Архитектурные паттерны service-loyalty-notifications

Этот документ описывает интересные архитектурные решения Go-сервиса нотификаций для платформы лояльности. Сервис содержит ~13,400 строк кода и демонстрирует продвинутые паттерны проектирования.

## 1. Runtime Stack Introspection для DI Container

**Где:** `internal/container/container_helpers.go`

Контейнер использует runtime reflection для **автоматического** определения имени сервиса из стека вызовов:

```go
func serviceName() ServiceName {
    pcs := make([]uintptr, 10000)
    n := runtime.Callers(1, pcs)

    callerFrames := runtime.CallersFrames(pcs)

    for more := true; more; {
        callerFrame, more = callerFrames.Next()
        name := callerFrame.Function

        // Пропускаем служебные функции
        if strings.Contains(name, "mustGetOrNew") ||
           strings.Contains(name, "getOrNew") {
            continue
        }

        // Извлекаем последнюю часть: "GetRepository" из "*.Container.GetRepository"
        parts := strings.Split(name, ".")
        return ServiceName(parts[len(parts)-1])
    }
}

// Generic getter с автоматическим определением имени
func getOrNew[T any](c *Container, factory func() (T, error)) (T, error) {
    name := serviceName()  // автоматически из стека!

    if srv, ok := c.services.Load(name); ok {
        return srv.(T), nil
    }

    instance, err := factory()
    if err != nil {
        return def, err
    }

    c.services.Store(name, instance)
    return instance, nil
}

// Использование в контейнере
func (c *Container) GetRepository() repository {
    return mustGetOrNew(c, func() repository {
        return repository.NewRepository(
            c.GetDB(),
            c.GetPGKPreparer(),
            c.GetLogger(),
        )
    })
}
```

**Фишки:**
- Не нужно писать имя сервиса вручную — определяется из названия метода
- Type-safe через generics, но с автоматическим ключом
- Singleton pattern через `sync.Map`
- Поддержка моков: `SetMock(serviceName, mock)` для тестов
- `mustGetOrNew` паникует при ошибке, `getOrNew` возвращает error

**Зачем:** Убирает дублирование между именем метода и строковым ключом. Сохраняет compile-time safety и уменьшает boilerplate.

---

## 2. Generic Stack для Graceful Shutdown

**Где:** `internal/utils/datastructs/stack.go`, `internal/container/container.go`

Контейнер использует generic Stack для гарантированного LIFO порядка cleanup:

```go
// Generic stack
type Stack[T any] struct {
    s []T
}

func (s *Stack[T]) Push(val T) {
    s.s = append(s.s, val)
}

func (s *Stack[T]) Pop() T {
    val := s.s[len(s.s)-1]
    s.s = s.s[0 : len(s.s)-1]
    return val
}

// В контейнере
type Container struct {
    appCtx   context.Context
    services sync.Map
    shutdown *datastructs.Stack[func()]  // стек cleanup функций
}

func NewContainer() (*Container, func()) {
    ctx, cancel := context.WithCancel(context.Background())

    c := &Container{
        appCtx:   ctx,
        shutdown: datastructs.NewStack[func()](),
    }

    gracefulShutdown := c.gracefulShutdown(cancel)
    return c, gracefulShutdown
}

func (c *Container) gracefulShutdown(ctxCancel func()) func() {
    return func() {
        // LIFO порядок: последний зарегистрированный — первый закрывается
        for !c.shutdown.IsEmpty() {
            c.shutdown.Pop()()
        }

        ctxCancel()
    }
}
```

**Зачем:** Гарантирует правильный порядок освобождения ресурсов (обратный порядку инициализации). Например, сначала закрываем consumers, потом connections, потом pools.

---

## 3. Redis Time-Window Debouncer с распределенной агрегацией

**Где:** `internal/infrastructure/debouncer/debouncer.go`

Агрегация множественных событий в одно уведомление через Redis:

```go
type Debouncer struct {
    redis  redis
    mu     mutex  // distributed lock (locki.Mutex)
    window time.Duration  // например, 1 минута
}

// Добавляем событие в debounce окно
func (d *Debouncer) Debounce(ctx context.Context, queue string, eventID uuid.UUID) error {
    conn, _ := d.redis.GetContext(ctx)
    defer conn.Close()

    nowUnix := time.Now().UnixMilli()

    // Транзакция Redis
    _ = conn.Send("MULTI")
    // Добавляем queue в sorted set с timestamp
    _ = conn.Send("ZADD", "debounce_lists", "NX", nowUnix, queue)
    // Добавляем eventID в set (дедупликация)
    _ = conn.Send("SADD", queue, eventID.String())

    _, err := conn.DoContext(ctx, "EXEC")
    return err
}

// Получаем события, чье окно истекло
func (d *Debouncer) NextDebounced(ctx context.Context) ([]uuid.UUID, error) {
    var values []string

    // Distributed lock для атомарности
    err := d.mu.Do(ctx, "mu_debouncer", func(ctx context.Context) error {
        // Ищем queues старше window
        debounceQueue := d.peekMinFromDebounceList(ctx)

        // Забираем и удаляем все eventID из очереди
        values = d.popDebounceListValues(ctx, debounceQueue)

        return nil
    })

    return parseUUIDs(values), err
}

func (d *Debouncer) peekMinFromDebounceList(ctx context.Context) (string, error) {
    searchEnd := time.Now().Add(-d.window).UnixMilli()

    // Получаем первую очередь, где timestamp <= (now - window)
    values := redis.Strings(conn.Do(
        "ZRANGE", "debounce_lists", 0, searchEnd, "BYSCORE", "LIMIT", 0, 1,
    ))

    return values[0], nil
}

func (d *Debouncer) popDebounceListValues(ctx context.Context, queue string) ([]string, error) {
    _ = conn.Send("MULTI")
    _ = conn.Send("SMEMBERS", queue)      // получаем все eventID
    _ = conn.Send("DEL", queue)           // удаляем set
    _ = conn.Send("ZREM", "debounce_lists", queue)  // удаляем из sorted set

    reply := conn.Do("EXEC")
    return redis.Strings(reply[0], nil)
}
```

**Структура данных Redis:**
- `debounce_lists` — Sorted Set с ключом=queue_name, score=timestamp
- `{queue_name}` — Set с уникальными eventID

**Debounce key formation:**
```go
func getDebounceListKey(e models.Event) string {
    // Если event data имеет дополнительный ключ (например saleID)
    if dataKeyPart := e.Data.GetDebounceKey(); dataKeyPart != "" {
        return fmt.Sprintf("%s_%s_%d", e.Type, dataKeyPart, e.RecipientID)
    }

    // Иначе группируем по типу + recipient
    return fmt.Sprintf("%s_%d", e.Type, e.RecipientID)
}
```

**Фишки:**
- Автоматическая дедупликация через Redis SET
- Временное окно для агрегации (default: 1 минута)
- Distributed locking через `locki.Mutex` для многоинстансной работы
- Атомарные операции через Redis MULTI/EXEC

**Зачем:** Объединение множественных событий (например, 10 товаров отклонено) в одно уведомление "10 товаров исключены из распродажи" вместо 10 отдельных.

---

## 4. Type-Based Factory Resolver с полиморфизмом

**Где:** `internal/app/services/notification_factory/resolver.go`, `sale_item_changed/factory.go`

Диспетчеризация фабрик по типу события:

```go
type Resolver struct {
    factories map[models.EventType]factory
}

func NewResolver(factories ...factory) *Resolver {
    resolveMap := make(map[models.EventType]factory, len(factories))

    for _, f := range factories {
        resolveMap[f.GetType()] = f  // каждая фабрика регистрирует свой тип
    }

    return &Resolver{factories: resolveMap}
}

func (r *Resolver) MakeNotifications(ctx context.Context, events []models.Event) (*models.Notification, error) {
    if len(events) == 0 {
        return nil, models.ErrNoData
    }

    eventType := events[0].Type

    if f, ok := r.factories[eventType]; ok {
        return f.MakeNotification(ctx, events)  // полиморфный вызов
    }

    return nil, ErrNoFactoryForEvent
}
```

**Пример фабрики с агрегацией и плюрализацией:**

```go
type Factory struct {
    saleClient saleClient
    itemClient itemClient
}

func (f *Factory) MakeNotification(ctx context.Context, events []models.Event) (*models.Notification, error) {
    // Извлекаем typed data из events
    eventsData := make([]eventModels.SaleItemChanged, 0)
    for _, e := range events {
        eventData := e.Data.(eventModels.SaleItemChanged)
        eventsData = append(eventsData, eventData)
    }

    // Дедуплицируем itemID через generic slice utilities
    items := slices.Unique(
        slices.Map(eventsData, func(e eventModels.SaleItemChanged) int64 {
            return e.ItemID
        }),
    )

    // Обогащаем данными из внешних клиентов
    saleItems, _ := f.saleClient.GetItems(ctx, saleID, items)

    bannedItems := slices.Filter(saleItems, func(e sales.Item) bool {
        return e.Status == sales.ItemStatusBanned
    })

    // Разная логика для 1 товара vs множества
    if len(bannedItems) == 1 {
        notification := f.buildSingleItemNotification(ctx, bannedItems[0])
        return notification, nil
    } else {
        notification := buildManyItemsNotification(bannedItems)
        return notification, nil
    }
}

func buildManyItemsNotification(items []sales.Item) notification {
    // Правильная плюрализация через библиотеку
    itemText := text.Plural64(len(items), "товар", "товара", "товаров")
    advText := text.Plural64(len(items), "объявление", "объявления", "объявлений")

    return notification{
        ListTitle: "⚠️ Ваши товары исключили из распродажи",
        ListDesc:  fmt.Sprintf("%d %s больше не подходят под условия", len(items), advText),
        FullTitle: fmt.Sprintf("Исключили %d %s из распродажи", len(items), itemText),
    }
}

func (*Factory) GetType() models.EventType {
    return models.EventTypeSaleItemChanged
}
```

**Регистрируемые фабрики:**
- `sale_item_changed` — товар исключен из распродажи
- `sale_seller_status_changed` — статус продавца изменился
- `seller_promocode_limit_reached` — лимит промокодов достигнут

**Зачем:** Легко добавлять новые типы уведомлений без изменения основного кода. Инкапсулирует логику агрегации и форматирования для каждого типа.

---

## 5. Generic Handler Decorators с композицией

**Где:** `internal/controllers/qaas/timer_decorator.go`, `composed.go`

Type-safe декораторы через generics:

```go
// Базовый интерфейс handler'а
type handler[T any] interface {
    Handle(ctx context.Context, msg T) (deferred bool, err error)
}

// Timer decorator — измеряет время обработки
type TimerDecorator[T any] struct {
    handler handler[T]
    timer   opTimer  // NFR middleware timer
}

func (t *TimerDecorator[T]) Handle(ctx context.Context, msg T) (bool, error) {
    var deferred bool
    var err error

    t.timer.DoOperation(func() error {
        deferred, err = t.handler.Handle(ctx, msg)
        return err
    })

    return deferred, err
}

// Batch handler — обрабатывает массив сообщений
type Handler[T any] struct {
    h     handler[T]
    log   logger
    mon   monitoring
    topic string
}

func (h *Handler[T]) Handle(messages []*T, metas []qaas.Meta) (int, bool, error) {
    h.mon.QaasConsumeTotal(h.topic, len(messages))

    var processed int

    for i, m := range messages {
        if m == nil {
            processed++
            h.mon.QaasProcessEmpty(h.topic)
            continue
        }

        deferred, err := h.h.Handle(metas[i].Context(), *m)
        if err != nil {
            h.log.Error(metas[i].Context(), err, log.Data{"topic": h.topic})
            h.mon.QaasProcessError(h.topic)
            return processed, deferred, err
        }

        processed++
    }

    return processed, false, nil
}

// Функция композиции всех слоев
func NewComposedHandler[T any](
    h handler[T],
    log logger,
    mon monitoring,
    topic string,
    opName string,
    nfr *middleware.Nfr,
) *Handler[T] {
    // Композиция: BaseHandler → TimerDecorator → BatchHandler
    return New[T](
        NewTimerDecorator(h, nfrUtils.NewOperationTimer(nfr, opName)),
        log,
        mon,
        topic,
    )
}
```

**Использование в контейнере:**

```go
func (c *Container) QaasEventOccurredHandler() *qaas.Handler[qaasEventOccurred.Event] {
    return mustGetOrNew(c, func() *qaas.Handler[qaasEventOccurred.Event] {
        return qaas.NewComposedHandler[qaasEventOccurred.Event](
            eventOccurred.NewHandler(c.getEventProcessor(), c.GetLogger()),
            c.GetLogger(),
            c.GetMonitoring(),
            "event_occurred",
            "handleEventOccurred",  // NFR operation name
            c.getNfr(),
        )
    })
}
```

**Фишки:**
- Type-safe composition через generics
- Прозрачные decorators — бизнес-логика не знает о метриках
- Слои: базовый handler → timer → batch processor
- Автоматическая интеграция с NFR (Non-Functional Requirements tracking)

**Зачем:** Разделение concerns: бизнес-логика, мониторинг, батчинг независимы. Легко добавлять новые decorators (retry, circuit breaker, rate limiting).

---

## 6. Per-Command Redis Metrics через Connection Decorator

**Где:** `internal/infrastructure/redis/conn.go`, `pool.go`

Автоматическое измерение времени **каждой** команды Redis:

```go
type connWithStats struct {
    redis.ConnWithContext
    mon monitoring
}

func (c *connWithStats) DoContext(ctx context.Context, commandName string, args ...any) (reply any, err error) {
    start := time.Now()

    defer func() {
        metricKey := fmt.Sprintf("redis.timing.%s.%s",
            commandName,
            ternary(err == nil, "ok", "error"),
        )
        c.mon.Duration(metricKey, time.Since(start))
    }()

    reply, err = c.ConnWithContext.DoContext(ctx, commandName, args...)

    return
}
```

**Pool с периодическими метриками:**

```go
type PoolWithStats struct {
    inner     pool
    mon       monitoring
    monTicker *time.Ticker  // каждые 5 секунд
}

func (p *PoolWithStats) startPoolMonitoring() {
    for {
        select {
        case <-p.ctx.Done():
            return
        case <-p.monTicker.C:
            p.sendPoolMetrics(p.stats())
        }
    }
}

func (p *PoolWithStats) sendPoolMetrics(s redigo.PoolStats) {
    p.mon.Gauge("redis.pool.activeConn", s.ActiveCount)
    p.mon.Gauge("redis.pool.waitConn", s.WaitCount)
    p.mon.Gauge("redis.pool.idleConn", s.IdleCount)
    p.mon.Gauge("redis.pool.waitTime", s.WaitDuration.Milliseconds())
}

// Health check каждые 10 секунд
func (p *PoolWithStats) startCheckConn() {
    for {
        select {
        case <-p.ctx.Done():
            return
        case <-time.After(10 * time.Second):
            p.checkConn()  // получаем 3 коннекта для проверки
        }
    }
}

func (p *PoolWithStats) GetContext(ctx context.Context) (redigo.ConnWithContext, error) {
    conn, err := p.getValidConn(ctx)

    // Оборачиваем в decorator
    return &connWithStats{
        ConnWithContext: conn,
        mon:             p.mon,
    }, nil
}
```

**Метрики без изменения кода:**
- `redis.timing.ZADD.ok` — время успешного ZADD
- `redis.timing.SMEMBERS.error` — время неудачного SMEMBERS
- `redis.pool.activeConn` — количество активных соединений
- `redis.pool.waitTime` — время ожидания соединения

**Зачем:** Детальная observability Redis без instrumenting каждого вызова вручную. Автоматическое разделение по командам и success/error.

---

## 7. Transactional Outbox Pattern через PGK

**Где:** `internal/infrastructure/repository/repository.go`

Гарантированная публикация событий через transactional outbox:

```go
type Repository struct {
    db          db
    pgkPreparer pgkPreparer  // PGK (Postgres-to-Kafka) client
}

func (r *Repository) Tx(ctx context.Context, f func(context.Context, *sqlx.Tx) error) error {
    tx, err := r.db.BeginTxx(ctx, nil)
    if err != nil {
        return fmt.Errorf("begin transaction: %w", err)
    }

    // Связываем PGK транзакцию с DB транзакцией
    ctx = r.pgkPreparer.WithTx(ctx, tx)

    err = f(ctx, tx)
    if err != nil {
        tx.Rollback()
        return err
    }

    // Commit применяет и DB изменения, и PGK события атомарно
    err = tx.Commit()
    return err
}
```

**Использование в event processor:**

```go
func (p *DebounceProcessor) Process(ctx context.Context, params Params) error {
    event := p.repo.GetEventByID(ctx, params.EventID)

    // Debounce в Redis
    p.debouncer.Debounce(ctx, getDebounceListKey(event), event.Id)

    // Публикация delayed события через transactional outbox
    err := p.repo.Tx(ctx, func(ctx context.Context, _ *sqlx.Tx) error {
        // Эта публикация будет записана в outbox таблицу в той же транзакции
        return p.publish.EventOccurred(ctx, event, p.debouncer.Window())
    })

    return err
}

func (p *DebounceProcessor) sendNotification(ctx context.Context, eventIDs []uuid.UUID) error {
    events := p.repo.SearchEvents(ctx, ...)
    notification := p.factory.MakeNotifications(ctx, events)

    return p.repo.Tx(ctx, func(ctx context.Context, tx *sqlx.Tx) error {
        // Обновляем статус событий
        p.repo.UpdateEventStatusTx(ctx, tx, models.EventStatusProcessed, ...)

        // Публикация notification — тоже через outbox
        err := p.publish.NotificationSend(ctx, *notification)

        // Если Commit откатится — и статус не обновится, и событие не уйдет
        return err
    })
}
```

**Фишки:**
- Атомарность: DB update + event publish в одной транзакции
- At-least-once гарантии: если процесс упадет после commit, PGK переотправит событие
- Контекст с транзакцией передается неявно через `ctx`

**Зачем:** Избегает потери событий при падениях. Гарантирует консистентность между БД и очередями.

---

## 8. Type-Indexed Event Data Parsing

**Где:** `internal/infrastructure/repository/dto.go`

Полиморфное хранение и парсинг event data:

```go
// Маппинг типов в integer для хранения
var eventTypeToStorage = map[models.EventType]int{
    models.EventTypeSaleItemChanged:             1,
    models.EventTypeSaleSellerStatusChanged:     2,
    models.EventTypeSellerPromocodeLimitReached: 3,
}

// Маппинг integer → функция парсинга
var dataParserByType = map[int]func([]byte) (models.EventData, error){
    1: func(d []byte) (models.EventData, error) {
        return eventData.ParseSaleItemReject(d)
    },
    2: func(d []byte) (models.EventData, error) {
        return eventData.ParseSellerStatusChanged(d)
    },
    3: func(d []byte) (models.EventData, error) {
        return eventData.ParseSellerPromocodeLimitReached(d)
    },
}

// Storage DTO
type event struct {
    Id          uuid.UUID `db:"id"`
    RecipientID int64     `db:"recipient_id"`
    Data        string    `db:"data"`  // JSON
    Status      int       `db:"status"`
    EventType   int       `db:"type"`  // integer вместо string enum
}

// Conversion при чтении
func (e event) toDomain() (models.Event, error) {
    // Выбираем парсер по типу события
    parser, ok := dataParserByType[e.EventType]
    if !ok {
        return models.Event{}, fmt.Errorf("unknown event type: %d", e.EventType)
    }

    // Парсим JSON → typed struct
    eventData, err := parser([]byte(e.Data))
    if err != nil {
        return models.Event{}, fmt.Errorf("parse event data: %w", err)
    }

    return models.Event{
        Id:          e.Id,
        RecipientID: e.RecipientID,
        Data:        eventData,  // interface{} с typed значением
        Status:      eventStatusFromStorage[e.Status],
        Type:        findKeyByValue(eventTypeToStorage, e.EventType),
    }, nil
}
```

**Domain interface:**

```go
type EventData interface {
    GetDebounceKey() string  // для группировки в debouncer
}

type SaleItemChanged struct {
    SaleID int64
    ItemID int64
}

func (s SaleItemChanged) GetDebounceKey() string {
    return fmt.Sprintf("%d", s.SaleID)  // группируем по распродаже
}
```

**Зачем:** Экономия места в БД (integer vs string), type-safe парсинг, полиморфизм без reflection в runtime.

---

## 9. Dual Event Processing Strategies

**Где:** `internal/app/services/event/debounce_processor.go`, `simple_processor.go`

Два разных процессора для разных сценариев:

**Simple Processor** — мгновенная отправка:

```go
type SimpleProcessor struct {
    repo    repository
    factory factory
    publish qaasPublisher
}

func (p *SimpleProcessor) Process(ctx context.Context, params Params) error {
    event := p.repo.GetEventByID(ctx, params.EventID)

    if event.Status != models.EventStatusNew {
        return nil  // уже обработано
    }

    notification := p.factory.MakeNotifications(ctx, []models.Event{event})

    return p.repo.Tx(ctx, func(ctx context.Context, tx *sqlx.Tx) error {
        p.repo.UpdateEventStatusTx(ctx, tx, models.EventStatusProcessed, ...)
        return p.publish.NotificationSend(ctx, *notification)
    })
}
```

**Debounce Processor** — агрегация с отложенной отправкой:

```go
type DebounceProcessor struct {
    repo      repository
    publish   qaasPublisher
    debouncer debouncer
    factory   factory
    interval  time.Duration  // polling interval
}

// Шаг 1: Добавляем событие в debouncer
func (p *DebounceProcessor) Process(ctx context.Context, params Params) error {
    event := p.repo.GetEventByID(ctx, params.EventID)

    // Добавляем в Redis debounce
    p.debouncer.Debounce(ctx, getDebounceListKey(event), event.Id)

    // Публикуем delayed событие обратно в QaaS с задержкой = window
    return p.repo.Tx(ctx, func(ctx context.Context, _ *sqlx.Tx) error {
        return p.publish.EventOccurred(ctx, event, p.debouncer.Window())
    })
}

// Шаг 2: Background процесс собирает агрегированные события
func (p *DebounceProcessor) StartDebounceProcessing(ctx context.Context) {
    go p.processDebounced(ctx)
}

func (p *DebounceProcessor) processDebounced(ctx context.Context) {
    timer := time.NewTicker(p.interval)  // каждую секунду

    for {
        select {
        case <-ctx.Done():
            return
        case <-timer.C:
            p.processTick(ctx)
        }
    }
}

func (p *DebounceProcessor) processTick(ctx context.Context) error {
    // Получаем события, чье окно истекло
    debounced := p.debouncer.NextDebounced(ctx)

    if len(debounced) == 0 {
        return nil
    }

    events := p.repo.SearchEvents(ctx, models.EventCriteria{
        Ids:      debounced,
        Statuses: []models.EventStatus{models.EventStatusNew},
    })

    p.mon.Gauge("event.debouncer.batch_size", len(events))

    // Фабрика агрегирует множество событий в одно уведомление
    notification := p.factory.MakeNotifications(ctx, events)

    return p.repo.Tx(ctx, func(ctx context.Context, tx *sqlx.Tx) error {
        p.repo.UpdateEventStatusTx(ctx, tx, models.EventStatusProcessed, ...)
        return p.publish.NotificationSend(ctx, *notification)
    })
}
```

**Выбор стратегии:**
- Simple — для критичных уведомлений (например, ошибка оплаты)
- Debounce — для массовых событий (исключение товаров из распродажи)

**Зачем:** Баланс между user experience (мгновенность) и performance (батчинг).

---

## 10. Consumer Manager с Auto-Restart

**Где:** `internal/infrastructure/consumer/manager.go`

Unified interface для управления всеми consumers:

```go
type Manager struct {
    ctx context.Context
    log logger
    mon monitoring
}

func (m *Manager) StartConsume(
    consumerType Type,  // "databus" | "qaas"
    topicName string,
    consumer func(ctx context.Context) error,
) {
    consume := func() {
        defer m.consumeRecover(fmt.Sprintf("%s.%s", consumerType, topicName))

        err := consumer(m.ctx)
        if err != nil {
            if errors.Is(err, context.Canceled) {
                m.log.Debug(ctx, "gracefully stopped", ...)
            } else {
                m.log.Error(ctx, fmt.Errorf("failed to consume: %w", err), ...)
            }
        }
    }

    // Бесконечный перезапуск в горутине
    go func() {
        for {
            select {
            case <-m.ctx.Done():
                return
            default:
                consume()  // автоматически перезапускается при ошибке
            }
        }
    }()
}

func (m *Manager) consumeRecover(topic string) {
    if r := recover(); r != nil {
        m.mon.PanicConsumer(topic)
        m.log.Error(m.ctx, fmt.Errorf("%s panic occurred", topic), log.Data{"message": r})
    }
}
```

**Использование в entry points:**

```go
// cmd/databus/main.go
consumeManager := consumer.NewManager(ctx, log, mon)

consumeManager.StartConsume(
    consumer.TypeDatabus,
    "marketplace-sale.item.changed",
    func(ctx context.Context) error {
        return databusClient.ConsumeMarketplaceSaleItemChanged(
            ctx,
            container.DatabusMarketplaceSaleItemChangedHandler().Handle,
        )
    },
)

// cmd/qaas/main.go
consumeManager.StartConsume(
    consumer.TypeQaas,
    "event_occurred",
    func(ctx context.Context) error {
        return qaasClient.SubscribeEventOccurred(
            ctx,
            container.QaasEventOccurredHandler().Handle,
        )
    },
)
```

**Фишки:**
- Автоматический restart при падении
- Panic recovery с метриками
- Graceful shutdown через context cancellation
- Консистентное логирование для всех consumers

**Зачем:** Resilience без дублирования логики. Единая точка для мониторинга и управления.

---

## 11. Multiple Entry Points Architecture

**Где:** `cmd/service/`, `cmd/databus/`, `cmd/qaas/`

Три отдельных бинарника из одной кодовой базы:

**1. Service** (`cmd/service/main.go`) — HTTP RPC сервер:
```go
func main() {
    // HTTP listener с middleware stack
    platform.Listen(ctx, httpListener(log, metric, nfr))
}
```

**2. DataBus Consumer** (`cmd/databus/main.go`) — читает внешние события:
```go
func main() {
    container, shutdown := containers.NewContainer()
    defer shutdown()

    databusClient := container.GetDatabusClient()
    consumeManager := consumer.NewManager(...)

    // Подписка на события из других сервисов
    consumeManager.StartConsume(
        consumer.TypeDatabus,
        "marketplace-sale.item.changed",
        databusClient.ConsumeMarketplaceSaleItemChanged,
    )

    consumeManager.StartConsume(
        consumer.TypeDatabus,
        "marketplace-sale.seller.status_changed",
        databusClient.ConsumeMarketplaceSaleSellerStatusChanged,
    )
}
```

**3. QaaS Consumer** (`cmd/qaas/main.go`) — читает внутренние очереди:
```go
func main() {
    container, shutdown := containers.NewContainer()
    defer shutdown()

    qaasClient := container.GetGeneratedQaasNonPgkClient()
    consumeManager := consumer.NewManager(...)

    // event_occurred — обработка delayed событий из debouncer
    consumeManager.StartConsume(
        consumer.TypeQaas,
        "event_occurred",
        qaasClient.SubscribeEventOccurred,
    )

    // notification_send — отправка через Communications Gateway
    consumeManager.StartConsume(
        consumer.TypeQaas,
        "notification_send",
        qaasClient.SubscribeNotificationSend,
    )
}
```

**Event Flow:**
```
External Event (DataBus)
  → DataBus Consumer saves to PostgreSQL
  → Publishes to QaaS "event_occurred" (delayed)
  → Debouncer aggregates in Redis
  → QaaS Consumer processes after window
  → Publishes to QaaS "notification_send"
  → QaaS Consumer sends via Communications Gateway
```

**Deployment options:**
- Monolith — все три бинарника на одном хосте
- Microservices — отдельное масштабирование каждого компонента
- Service + DataBus combined, QaaS отдельно

**Зачем:** Гибкость деплоя. Можно масштабировать consumers независимо от HTTP API. Разделение ответственности на уровне процессов.

---

## 12. Nil-Safe Generic Slice Utilities

**Где:** `internal/utils/slices/`

Functional programming helpers без external dependencies:

```go
// Map: A → B трансформация
func Map[A, B any](s []A, mapper func(A) B) []B {
    if s == nil {
        return nil  // nil-safe
    }

    r := make([]B, 0, len(s))

    for _, a := range s {
        r = append(r, mapper(a))
    }

    return r
}

// Filter: оставляет только элементы, проходящие predicate
func Filter[T any](s []T, fn func(elem T) bool) []T {
    r := make([]T, 0)

    for _, elem := range s {
        if fn(elem) {
            r = append(r, elem)
        }
    }

    return r
}

// Unique: дедупликация для comparable типов
func Unique[T comparable](s []T) []T {
    return UniqueBy(s, func(t T) T { return t })
}

// UniqueBy: дедупликация с кастомным extractor
func UniqueBy[T any, K comparable](s []T, ext func(t T) K) []T {
    var res []T
    unique := make(map[K]struct{})

    for _, elem := range s {
        key := ext(elem)

        if _, ok := unique[key]; !ok {
            res = append(res, elem)
        }

        unique[key] = struct{}{}
    }

    return res
}
```

**Примеры использования:**

```go
// Извлечь ItemID из событий и дедуплицировать
items := slices.Unique(
    slices.Map(eventsData, func(e eventModels.SaleItemChanged) int64 {
        return e.ItemID
    }),
)

// Фильтровать забаненные товары
bannedItems := slices.Filter(saleItems, func(e sales.Item) bool {
    return e.Status == sales.ItemStatusBanned
})

// Преобразовать events в UUID slice
eventIDs := slices.Map(events, func(e models.Event) uuid.UUID {
    return e.Id
})

// Дедупликация по кастомному полю
uniqueUsers := slices.UniqueBy(orders, func(o Order) int64 {
    return o.UserID
})
```

**Зачем:** Чистый код без циклов. Композируемые трансформации. Nil-safety из коробки. Нет зависимостей от внешних библиотек.

---

## 13. Composed Handler Pattern с инверсией зависимостей

**Где:** `internal/controllers/qaas/composed.go`, `internal/container/qaas_handlers.go`

Декомпозиция handler composition в отдельную функцию:

```go
// Базовый интерфейс для бизнес-логики
type handler[T any] interface {
    Handle(ctx context.Context, msg T) (deferred bool, err error)
}

// Composer — создает полный handler со всеми layers
func NewComposedHandler[T any](
    h handler[T],           // бизнес-логика
    log logger,
    mon monitoring,
    topic string,
    opName string,          // для NFR трекинга
    nfr *middleware.Nfr,
) *Handler[T] {
    // Композиция слоев: base → timer → batch
    return New[T](
        NewTimerDecorator(h, nfrUtils.NewOperationTimer(nfr, opName)),
        log,
        mon,
        topic,
    )
}
```

**Использование в контейнере через getOrNew:**

```go
func (c *Container) QaasNotificationSendHandler() *qaas.Handler[qaasNotifSend.Event] {
    return mustGetOrNew(c, func() *qaas.Handler[qaasNotifSend.Event] {
        return qaas.NewComposedHandler[qaasNotifSend.Event](
            // Базовый handler с бизнес-логикой
            notifSend.NewHandler(
                c.getNotificationSender(),
                c.GetMonitoring(),
                c.configs.SenderConfig,
            ),
            // Cross-cutting concerns
            c.GetLogger(),
            c.GetMonitoring(),
            "notification_send",      // topic для метрик
            "handleNotificationSend", // operation name для NFR
            c.getNfr(),
        )
    })
}

func (c *Container) QaasEventOccurredHandler() *qaas.Handler[qaasEventOccurred.Event] {
    return mustGetOrNew(c, func() *qaas.Handler[qaasEventOccurred.Event] {
        return qaas.NewComposedHandler[qaasEventOccurred.Event](
            eventOccurred.NewHandler(c.getEventProcessor(), c.GetLogger()),
            c.GetLogger(),
            c.GetMonitoring(),
            "event_occurred",
            "handleEventOccurred",
            c.getNfr(),
        )
    })
}
```

**Слои композиции:**
1. **Base Handler** — чистая бизнес-логика (event processing)
2. **Timer Decorator** — NFR timing для SLA трекинга
3. **Batch Handler** — обработка массива сообщений с метриками

**Зачем:** Инкапсулирует infrastructure concerns. Бизнес-логика не знает о метриках, batching, timing. Легко менять composition strategy.

---

## Ключевые архитектурные принципы

1. **Type Safety через Generics** — максимум compile-time safety (DI, handlers, slices)
2. **Separation of Concerns** — decorators, strategies, factories для изоляции
3. **Observability First** — автоматические метрики на каждом слое (Redis, handlers, pools)
4. **Resilience** — auto-restart consumers, transactional outbox, panic recovery
5. **Composability** — чистые функции, decorators, interfaces
6. **Zero External Dependencies** — собственные slice utilities вместо lodash
7. **Flexible Deployment** — multiple entry points для разных топологий
8. **Event Sourcing Light** — события хранятся в БД для audit и replay

---

## Необычные решения

- **Runtime stack introspection** — DI без ручных строковых ключей
- **Generic shutdown stack** — LIFO гарантия через типизированный Stack
- **Redis time-window debouncer** — распределенная агрегация через ZADD/SADD
- **Per-command Redis metrics** — decorator для автоматического измерения
- **Type-indexed parsing** — map функций парсинга вместо switch/reflection
- **Dual processing strategies** — Simple vs Debounce для разных сценариев
- **Transactional outbox через PGK** — at-least-once гарантии без Kafka connect
- **Composed handlers через generics** — type-safe декораторы с zero overhead
- **Factory pluralization** — правильная грамматика через `text.Plural64`
- **Debounce key formation** — умная группировка через `GetDebounceKey()` interface

---

## Композиция сервиса

```
DataBus Event
  ↓
[DataBus Consumer] → Save to PostgreSQL → Add to Redis Debouncer
  ↓
[QaaS Publisher] → Publish "event_occurred" (delayed by window)
  ↓
[Redis Debouncer] → Aggregate events by key + time window
  ↓
[Background Processor] → Poll Redis every 1s for expired windows
  ↓
[Notification Factory] → Aggregate N events → 1 notification (with pluralization)
  ↓
[QaaS Publisher] → Publish "notification_send"
  ↓
[QaaS Consumer] → Send via Communications Gateway
```

**Dependencies:**
- PostgreSQL — event storage + transactional outbox
- Redis — debouncing + distributed locking (locki.Mutex)
- QaaS — internal message queue
- DataBus — external events from other services
- PGK — Postgres-to-Kafka transactional outbox
- Communications Gateway — notification delivery
