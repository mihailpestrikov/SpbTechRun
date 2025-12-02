# Checkpoint backend-3

## Elasticsearch Integration — Этапы 1-4

### Выполнено

#### Этап 1: Инфраструктура

**Docker Compose** (`docker-compose.yml`):
- Elasticsearch 8.11.0 с single-node режимом
- Health check для ES
- Volume `elasticsearch_data` для персистентности
- Backend зависит от ES, переменная `ELASTIC_URL`

**ES Client** (`internal/search/client.go`):
- Инициализация клиента с retry логикой
- `Ping()` для проверки доступности
- Graceful degradation — если ES недоступен, логируется warning

**Миграция БД** (`migrations/000002_outbox.up.sql`):
- Таблица `outbox` (entity_type, entity_id, action, payload, created_at, processed_at)
- Поле `updated_at` в таблице `products`
- Индексы для быстрого polling необработанных событий

#### Этап 2: Outbox механизм

**Querier Interface** (`internal/repository/db.go`):
- Общий интерфейс для `*sql.DB` и `*sql.Tx`
- `TxManager` для управления транзакциями

**Outbox Repository** (`internal/repository/outbox.go`):
- `Create()` / `CreateTx()` — добавить событие
- `GetPending(limit)` — получить необработанные
- `MarkProcessed(ids)` — пометить обработанными
- `DeleteOld(olderThan)` — очистка старых

**Product Repository** (`internal/repository/product.go`):
- `Create()`, `Update()`, `Delete()` с записью в outbox
- Транзакционные варианты `CreateTx()`, `UpdateTx()`, `DeleteTx()`
- Outbox заполняется в той же транзакции

#### Этап 3: ES индексация

**Index Mapping** (`internal/search/mapping.go`):
- Русский анализатор (стемминг, стоп-слова)
- Автодополнение через edge_ngram
- Поля: name, description, vendor, category_path, price, available

**Document** (`internal/search/document.go`):
- Структура `ProductDocument` для ES
- `CategoryPath []int` — путь категорий от корня

**Search Repository** (`internal/search/repository.go`):
- `EnsureIndex()` — создать индекс если нет
- `IndexProduct()` — индексировать один товар
- `DeleteProduct()` — удалить из индекса
- `BulkIndex()` — массовая индексация
- `Search()` — полнотекстовый поиск с фильтрами

**Category Path Resolver** (`internal/search/category.go`):
- Кэширует пути категорий в памяти
- `GetPath(categoryID)` — возвращает [1, 10, 100]
- `GetName(categoryID)` — название категории

#### Этап 4: Outbox Worker

**Worker** (`internal/search/worker.go`):
- Poll outbox каждые 2 секунды
- Обрабатывает события create/update/delete
- Индексирует товары в ES
- Graceful shutdown

### Структура файлов

```
backend/
├── internal/
│   ├── repository/
│   │   ├── db.go           # Querier interface, TxManager
│   │   ├── outbox.go       # Outbox CRUD
│   │   └── product.go      # + Create/Update/Delete с outbox
│   ├── search/
│   │   ├── client.go       # ES client
│   │   ├── mapping.go      # Index schema
│   │   ├── document.go     # ProductDocument struct
│   │   ├── repository.go   # Index/Search operations
│   │   ├── category.go     # CategoryPathResolver
│   │   └── worker.go       # Outbox processor
│   └── model/
│       ├── product.go      # + UpdatedAt field
│       └── outbox.go       # OutboxEvent model
├── migrations/
│   ├── 000002_outbox.up.sql
│   └── 000002_outbox.down.sql
└── docker-compose.yml      # + elasticsearch service
```

### Архитектура синхронизации

```
Product CRUD ──tx──> PostgreSQL [products + outbox]
                            │
                            │ poll (2s)
                            ▼
                     Outbox Worker
                            │
                            │ index
                            ▼
                     Elasticsearch
```

---

## Оставшиеся этапы

### Этап 5: Search API

11. **Search Handler**
    - `GET /api/search` — новый endpoint
    - Параметры: q, category_id, min_price, max_price, vendor, limit, offset

12. **Search Repository — запросы**
    - `Search(query, filters)` — полнотекстовый поиск ✓ (уже сделано)
    - Multi-match по name, description, vendor ✓
    - Фильтры по category_path, price range, available ✓
    - Агрегации для фасетов (категории, вендоры, цены)

13. **Роутинг**
    - Добавить `/api/search` в router
    - Оставить `/api/products` как fallback

### Этап 6: Первичная загрузка

14. **CLI команда для полной переиндексации**
    - `go run cmd/indexer/main.go --full`
    - Загрузить все продукты из PostgreSQL
    - Обогатить category_path
    - Bulk index в ES

### Этап 7: Frontend

15. **Обновить SearchBar**
    - Использовать `/api/search` вместо `/api/products?search=`
    - Показывать результаты с релевантностью

16. **Фасеты на главной (опционально)**
    - Фильтр по вендорам из агрегаций
    - Показывать количество товаров в категориях

### Этап 8: Мониторинг и надёжность

17. **Health check**
    - Добавить ES в `/health` endpoint

18. **Fallback**
    - Если ES недоступен — использовать PostgreSQL поиск

19. **Очистка outbox**
    - Удалять обработанные записи старше N дней
