# Checkpoint backend-4

## Elasticsearch — Search API и фасетная фильтрация

### Выполнено

#### Search API Endpoint

**Handler** (`internal/handler/search.go`):
- `GET /api/search` — полнотекстовый поиск с фильтрами
- Параметры:
  - `q` — поисковый запрос
  - `category_ids` — список ID категорий через запятую
  - `vendors` — список производителей через запятую
  - `min_price`, `max_price` — диапазон цен
  - `available` — наличие товара
  - `limit`, `offset` — пагинация

**Response формат**:
```json
{
  "products": [...],
  "total": 25000,
  "limit": 20,
  "offset": 0,
  "aggregations": {
    "categories": [
      { "id": 10, "parent_id": 1, "name": "Трубы", "count": 450 }
    ],
    "vendors": [
      { "name": "REHAU", "count": 120 }
    ],
    "price_range": { "min": 50, "max": 15000 }
  }
}
```

#### Поисковые запросы

**Multi-match поиск**:
- Поля: `name^3`, `name.keyword^4`, `description`, `vendor^2`
- Оператор AND для точного соответствия всем словам

**Фильтрация категорий через post_filter**:
- Фильтр по `category_path` применяется после агрегаций
- Это позволяет показывать все категории в фасетах, а не только выбранные

**Агрегации**:
- `categories` — по полю `category_path`, size 5000
- `vendors` — по полю `vendor.keyword`, size 500
- `price_stats` — min/max цены

#### Множественный выбор фильтров

**Category IDs**:
- Изменено с `category_id` (single) на `category_ids` (array)
- Поддержка выбора нескольких категорий одновременно
- Фильтр через `terms` query для массива значений

**Vendors**:
- Изменено с `vendor` (single) на `vendors` (array)
- Поддержка выбора нескольких производителей

#### Настройки индекса

**max_result_window**:
- Увеличен лимит пагинации с 10000 до 100000
- Функция `updateIndexSettings()` применяет настройки к существующему индексу

**track_total_hits**:
- Добавлен `track_total_hits: true` в поисковый запрос
- Elasticsearch возвращает точное количество документов, а не "10000+"

#### CategoryPathResolver

**Обогащение агрегаций**:
- `GetName(categoryID)` — название категории для отображения
- `GetParentID(categoryID)` — parent_id для построения дерева на фронтенде
- Данные кэшируются в памяти при старте

### Структура поискового запроса

```go
type SearchQuery struct {
    Text        string
    CategoryIDs []int      // множественный выбор
    MinPrice    *float64
    MaxPrice    *float64
    Vendors     []string   // множественный выбор
    Available   *bool
    Limit       int
    Offset      int
}
```

### Frontend интеграция

**CategoryTree компонент**:
- Иерархическое отображение категорий с чекбоксами
- При клике на категорию — раскрываются дочерние
- При снятии галочки с родителя — снимаются все дочерние
- Отправляются только leaf-категории (самые глубокие выбранные)

**Vendors фильтр**:
- Список производителей с чекбоксами
- Множественный выбор
- Стабильный список (не меняется при фильтрации)

**Debounce**:
- Запросы к API отправляются с задержкой 300ms
- Предотвращает множественные запросы при быстром выборе фильтров

**UI оптимизации**:
- `placeholderData: (prev) => prev` — показывать предыдущие данные при загрузке
- Нет моргания страницы при смене фильтров

### Удалённый код

В рамках cleanup удалено:
- `CategoryCache` (Redis кэш дерева категорий)
- `/categories/tree` endpoint
- `/categories/:id/children` endpoint
- `CategoryTreeResponse`, `BuildCategoryTree` из DTO
- `useCategoryTree`, `useChildCategories`, `useProductSearch` hooks на фронте
- Компонент `CatalogModal` и кнопка "Каталог"

### Структура файлов

```
backend/
├── internal/
│   ├── handler/
│   │   └── search.go          # GET /api/search
│   ├── search/
│   │   ├── repository.go      # Search(), buildQuery()
│   │   └── category.go        # CategoryPathResolver с parent_id
│   └── cache/
│       └── cart.go            # только CartCache остался

frontend/
├── src/
│   ├── components/
│   │   └── filters/
│   │       ├── CategoryTree.tsx   # дерево категорий
│   │       └── VendorFilter.tsx   # фильтр производителей
│   ├── hooks/
│   │   └── useProducts.ts     # useSearch()
│   └── api/
│       └── search.ts          # searchProducts()
```

### API Reference

```
GET /api/search?q=труба&category_ids=10,11&vendors=REHAU,Valtec&min_price=100&max_price=5000&limit=20&offset=0
```

Response содержит:
- `products` — массив товаров
- `total` — общее количество (до 100000)
- `aggregations.categories` — категории с count и parent_id
- `aggregations.vendors` — производители с count
- `aggregations.price_range` — диапазон цен в выборке
