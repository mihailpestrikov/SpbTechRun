# ML Recommendations Service (Python/FastAPI)

Python-сервис интеллектуальных рекомендаций. Реализует двухуровневое ранжирование: FAISS для поиска кандидатов + CatBoost для ML-ранжирования.

## Технологии

| Компонент | Технология | Версия |
|-----------|------------|--------|
| Framework | FastAPI | 0.109 |
| ML Ranker | CatBoost | 1.2 |
| Vector Search | FAISS | 1.7 |
| Embeddings | Ollama (nomic-embed-text) | - |
| Database | PostgreSQL (asyncpg) | 16 |
| ORM | SQLAlchemy 2.0 (async) | 2.0 |

## Структура проекта

```
recommendations/
├── app/
│   ├── api/
│   │   ├── routes.py              # FastAPI endpoints
│   │   └── schemas.py             # Pydantic request/response models
│   ├── ml/
│   │   ├── catboost_ranker.py     # CatBoost обучение и inference
│   │   ├── feature_extractor.py   # Извлечение 39 признаков
│   │   └── training_data_generator.py  # Генерация обучающей выборки
│   ├── services/
│   │   ├── product_recommender.py # Рекомендации для страницы товара
│   │   ├── scenario_recommender.py # Рекомендации по сценарию
│   │   └── scenarios.py           # Конфигурация 5 сценариев
│   ├── db/
│   │   ├── database.py            # AsyncSession factory
│   │   ├── models.py              # SQLAlchemy ORM models
│   │   └── queries.py             # Оптимизированные SQL-запросы
│   ├── core/
│   │   ├── config.py              # Pydantic Settings
│   │   └── embeddings.py          # FAISS index + Ollama client
│   ├── main.py                    # FastAPI app
│   ├── generate_embeddings.py     # Скрипт генерации эмбеддингов
│   ├── generate_synthetic_feedback.py  # Синтетический фидбек для cold start
│   └── update_copurchase.py       # Обновление co-purchase статистики
├── models/                        # Сохранённые CatBoost модели (.cbm)
├── requirements.txt
└── Dockerfile
```

## API Endpoints

### Рекомендации товаров

```
GET /recommendations/{product_id}
    ?limit=20                    # Количество рекомендаций
    &cart_product_ids=1,2,3      # ID товаров в корзине (для контекста)

Response:
{
  "recommendations": [
    {
      "product": {...},
      "score": 0.87,
      "reason": "Часто покупают вместе",
      "match_reasons": [
        {"type": "category", "text": "Та же категория"},
        {"type": "copurchase", "text": "Покупали вместе 15 раз"}
      ]
    }
  ],
  "detected_scenario": "floor",
  "ranking_method": "catboost"   # или "formula" если модель не обучена
}
```

### Сценарии ремонта

```
GET /scenarios
Response: [
  {"id": "floor", "name": "Монтаж наливного пола", "groups_count": 8},
  {"id": "partitions", "name": "Монтаж перегородок", "groups_count": 7},
  ...
]

GET /scenarios/{id}
Response: {
  "id": "floor",
  "name": "Монтаж наливного пола",
  "groups": [
    {"name": "Смеси для выравнивания полов", "category_ids": [25185, 30465], "is_required": true},
    {"name": "Грунтовки", "category_ids": [25380, 25379], "is_required": true},
    ...
  ]
}

GET /scenarios/{id}/recommendations
    ?cart_product_ids=1,2,3      # Товары в корзине
    &limit_per_group=10          # Товаров на группу

Response: {
  "scenario": {"id": "floor", "name": "Монтаж наливного пола"},
  "progress": {"completed": 2, "total": 5, "percentage": 40},
  "recommendations": [
    {
      "group_name": "Ёмкости",
      "is_required": true,
      "products": [...]
    }
  ],
  "completed_groups": [
    {"group_name": "Смеси", "cart_products": [{"id": 123, "name": "..."}]}
  ]
}

GET /recommendations/scenario/auto
    ?cart_product_ids=1,2,3

Автоматически определяет сценарий по товарам в корзине.
```

### Фидбек

```
POST /feedback
Body: {
  "main_product_id": 123,           # Опционально для pair feedback
  "recommended_product_id": 456,
  "feedback": "positive",           # или "negative"
  "context": "product_page",        # или "scenario"
  "scenario_id": "floor",           # Для scenario context
  "group_name": "Грунтовки"         # Для scenario context
}
```

### ML управление

```
POST /ml/train
    ?iterations=500
    &learning_rate=0.05
    &depth=6
    &min_feedback_count=5
    &negative_sampling_ratio=3

Response: {
  "version": "20241204_123456",
  "train_samples": 5000,
  "val_samples": 1000,
  "metrics": {
    "train_auc": 0.92,
    "val_auc": 0.86,
    "train_ap": 0.88,
    "val_ap": 0.81
  },
  "top_features": [
    {"feature": "cosine_similarity", "importance": 15.2},
    {"feature": "pair_approval", "importance": 12.8},
    ...
  ]
}

GET /ml/model-info
Response: {
  "status": "ready",              # или "no_model"
  "version": "20241204_123456",
  "metadata": {...},
  "feature_count": 39
}
```

## Алгоритм рекомендаций

### Pipeline

```
1. Определение сценария
   │
   ├─ По категории товара → floor/partitions/walls/tiling/electrical
   │
   ▼
2. Candidate Retrieval (100 кандидатов)
   │
   ├─ Если сценарий найден: товары из связанных групп
   ├─ Иначе: FAISS nearest neighbors
   │
   ▼
3. Feature Extraction (39 признаков)
   │
   ├─ Семантические: cosine_similarity, l2_distance, ...
   ├─ Фидбек: pair_approval, scenario_approval, ...
   ├─ Ценовые: price_ratio, discount_percent, ...
   │
   ▼
4. Scoring
   │
   ├─ Если CatBoost обучен: ML predict
   ├─ Иначе: формульный скоринг
   │
   ▼
5. Top-K selection → Response
```

### Формульный скоринг (fallback)

Используется когда CatBoost не обучен:

```python
def calculate_score(candidate, main_product, feedback_stats, copurchase):
    score = 0.5  # base

    # Семантическая близость
    if embedding_similarity:
        score += embedding_similarity * 0.3

    # Фидбек (с байесовским сглаживанием)
    pair_approval = (positive + 1) / (total + 2)
    score += pair_approval * 0.4

    # Скидка
    if candidate.discount_price:
        discount_pct = 1 - candidate.discount_price / candidate.price
        score += discount_pct * 0.1

    # Co-purchase бонус
    if copurchase_count > 0:
        score += min(copurchase_count / 10, 0.2)

    return score
```

### CatBoost Ranker

```python
# ml/catboost_ranker.py
class CatBoostRankerService:
    def train_model(self, session, iterations=500, learning_rate=0.05, depth=6):
        # 1. Генерация обучающей выборки
        X, y, groups = training_data_generator.generate(session)

        # 2. Split по группам (не по примерам!)
        train_groups, val_groups = train_test_split(unique_groups, test_size=0.2)

        # 3. Сортировка по group_id (требование CatBoost)
        X_train = X_train.iloc[np.argsort(groups_train)]

        # 4. Обучение
        model = CatBoostRanker(
            iterations=iterations,
            learning_rate=learning_rate,
            depth=depth,
            loss_function="YetiRank",
            eval_metric="NDCG:top=10",
        )
        model.fit(train_pool, eval_set=val_pool)

        # 5. Сохранение
        model.save_model(f"models/catboost_ranker_{version}.cbm")

    def rank_candidates(self, main_product, candidates, session, cart_products=None):
        features = []
        for candidate in candidates:
            f = feature_extractor.extract(main_product, candidate, ...)
            features.append(f)

        scores = self.model.predict(pd.DataFrame(features))
        return sorted(zip(candidates, scores), key=lambda x: x[1], reverse=True)
```

## 39 признаков

### Семантические (6)

```python
cosine_similarity      # Косинусное сходство эмбеддингов
l2_distance            # L2 расстояние
dot_product            # Скалярное произведение
euclidean_distance     # Евклидово расстояние (alias)
manhattan_distance     # Манхэттенское расстояние
has_embedding          # Есть ли эмбеддинг у обоих
```

### Фидбек (8)

```python
pair_positive_count    # Лайки для пары
pair_negative_count    # Дизлайки для пары
pair_total_count       # Всего оценок
pair_approval_rate     # (positive + 1) / (total + 2)
scenario_positive_count
scenario_negative_count
scenario_total_count
scenario_approval_rate
```

### Ценовые (7)

```python
candidate_price        # Цена кандидата
price_ratio            # candidate_price / main_price
price_diff             # Абсолютная разница
price_diff_percent     # Относительная разница
has_discount           # Есть ли скидка
discount_percent       # Размер скидки
discount_amount        # Сумма скидки
```

### Категорийные (5)

```python
same_category          # Та же категория
same_root_category     # Та же корневая категория
category_distance      # Расстояние в дереве категорий
same_vendor            # Тот же производитель
different_vendor       # Разные производители
```

### Co-purchase (3)

```python
copurchase_count       # Сколько раз покупали вместе
copurchase_log         # log(1 + count)
copurchase_exists      # Покупали ли вместе хоть раз
```

### Популярность (7)

```python
has_image              # Есть ли картинка
is_discounted          # Сейчас со скидкой
price_bucket           # Ценовой сегмент (0-4)
name_length            # Длина названия
view_count             # Просмотры
cart_add_count         # Добавления в корзину
order_count            # Заказы
```

### Контекст корзины (3)

```python
cart_similarity_max    # Макс. сходство с товарами в корзине
cart_similarity_avg    # Среднее сходство
cart_products_count    # Количество товаров в корзине
```

## FAISS Index

```python
# core/embeddings.py
class EmbeddingsService:
    def __init__(self):
        self.index = None
        self.product_ids = []

    async def load_index(self, session):
        embeddings = await queries.get_all_embeddings(session)

        # Нормализация для cosine similarity через Inner Product
        normalized = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

        self.index = faiss.IndexFlatIP(768)  # Inner Product
        self.index.add(normalized.astype('float32'))

    def search(self, query_embedding, k=100):
        query = query_embedding / np.linalg.norm(query_embedding)
        distances, indices = self.index.search(query.reshape(1, -1), k)
        return [(self.product_ids[i], d) for i, d in zip(indices[0], distances[0])]
```

## Генерация эмбеддингов

```python
# generate_embeddings.py
async def generate_embeddings():
    products = await get_products_without_embeddings()

    for product in products:
        # Формируем текстовое представление
        text = f"""
        {product.name}
        Категория: {category_path}
        Производитель: {product.vendor or 'Не указан'}
        {(product.description or '')[:500]}
        Характеристики: {format_params(product.params)}
        """

        # Ollama API
        response = await ollama.embeddings(
            model="nomic-embed-text",
            prompt=text
        )

        # Сохраняем 768-мерный вектор
        await save_embedding(product.id, response['embedding'], text)
```

## Синтетический фидбек (cold start)

```python
# generate_synthetic_feedback.py
async def generate_synthetic_feedback():
    """
    Генерирует ~500 пар для обучения CatBoost при отсутствии реального фидбека.

    Позитивные пары:
    - Товары с высоким cosine_similarity (> 0.7)
    - Из одной или смежных категорий

    Негативные пары:
    - Товары из разных корневых категорий
    - Случайные пары (hard negatives)
    """
    positive_pairs = []
    negative_pairs = []

    # Для каждой пары категорий с высоким semantic similarity
    for cat1, cat2 in similar_category_pairs:
        products1 = await get_products_by_category(cat1)
        products2 = await get_products_by_category(cat2)

        for p1 in sample(products1, 10):
            for p2 in sample(products2, 10):
                similarity = cosine_similarity(p1.embedding, p2.embedding)
                if similarity > 0.7:
                    positive_pairs.append((p1.id, p2.id))

    # Негативные — случайные пары из разных категорий
    for _ in range(len(positive_pairs) * 3):
        p1, p2 = random.choice(all_products), random.choice(all_products)
        if p1.root_category != p2.root_category:
            negative_pairs.append((p1.id, p2.id))

    await bulk_insert_feedback(positive_pairs, negative_pairs)
```

## Сценарии White Box

```python
# services/scenarios.py
CATEGORY_IDS = {
    "floor_mixes": [25185, 30465, 30466],
    "primers": [25380, 25379, 31147, 25186],
    "buckets": [30072, 27175, 30814],
    "rollers": [30806, 30807, 30808, 30809, 30810, 30811],
    "mixers": [29165, 30654, 23622, 33927],
    "levels": [23708, 29926],
    "film": [25500, 27182, 30227],
    # ... и т.д.
}

SCENARIOS = [
    Scenario(
        id="floor",
        name="Монтаж наливного пола",
        groups=[
            ScenarioGroup("Смеси для выравнивания полов", CATEGORY_IDS["floor_mixes"], required=True),
            ScenarioGroup("Грунтовки и гидроизоляция", CATEGORY_IDS["primers"], required=True),
            ScenarioGroup("Ёмкости", CATEGORY_IDS["buckets"], required=True),
            ScenarioGroup("Валики игольчатые", CATEGORY_IDS["rollers"], required=True),
            ScenarioGroup("Миксеры строительные", CATEGORY_IDS["mixers"], required=True),
            ScenarioGroup("Уровни", CATEGORY_IDS["levels"], required=False),
            ScenarioGroup("Плёнка защитная", CATEGORY_IDS["film"], required=False),
        ]
    ),
    # ... partitions, walls, tiling, electrical
]
```

## Конфигурация

```env
# Database
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=spbtechrun

# Ollama (для генерации эмбеддингов)
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=nomic-embed-text
```

## Запуск

### Docker Compose

```bash
docker compose up -d recommendations
```

### Локально

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Обучение модели

```bash
# Генерация синтетического фидбека (если нет реального)
docker exec recommendations python -m app.generate_synthetic_feedback

# Обучение CatBoost
curl -X POST "http://localhost:8000/ml/train?iterations=500"
```

## Производительность

| Операция | Время | Примечание |
|----------|-------|------------|
| FAISS search (k=100) | ~1ms | In-memory, IndexFlatIP |
| Feature extraction | ~10ms | 39 признаков, batch queries |
| CatBoost predict (100 items) | ~50ms | CPU inference |
| Full recommendation | < 100ms | Без учёта сети |
| Model training (500 iter) | 1-5 min | Зависит от объёма данных |
| Ollama embedding | 50-200ms | Зависит от длины текста |

## Мониторинг

```
GET /stats

{
  "embeddings_loaded": 64490,
  "faiss_index_size": 64490,
  "model_status": "ready",
  "model_version": "20241204_123456",
  "total_feedback": 5230,
  "total_copurchases": 12450
}
```
