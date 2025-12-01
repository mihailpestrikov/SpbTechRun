# Technical Design: Elasticsearch Integration

## 1. Обзор

### Текущее состояние
- Поиск через PostgreSQL `ILIKE` только по полю `name`
- Нет полнотекстового поиска по описанию, характеристикам
- Фильтрация по категориям — только exact match (без подкатегорий)
- Нет релевантности результатов

### Цели интеграции
- Полнотекстовый поиск по названию, описанию, вендору
- Поиск с учётом иерархии категорий (товары из подкатегорий)
- Релевантность результатов (boosting по полям)
- Фасетный поиск (агрегации по категориям, вендорам, ценам)
- Автодополнение и исправление опечаток

---

## 2. Архитектура

### 2.1 Компоненты

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  Frontend   │────▶│   Backend   │────▶│  Elasticsearch  │
│  (React)    │     │   (Go/Gin)  │     │                 │
└─────────────┘     └──────┬──────┘     └─────────────────┘
                           │                     ▲
                           │                     │
                           ▼                     │
                    ┌─────────────┐              │
                    │  PostgreSQL │──────────────┘
                    │  (source)   │   sync (CDC/batch)
                    └─────────────┘
```

### 2.2 Слои backend

```
handler/
  └── search.go          # Новый handler для поиска через ES

search/
  ├── client.go          # Elasticsearch клиент
  ├── indexer.go         # Индексация и синхронизация
  ├── repository.go      # Поисковые запросы
  └── mapping.go         # Схема индекса
```

---

## 3. Схема индекса

### 3.1 Index: `products`

```json
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0,
    "analysis": {
      "filter": {
        "russian_stop": {
          "type": "stop",
          "stopwords": "_russian_"
        },
        "russian_stemmer": {
          "type": "stemmer",
          "language": "russian"
        },
        "edge_ngram_filter": {
          "type": "edge_ngram",
          "min_gram": 2,
          "max_gram": 15
        }
      },
      "analyzer": {
        "russian_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "russian_stop", "russian_stemmer"]
        },
        "autocomplete_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "edge_ngram_filter"]
        },
        "autocomplete_search": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "id": { "type": "integer" },
      "name": {
        "type": "text",
        "analyzer": "russian_analyzer",
        "fields": {
          "autocomplete": {
            "type": "text",
            "analyzer": "autocomplete_analyzer",
            "search_analyzer": "autocomplete_search"
          },
          "keyword": {
            "type": "keyword"
          }
        }
      },
      "description": {
        "type": "text",
        "analyzer": "russian_analyzer"
      },
      "vendor": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "category_id": { "type": "integer" },
      "category_path": { "type": "integer" },
      "category_name": {
        "type": "text",
        "analyzer": "russian_analyzer"
      },
      "price": { "type": "float" },
      "available": { "type": "boolean" },
      "picture": { "type": "keyword", "index": false },
      "country": { "type": "keyword" },
      "params": { "type": "flattened" },
      "created_at": { "type": "date" }
    }
  }
}
```

### 3.2 Ключевые поля

| Поле | Тип | Назначение |
|------|-----|------------|
| `name` | text + autocomplete | Основное поле поиска с автодополнением |
| `description` | text | Полнотекстовый поиск |
| `category_path` | integer[] | Массив ID категорий от корня до текущей |
| `params` | flattened | Характеристики товара (JSONB) |

---

## 4. Синхронизация данных

### 4.1 Варианты

| Подход | Плюсы | Минусы |
|--------|-------|--------|
| **Batch (периодический)** | Простота, надёжность | Задержка обновлений |
| **Event-driven (CDC)** | Real-time | Сложность, зависимости |
| **Dual-write** | Простота | Возможна рассинхронизация |

### 4.2 Рекомендация: Batch + Event hybrid

**Начальный этап:** Batch синхронизация
- Полная переиндексация по расписанию (ночью)
- Инкрементальные обновления каждые 5-10 минут
- Простая реализация, достаточно для MVP

```go
// indexer.go
type Indexer struct {
    es          *elasticsearch.Client
    productRepo *repository.ProductRepository
    categoryRepo *repository.CategoryRepository
}

func (i *Indexer) ReindexAll(ctx context.Context) error {
    // 1. Получить все продукты из PostgreSQL
    // 2. Обогатить category_path для каждого
    // 3. Bulk index в Elasticsearch
}

func (i *Indexer) IndexProduct(ctx context.Context, productID int) error {
    // Индексация одного продукта (для real-time обновлений)
}
```

### 4.3 Category Path

Для поиска по подкатегориям нужен `category_path` — массив ID от корня:

```
Категория: "Сантехника" (id=1)
  └── "Трубы" (id=10)
       └── "Полипропиленовые" (id=100)

Товар в категории 100:
category_path: [1, 10, 100]
```

При поиске в категории "Трубы" (id=10):
```json
{ "terms": { "category_path": [10] } }
```
Найдёт товары из 10 и всех подкатегорий.

---

## 5. API поиска

### 5.1 Endpoint

```
GET /api/search?q={query}&category_id={id}&min_price={}&max_price={}&vendor={}&limit={}&offset={}
```

### 5.2 Response

```json
{
  "products": [...],
  "total": 150,
  "aggregations": {
    "categories": [
      { "id": 10, "name": "Трубы", "count": 45 },
      { "id": 20, "name": "Фитинги", "count": 30 }
    ],
    "vendors": [
      { "name": "REHAU", "count": 25 },
      { "name": "Valtec", "count": 20 }
    ],
    "price_range": {
      "min": 50,
      "max": 15000
    }
  }
}
```

### 5.3 Elasticsearch Query

```json
{
  "query": {
    "bool": {
      "must": [
        {
          "multi_match": {
            "query": "полипропиленовая труба",
            "fields": ["name^3", "description", "vendor^2", "category_name"],
            "type": "best_fields",
            "fuzziness": "AUTO"
          }
        }
      ],
      "filter": [
        { "terms": { "category_path": [10] } },
        { "range": { "price": { "gte": 100, "lte": 5000 } } },
        { "term": { "available": true } }
      ]
    }
  },
  "aggs": {
    "categories": {
      "terms": { "field": "category_id", "size": 20 }
    },
    "vendors": {
      "terms": { "field": "vendor.keyword", "size": 20 }
    },
    "price_stats": {
      "stats": { "field": "price" }
    }
  },
  "from": 0,
  "size": 20
}
```

---

## 6. Реализация

### 6.1 Структура файлов

```
backend/
├── internal/
│   ├── search/
│   │   ├── client.go       # ES client initialization
│   │   ├── mapping.go      # Index mapping
│   │   ├── indexer.go      # Sync logic
│   │   ├── repository.go   # Search queries
│   │   └── model.go        # Search DTOs
│   ├── handler/
│   │   └── search.go       # HTTP handler
│   └── ...
├── cmd/
│   └── indexer/
│       └── main.go         # CLI для переиндексации
```

### 6.2 Клиент

```go
// search/client.go
package search

import (
    "github.com/elastic/go-elasticsearch/v8"
)

func NewClient(url string) (*elasticsearch.Client, error) {
    cfg := elasticsearch.Config{
        Addresses: []string{url},
    }
    return elasticsearch.NewClient(cfg)
}
```

### 6.3 Handler

```go
// handler/search.go
type SearchHandler struct {
    searchRepo *search.Repository
}

func (h *SearchHandler) Search(c *gin.Context) {
    query := c.Query("q")
    categoryID, _ := strconv.Atoi(c.Query("category_id"))
    // ... parse other filters

    results, err := h.searchRepo.Search(c.Request.Context(), search.Query{
        Text:       query,
        CategoryID: categoryID,
        MinPrice:   minPrice,
        MaxPrice:   maxPrice,
        Limit:      limit,
        Offset:     offset,
    })

    c.JSON(http.StatusOK, results)
}
```

---

## 7. Docker Compose

```yaml
services:
  elasticsearch:
    image: elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    healthcheck:
      test: curl -s http://localhost:9200 >/dev/null || exit 1
      interval: 30s
      timeout: 10s
      retries: 5

volumes:
  elasticsearch_data:
```

---

## 8. Миграция

### 8.1 Этапы

1. **Подготовка инфраструктуры**
   - Добавить ES в docker-compose
   - Инициализировать клиент в main.go
   - Создать индекс с маппингом

2. **Реализация синхронизации**
   - CLI для полной переиндексации
   - Batch job для инкрементальных обновлений

3. **Реализация поиска**
   - Search repository
   - Search handler
   - Интеграция в роутер

4. **Параллельная работа**
   - Новый endpoint `/api/search` (ES)
   - Старый `/api/products` (PostgreSQL) — fallback

5. **Переключение frontend**
   - Обновить SearchBar на новый endpoint
   - Добавить фасеты/фильтры

### 8.2 Rollback план

При проблемах с ES:
- Frontend переключается на `/api/products`
- Поиск работает через PostgreSQL ILIKE
- Без потери функциональности (только качества поиска)

---

## 9. Мониторинг

### Метрики
- Latency поисковых запросов (p50, p95, p99)
- Количество документов в индексе
- Размер индекса
- Lag синхронизации

### Health checks
```go
// GET /health
{
  "postgres": "ok",
  "redis": "ok",
  "elasticsearch": "ok"  // ping ES cluster
}
```

---

## 10. Оценка трудозатрат

| Задача | Оценка |
|--------|--------|
| Инфраструктура (docker, client) | 2-3 часа |
| Mapping и индексация | 3-4 часа |
| Search repository | 4-5 часов |
| Handler + routing | 2-3 часа |
| Frontend интеграция | 3-4 часа |
| Тестирование | 2-3 часа |
| **Итого** | **16-22 часа** |

---

## 11. Альтернативы

### PostgreSQL Full-Text Search
- Плюсы: нет новой зависимости
- Минусы: хуже русская морфология, нет агрегаций

### Meilisearch
- Плюсы: проще настройка, хороший из коробки
- Минусы: меньше возможностей, меньше community

### Рекомендация
Elasticsearch — оптимальный выбор для:
- Масштабируемости
- Русского языка (стемминг, стоп-слова)
- Фасетного поиска
- Будущего ML (semantic search)
