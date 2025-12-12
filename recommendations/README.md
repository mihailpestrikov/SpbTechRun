# ML Recommendations Service

Python-сервис интеллектуальных рекомендаций для интернет-магазина строительных материалов. Реализует систему подбора сопутствующих товаров с непрерывным обучением на основе действий пользователей.

## Технологии

| Компонент | Технология |
|-----------|------------|
| Framework | FastAPI |
| ML | CatBoost (Learning-to-Rank) + LogisticRegression (Complementarity) |
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
│   │   ├── feature_extractor.py # 44 признака (NEW: +5 complementarity)
│   │   └── training_data_generator.py
│   ├── services/
│   │   ├── product_recommender.py      # Тип 1: сопутствующие товары
│   │   ├── scenario_recommender.py     # Тип 2: сценарии ремонта
│   │   ├── scenarios.py                # 5 сценариев White Box
│   │   ├── category_embeddings.py      # NEW: эмбеддинги категорий
│   │   └── complementarity_model.py    # NEW: модель комплементарности
│   ├── db/
│   │   ├── models.py           # SQLAlchemy ORM
│   │   └── queries.py          # SQL запросы
│   ├── core/
│   │   └── embeddings.py       # Ollama + cosine similarity
│   ├── train_complementarity.py # NEW: обучение модели комплементарности
│   └── main.py                  # FastAPI app
├── data/
│   └── complementary_categories.csv # NEW: датасет комплементарности (303 пары)
├── models/                          # Сохранённые модели
│   ├── catboost_ranker_*.cbm        # CatBoost модели
│   ├── complementarity_model.pkl    # NEW: модель комплементарности
│   ├── complementarity_scaler.pkl   # NEW: скалер
│   └── complementarity_matrix.pkl   # NEW: предвычисленная матрица
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
POST /ml/train                              # Обучение CatBoost модели
  - iterations: int (default=500)
  - learning_rate: float (default=0.05)
  - depth: int (default=6)

GET /ml/model-info                          # Статус CatBoost модели
GET /stats                                  # Статистика сервиса
```

### NEW: Комплементарные категории

```
GET /complementary-categories/{category_id}  # Топ-K комплементарных категорий
  - top_k: int (default=10, max=50)
  - min_score: float (default=0.5)

GET /complementarity/model-info              # Статус модели комплементарности
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

### 44 признака (39 + 5 NEW)

| Группа | Признаки |
|--------|----------|
| Семантические (6) | cosine_similarity, l2_distance, dot_product и др. |
| Фидбек (8) | pair_feedback_positive/negative, approval_rate |
| Ценовые (7) | price_ratio, discount_percent, price_diff |
| Категорийные (5) | same_category, same_root_category, category_distance |
| Co-purchase (3) | copurchase_count, copurchase_exists |
| Популярность (7) | view_count, cart_add_count, order_count |
| Контекст корзины (3) | cart_similarity_max/avg, cart_products_count |
| **NEW: Complementarity (5)** | **complementarity_score, category_semantic_similarity, scenario_category_match, copurchase_category_count, categories_in_same_scenario** |

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
| Обучение CatBoost (500 iter) | 1-5 min |
| Обучение Complementarity | ~5-10 sec |
| Ollama embedding | 50-200ms |

---

## NEW: Система комплементарных категорий

### Обзор

Добавлена ML-модель для определения комплементарности категорий товаров (например: штукатурка ↔ шпатели, плитка ↔ клей).

### Компоненты

1. **CategoryEmbeddingsService** - вычисляет эмбеддинги категорий как среднее эмбеддингов товаров
2. **ComplementarityModel** - LogisticRegression классификатор для предсказания комплементарности
3. **Датасет** - 303 размеченные пары категорий (165 позитивных + 138 негативных)
4. **5 новых признаков** для CatBoost модели

### Быстрый старт

```bash
# 1. Обучить модель комплементарности
docker exec spbtechrun-recommendations-1 python -m app.train_complementarity

# 2. Переобучить CatBoost с новыми признаками
curl -X POST "http://localhost:8000/ml/train?iterations=500"

# 3. Перезапустить сервис
docker-compose restart recommendations

# 4. Проверить работу
curl "http://localhost:8000/complementary-categories/25185?top_k=5"
```

### Ожидаемые улучшения метрик

| Метрика | До | После | Улучшение |
|---------|-----|-------|-----------|
| Cross-category NDCG@10 | ~0.45 | ~0.65 | +44% |
| Category diversity в топ-10 | 1-2 | 3-4 | +100% |
| Approval rate для cross-category | ~55% | ~75% | +36% |
| CTR на комплементарные товары | ~3% | ~7% | +133% |

### Подробная документация

См. [docs/COMPLEMENTARITY_FEATURES_GUIDE.md](../docs/COMPLEMENTARITY_FEATURES_GUIDE.md)
