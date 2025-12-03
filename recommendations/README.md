# ML Recommendations Service

Python-сервис интеллектуальных рекомендаций для интернет-магазина строительных материалов. Реализует систему подбора сопутствующих товаров с непрерывным обучением на основе действий пользователей.

## Технологии

| Компонент | Технология |
|-----------|------------|
| Framework | FastAPI |
| ML | CatBoost (Learning-to-Rank) |
| Vector Search | FAISS |
| Embeddings | Ollama (nomic-embed-text) |
| Database | PostgreSQL (asyncpg) |

## Структура проекта

```
recommendations/
├── app/
│   ├── api/
│   │   ├── routes.py           # REST эндпоинты
│   │   └── schemas.py          # Pydantic модели
│   ├── ml/
│   │   ├── catboost_ranker.py  # CatBoost модель
│   │   ├── feature_extractor.py # 39 признаков
│   │   └── training_data_generator.py
│   ├── services/
│   │   ├── product_recommender.py   # Тип 1: сопутствующие товары
│   │   ├── scenario_recommender.py  # Тип 2: сценарии ремонта
│   │   └── scenarios.py             # 5 сценариев White Box
│   ├── db/
│   │   ├── models.py           # SQLAlchemy ORM
│   │   └── queries.py          # SQL запросы
│   ├── core/
│   │   └── embeddings.py       # Ollama + cosine similarity
│   └── main.py                 # FastAPI app
├── models/                     # Сохранённые CatBoost модели
├── requirements.txt
└── Dockerfile
```

## API Endpoints

### Рекомендации товаров

```
GET /recommendations/{product_id}
  - limit: int (default=20) — количество рекомендаций

Возвращает:
  - recommendations[] — список рекомендованных товаров
  - detected_scenario — определённый сценарий ремонта
  - ranking_method — "formula" | "catboost"
```

### Сценарии ремонта

```
GET /scenarios                              # Список сценариев
GET /scenarios/{id}                         # Детали сценария
GET /scenarios/{id}/recommendations         # Рекомендации по сценарию
  - cart_product_ids: str — ID товаров в корзине
  - limit_per_group: int (default=10)

GET /recommendations/scenario/auto          # Автоопределение сценария
```

### Фидбек и события

```
POST /feedback                              # Оценка рекомендации
  - recommended_product_id: int
  - feedback: "positive" | "negative"
  - context: "product_page" | "scenario"

POST /events                                # Логирование событий
POST /events/batch                          # Батч событий
```

### ML управление

```
POST /ml/train                              # Обучение модели
  - iterations: int (default=500)
  - learning_rate: float (default=0.05)
  - depth: int (default=6)

GET /ml/model-info                          # Статус модели
GET /stats                                  # Статистика сервиса
```

## Алгоритмы рекомендаций

### Тип 1: Сопутствующие товары (страница товара)

1. **Определение сценария** — по категории товара определяется сценарий ремонта
2. **Подбор кандидатов** — товары из связанных групп сценария или FAISS поиск
3. **Скоринг**:
   ```
   score = 0.5
     + embedding_similarity * 0.3
     + pair_feedback_approval * 0.4
     + scenario_feedback_approval * 0.2
     + discount_percent * 0.1
   ```
4. **ML-ранжирование** — CatBoost переранжирует топ-100 кандидатов

### Тип 2: Рекомендации по сценарию (главная страница)

1. **Анализ корзины** — какие группы сценария "закрыты"
2. **Подбор товаров** — для каждой открытой группы
3. **Скоринг с контекстом корзины**:
   ```
   score = 0.5
     + cart_similarity * 0.3
     + feedback_approval * 0.5
     + discount_percent * 0.2
   ```

## CatBoost ML

### Архитектура

- **Модель**: CatBoost Ranker (Learning-to-Rank)
- **Loss**: YetiRank
- **Метрики**: NDCG@10, PrecisionAt@5, AUC

### 39 признаков

| Группа | Признаки |
|--------|----------|
| Семантические | cosine_similarity, l2_distance, dot_product и др. |
| Фидбек | pair_feedback_positive/negative, approval_rate |
| Ценовые | price_ratio, discount_percent, price_diff |
| Категорийные | same_category, same_root_category, category_distance |
| Совместные покупки | copurchase_count, copurchase_exists |
| Популярность | view_count, cart_add_count, order_count |
| Контекст корзины | cart_similarity_max/avg, cart_products_count |

### Обучение

**Источники данных:**
- Позитивные: фидбек (positive_count ≥ 5) + co-purchase из заказов
- Негативные: фидбек (negative > positive) + hard negatives

**Запуск:**
```bash
curl -X POST "http://localhost:8000/ml/train?iterations=500&depth=6"
```

## Сценарии White Box

5 встроенных сценариев предчистовой отделки:

| ID | Название | Группы |
|----|----------|--------|
| `floor` | Монтаж наливного пола | Смеси, грунтовки, валики, миксеры, уровни |
| `partitions` | Монтаж перегородок | Газоблоки, гипсокартон, клей, шпатлёвки |
| `walls` | Выравнивание стен | Штукатурка, грунтовки, шпатели, правила |
| `tiling` | Укладка плитки | Плитка, клей, затирка, крестики, герметики |
| `electrical` | Электромонтаж | Кабели, розетки, выключатели, автоматы |

## Система фидбека

### Таблицы БД

- `product_pair_feedback` — оценки пар товаров
- `product_pair_feedback_stats` — агрегированная статистика
- `scenario_feedback` — оценки сценарийных рекомендаций
- `recommendation_events` — события (impression, click, add_to_cart)

### Влияние на рекомендации

- Положительный фидбек увеличивает score до +0.4
- Отрицательный фидбек снижает score
- Используется байесовское сглаживание: `(positive + 1) / (total + 2)`

## Конфигурация

```env
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/db
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=nomic-embed-text
```

## Запуск

### Docker Compose (рекомендуется)

```bash
docker compose up -d recommendations
```

### Локально

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Зависимости

```
fastapi==0.109.0
uvicorn[standard]==0.27.0
sqlalchemy==2.0.25
asyncpg==0.29.0
numpy==1.26.3
faiss-cpu==1.7.4
catboost==1.2.7
scikit-learn==1.4.0
pandas==2.2.0
httpx==0.26.0
```

## Производительность

| Операция | Время |
|----------|-------|
| FAISS search (k=500) | ~1ms |
| CatBoost predict (100 items) | ~50ms |
| Обучение модели (500 iter) | 1-5 min |
| Ollama embedding | 50-200ms |
