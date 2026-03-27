# Technical Design Review: Рекомендации товаров в корзине

---

## 1. Что строим

Сервис рекомендаций товаров в корзине для магазина строительных товаров. На основе содержимого корзины система автоматически определяет, какой вид работ выполняет пользователь, и рекомендует недостающие товары. Пользователь видит только список рекомендованных товаров — без сценариев, групп или прогресс-баров.

Сценарии — внутренняя сущность системы. Они создаются и редактируются администраторами, но никогда не показываются пользователю. Пользователь не выбирает сценарий явно и не знает о его существовании.

Проект пишется с нуля. Из хакатонного решения переиспользуются идеи и подходы, но не код.

### Архитектура

Два сервиса:
- **Go backend** — Data API: синхронизация каталога, хранение данных контура рекомендаций, управление сценариями, сбор событий и фидбека, отдача API клиентам.
- **Python ML service** — подбор кандидатов, ранжирование, работа с эмбеддингами, обучение моделей.

Общая PostgreSQL. Go-бэкенд владеет схемой каталога и сценариев. Python ML-сервис владеет ML-таблицами (эмбеддинги, фидбек, co-purchase, агрегаты для обучения). Оба сервиса подключаются к одной базе.

### Слои данных

Данные в системе организованы в три логических слоя:

1. **Raw events** — сырые факты: заказы, показы рекомендаций, действия пользователей. Записываются append-only, не модифицируются. Источник правды для всех вычислений.
2. **Features / Aggregates** — предрассчитанные агрегаты: product_features (статистика за 7d), copurchase_stats (lift/confidence), category_relations, scenario_group_product_stats. Пересчитываются из raw events по расписанию. Используются ML-сервисом для retrieval и формирования признаков.
3. **Online serving** — данные, загружаемые в память при старте ML-сервиса: FAISS-индекс, матрица комплементарности, модель CatBoost. Обновляются при переиндексации или переобучении.

Разделение на слои позволяет независимо обновлять агрегаты без влияния на online-сервис, а также атомарно переключаться на новую версию агрегатов (см. раздел 11.5).

---

## 2. Схема данных

### 2.1 Каталог (управляется Go-бэкендом)

```sql
-- Товары — локальная копия из ERP/источника магазина
CREATE TABLE products (
    id              INTEGER PRIMARY KEY,
    category_id     INTEGER REFERENCES categories(id),
    name            VARCHAR NOT NULL,
    price           NUMERIC(10,2),
    discount_price  NUMERIC(10,2),        -- NULL если нет акции
    vendor          VARCHAR,
    picture         VARCHAR,
    description     TEXT,
    params          JSONB,                 -- характеристики товара
    available       BOOLEAN DEFAULT true,       -- глобальная доступность товара
    created_at      TIMESTAMP DEFAULT now(),
    updated_at      TIMESTAMP DEFAULT now()
);

-- Наличие товаров по регионам — обязательная часть схемы.
-- Источник данных: TBD (уточняется). Синхронизируется Go-бэкендом.
-- Все retrieval-каналы фильтруют по in_stock = true для региона пользователя.
CREATE TABLE product_availability (
    product_id  INTEGER REFERENCES products(id),
    store_id    VARCHAR(50),                  -- ID магазина или региона
    in_stock    BOOLEAN DEFAULT true,
    quantity    INTEGER,                      -- остаток, если известен
    updated_at  TIMESTAMP DEFAULT now(),
    PRIMARY KEY (product_id, store_id)
);

-- Иерархия категорий
CREATE TABLE categories (
    id          INTEGER PRIMARY KEY,
    parent_id   INTEGER REFERENCES categories(id),
    name        VARCHAR NOT NULL
);

-- Заказы и позиции — источник co-purchase
CREATE TABLE orders (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER,
    created_at  TIMESTAMP DEFAULT now()
);

CREATE TABLE order_items (
    id          SERIAL PRIMARY KEY,
    order_id    INTEGER REFERENCES orders(id),
    product_id  INTEGER REFERENCES products(id),
    category_id INTEGER,                     -- денормализовано из products для быстрых агрегаций
    quantity    INTEGER,
    price       NUMERIC(10,2)
);

-- Предрассчитанные признаки товаров (слой Features)
-- Пересчитываются из events/orders по расписанию (раздел 11.5)
CREATE TABLE product_features (
    product_id          INTEGER PRIMARY KEY REFERENCES products(id),

    -- Абсолютные счётчики за 7 дней
    views_7d            INTEGER DEFAULT 0,
    clicks_7d           INTEGER DEFAULT 0,
    cart_adds_7d        INTEGER DEFAULT 0,
    purchases_7d        INTEGER DEFAULT 0,

    -- Рассчитанные метрики
    ctr_7d              FLOAT DEFAULT 0,       -- clicks / views
    conversion_rate_7d  FLOAT DEFAULT 0,       -- purchases / views
    popularity_score    FLOAT DEFAULT 0,       -- взвешенный агрегат (см. раздел 11.5)

    -- Общие счётчики (за всё время)
    view_count          INTEGER DEFAULT 0,
    cart_add_count      INTEGER DEFAULT 0,
    order_count         INTEGER DEFAULT 0,

    updated_at          TIMESTAMP DEFAULT now()
);
```

### 2.2 Сценарии (внутренняя сущность, управляются Go-бэкендом через админку)

```sql
CREATE TABLE scenarios (
    id          VARCHAR(50) PRIMARY KEY,
    name        VARCHAR NOT NULL,
    description TEXT,
    status      VARCHAR(20) DEFAULT 'draft',  -- draft | active | archived
    sort_order  INTEGER DEFAULT 0,
    version     INTEGER DEFAULT 1,
    created_at  TIMESTAMP DEFAULT now(),
    updated_at  TIMESTAMP DEFAULT now()
);

CREATE TABLE scenario_groups (
    id              SERIAL PRIMARY KEY,
    scenario_id     VARCHAR(50) REFERENCES scenarios(id),
    name            VARCHAR NOT NULL,           -- внутреннее название группы (для админки и логов)
    is_required     BOOLEAN DEFAULT true,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT now()
);

-- Веса категорий в группах сценариев
-- Вместо массива category_ids — отдельная таблица с весами.
-- Позволяет задать что "Плитка напольная" подходит группе "Напольное покрытие" на 1.0,
-- а "Ламинат" — на 0.8. Веса используются в retrieval и автоопределении сценария.
CREATE TABLE scenario_group_category_weights (
    group_id    INTEGER REFERENCES scenario_groups(id),
    category_id INTEGER REFERENCES categories(id),
    weight      FLOAT DEFAULT 1.0,            -- 0.0–1.0, насколько категория подходит группе
    PRIMARY KEY (group_id, category_id)
);

-- Правила совместимости (опционально, для жёстких ограничений)
CREATE TABLE compatibility_rules (
    id              SERIAL PRIMARY KEY,
    scenario_id     VARCHAR(50) REFERENCES scenarios(id),
    rule_type       VARCHAR(20),              -- 'exclude' | 'require'
    source_group_id INTEGER REFERENCES scenario_groups(id),
    target_group_id INTEGER REFERENCES scenario_groups(id),
    condition       JSONB,                    -- гибкие условия
    description     TEXT
);
```

Версионирование: при изменении сценария `version` инкрементируется. Все логи рекомендаций хранят `scenario_version`, чтобы можно было оценить эффект изменений.

Workflow для менеджеров: `draft` → редактирование групп и весов → `active` (начинает использоваться) → `archived`. Публикация происходит явно — черновик не попадает в продакшн. Статус `draft` позволяет редактировать сценарий до запуска без влияния на живые рекомендации.

### 2.3 ML-данные (управляются Python ML-сервисом)

```sql
-- Расширение pgvector (подключается один раз)
CREATE EXTENSION IF NOT EXISTS vector;

-- Эмбеддинги товаров
-- Хранение через pgvector (тип vector) вместо FLOAT[].
-- pgvector даёт: нативные операторы расстояния (<=> cosine, <#> inner product),
-- индексы (ivfflat, hnsw) для ускорения поиска прямо в БД, компактное хранение.
-- Для online-поиска по-прежнему используется FAISS (быстрее для batch-запросов),
-- но pgvector — единый формат хранения и fallback.
CREATE TABLE product_embeddings (
    product_id          INTEGER PRIMARY KEY REFERENCES products(id),
    embedding           vector(768) NOT NULL, -- 768-мерный вектор (pgvector)
    text_representation TEXT,                 -- текст, из которого генерировался вектор (надо ли?)
    model_name          VARCHAR(100),         -- "nomic-embed-text" и т.д. (надо ли?)
    created_at          TIMESTAMP DEFAULT now()
);

-- Опционально: индекс для поиска похожих товаров прямо в БД
-- Полезен как fallback если FAISS недоступен, и для ad-hoc запросов
-- CREATE INDEX idx_embeddings_ivfflat ON product_embeddings
--     USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Co-purchase статистика (пересчитывается из order_items)
CREATE TABLE copurchase_stats (
    product_id_1     INTEGER,
    product_id_2     INTEGER,
    copurchase_count INTEGER DEFAULT 0,
    confidence       FLOAT DEFAULT 0,         -- P(B | A) = copurchase_count / count(orders с A)
    lift             FLOAT DEFAULT 0,         -- P(A,B) / (P(A) * P(B)), >1 = чаще чем случайно
    updated_at       TIMESTAMP DEFAULT now(),
    PRIMARY KEY (product_id_1, product_id_2)
);
-- Пары нормализованы: product_id_1 < product_id_2
-- lift показывает, покупают ли товары вместе чаще, чем можно ожидать случайно.
-- confidence показывает вероятность покупки B при условии покупки A.
-- Оба используются как признаки ранкера и для фильтрации слабых связей.

-- Агрегат: какие товары чаще всего закрывают группу в сценарии
CREATE TABLE scenario_group_product_stats (
    scenario_id     VARCHAR(50),
    group_name      VARCHAR(100),
    product_id      INTEGER,
    times_shown     INTEGER DEFAULT 0,
    times_clicked   INTEGER DEFAULT 0,
    times_added     INTEGER DEFAULT 0,
    times_purchased INTEGER DEFAULT 0,
    updated_at      TIMESTAMP DEFAULT now(),
    PRIMARY KEY (scenario_id, group_name, product_id)
);

```

### 2.4 Логирование показов (критично для обучения)

```sql
-- Один impression = одна группа в одном запросе.
-- Один запрос рекомендаций создаёт N impressions (по одному на каждую незакрытую группу).
-- Это соответствует структуре обучения ранкера: query = (cart, scenario, group).
CREATE TABLE recommendation_impressions (
    id              BIGSERIAL PRIMARY KEY,
    request_id      VARCHAR NOT NULL,         -- общий ID запроса (группирует impressions одного вызова API)
    session_id      VARCHAR NOT NULL,
    user_id         INTEGER,
    scenario_id     VARCHAR(50) NOT NULL,
    scenario_version INTEGER,
    group_name      VARCHAR(100) NOT NULL,
    cart_snapshot    INTEGER[] NOT NULL,       -- product_ids в корзине НА МОМЕНТ ПОКАЗА
    cart_categories  INTEGER[],               -- денормализованные категории товаров корзины
    candidates      JSONB NOT NULL,           -- [{product_id, position, score, sources}]
    ranking_method  VARCHAR(20),              -- 'rrf' | 'catboost' | 'formula'
    created_at      TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_impressions_session ON recommendation_impressions(session_id, created_at);
CREATE INDEX idx_impressions_scenario ON recommendation_impressions(scenario_id, group_name);
CREATE INDEX idx_impressions_request ON recommendation_impressions(request_id);

-- Действия пользователя после показа
CREATE TABLE recommendation_actions (
    id              BIGSERIAL PRIMARY KEY,
    impression_id   BIGINT REFERENCES recommendation_impressions(id),
    product_id      INTEGER NOT NULL,
    action_type     VARCHAR(20) NOT NULL,     -- 'click' | 'add_to_cart' | 'purchase'
    position        INTEGER,                  -- позиция товара в выдаче
    created_at      TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_actions_impression ON recommendation_actions(impression_id);
CREATE INDEX idx_actions_product ON recommendation_actions(product_id, created_at);
```

### 2.5 Как работает сбор данных на практике

Схема спроектирована так, чтобы минимизировать изменения на фронтенде и не создавать нагрузки.

#### Impression (показ) — создаётся на сервере автоматически

Фронт ничего дополнительно не отправляет. Когда ML-сервис генерирует рекомендации, он сам записывает impressions: для каждой незакрытой группы определённого сценария — отдельную запись с `cart_snapshot`, `candidates`, `ranking_method`. Все impressions одного запроса объединены `request_id`. В ответе клиенту возвращается `request_id` для привязки действий.

```
Фронт: GET /api/recommendations?cart=1,2,3
  → Go-бэкенд проксирует в ML-сервис
  → ML-сервис определяет сценарий по корзине
  → ML-сервис генерирует рекомендации для каждой незакрытой группы
  → ML-сервис записывает N impressions в БД (по одному на группу, общий request_id)
  → Объединяет результаты в плоский список товаров
  ← Фронт получает список рекомендаций + request_id
```

#### Action (клик, добавление в корзину) — один лёгкий POST с фронта

Когда пользователь кликает на рекомендованный товар или добавляет его в корзину, фронт отправляет:

```
POST /api/events
{
  "request_id": "abc-123",
  "product_id": 1001,
  "action_type": "click"
}
```

Go-бэкенд находит нужный impression по `request_id` + `product_id` (товар мог быть в кандидатах нескольких групп — берётся impression с наименьшей позицией).

Это fire-and-forget: фронт не ждёт ответа, не блокирует UI. Один маленький POST на клик — нагрузка ничтожна даже при большом трафике.

Фронт отправляет на основной Go-бэкенд (тот же хост, что и остальные API), не напрямую на ML-сервис. Go-бэкенд записывает action в БД.

#### Purchase (покупка) — связывается на сервере без участия фронта

При оформлении заказа Go-бэкенд ищет, показывался ли купленный товар в рекомендациях. Привязка через `recommendation_actions`: если для товара уже есть click или add_to_cart, impression_id известен. Если нет явного действия — поиск по индексу `(product_id, created_at)` в recommendation_actions и по candidates JSONB в impressions, ограниченный session_id и окном.

```
Пользователь оформляет заказ
  → Go-бэкенд создаёт order + order_items
  → Для каждого товара в заказе:
      1. Проверить recommendation_actions: есть ли click/add_to_cart
         для этого product_id в этой сессии за последние 24ч?
         → Если да — impression_id уже известен, записать purchase.
      2. Если нет — проверить recommendation_impressions:
         SELECT id FROM recommendation_impressions
         WHERE session_id = :session
           AND created_at > now() - interval '24h'
           AND EXISTS (
               SELECT 1 FROM jsonb_array_elements(candidates) c
               WHERE (c->>'product_id')::int = :purchased_id
           )
         ORDER BY created_at DESC LIMIT 1;
         → Если найден — записать purchase с этим impression_id.
         → Если не найден — товар не был рекомендован, пропустить.
  → INSERT INTO recommendation_actions
       (impression_id, product_id, action_type, position) VALUES (...)
```

Приоритет привязки через предыдущие действия (шаг 1) снижает количество ложных совпадений: если пользователь кликнул на рекомендацию и потом купил — мы точно знаем impression. JSONB-поиск (шаг 2) — fallback для случаев, когда товар был показан, но пользователь добавил его в корзину другим способом (например, через поиск).

#### Типы собираемых сигналов

| Сигнал | Источник | Как передаётся | Ценность для обучения |
|--------|----------|----------------|----------------------|
| Impression (показ) | ML-сервис | Автоматически при генерации рекомендаций | Базовый: знаем что показали |
| Click | Фронт | `POST /api/events` (fire-and-forget) | Слабый позитив, подвержен position bias |
| Add-to-cart | Фронт | `POST /api/events` (fire-and-forget) | Средний позитив |
| Purchase | Go-бэкенд | Автоматически при оформлении заказа | Сильный позитив |
| Co-purchase | Go-бэкенд | Пересчёт из order_items по расписанию | Офлайн-сигнал для retrieval и cold start |

Неявные сигналы (click, add-to-cart, purchase) — основной источник для обучения ранкера. Co-purchase не привязан к показам, но важен для retrieval и синтетических обучающих данных на старте.

#### Что меняется на фронтенде (минимум)

1. Сохранить `request_id` из ответа на запрос рекомендаций
2. При клике на рекомендованный товар — отправить `POST /api/events` с `request_id`, `product_id`, `action_type="click"` (fire-and-forget)
3. При добавлении рекомендованного товара в корзину — то же самое с `action_type="add_to_cart"`

Всё остальное (impression, purchase linking, агрегация статистики) — на сервере.

---

## 3. Эмбеддинги товаров

### 3.1 Генерация

Для каждого товара формируется текстовое описание:

```python
def build_product_text(product) -> str:
    parts = [product.name]
    if product.category_path:
        parts.append(f"Категория: {product.category_path}")
    if product.vendor:
        parts.append(f"Производитель: {product.vendor}")
    if product.description:
        parts.append(product.description[:500])
    if product.params:
        params_text = ", ".join(f"{k}: {v}" for k, v in list(product.params.items())[:10])
        parts.append(f"Характеристики: {params_text}")
    return ". ".join(parts)
```

Текст отправляется в Ollama (`POST /api/embeddings`, модель `nomic-embed-text`). Возвращается 768-мерный вектор. Генерация ~200 товаров/мин на CPU.

### 3.2 Когда генерировать

- При первоначальной загрузке каталога — batch-генерация всех товаров
- При добавлении нового товара — генерация одного вектора, добавление в таблицу
- При существенном изменении описания товара — перегенерация

### 3.3 FAISS-индекс

При старте ML-сервиса все эмбеддинги загружаются из PostgreSQL в numpy-массив. Строится FAISS-индекс:

```python
embeddings_matrix = np.array(all_embeddings, dtype=np.float32)
faiss.normalize_L2(embeddings_matrix)  # единичная норма → IP = cosine
index = faiss.IndexFlatIP(768)
index.add(embeddings_matrix)
```

`IndexFlatIP` — точный перебор. При >1M товаров (~3 GB RAM, ~100ms поиск) заменить на `IndexIVFFlat` или `IndexHNSW` (ускорение 50–100x, потеря точности <5%).

Для горячего обновления индекса (новые товары без перезапуска):
```python
def add_product_to_index(product_id, embedding):
    vec = np.array([embedding], dtype=np.float32)
    faiss.normalize_L2(vec)
    index.add(vec)
    product_ids.append(product_id)
    product_id_to_idx[product_id] = len(product_ids) - 1
```

### 3.4 Эмбеддинги категорий

Среднее арифметическое эмбеддингов всех товаров категории. Вычисляется при старте, пересчитывается при обновлении индекса. Используется моделью комплементарности и в basket-to-item retrieval.

```python
category_embeddings = {}
for cat_id, product_ids in products_by_category.items():
    embs = [embeddings[pid] for pid in product_ids if pid in embeddings]
    if embs:
        category_embeddings[cat_id] = np.mean(embs, axis=0).astype(np.float32)
```

---

## 4. Pipeline: определение сценария по корзине

Сценарий определяется автоматически по содержимому корзины. Пользователь не выбирает сценарий — система сама решает, какой набор товаров рекомендовать. Это единственный путь определения сценария.

### 4.1 Launch-версия: покрытие с учётом весов категорий

Для каждого активного сценария считается взвешенное покрытие обязательных групп категориями товаров из корзины. Веса берутся из `scenario_group_category_weights`.

```python
def detect_scenario(cart_product_ids: list[int]) -> Optional[tuple[str, float]]:
    """Возвращает (scenario_id, confidence) или None."""

    # 1. Загрузить категории товаров корзины
    cart_categories = get_categories_for_products(cart_product_ids)

    # 2. Для каждого активного сценария посчитать взвешенное покрытие
    scores = []
    for scenario in get_active_scenarios():
        required_groups = [g for g in scenario.groups if g.is_required]
        total_weight = 0
        matched_weight = 0
        for group in required_groups:
            # Получить веса категорий для группы
            cat_weights = get_group_category_weights(group.id)  # {category_id: weight}
            best_match = 0
            for cat_id in cart_categories:
                if cat_id in cat_weights:
                    best_match = max(best_match, cat_weights[cat_id])
            total_weight += 1.0  # каждая обязательная группа = 1.0
            matched_weight += best_match

        coverage = matched_weight / max(total_weight, 1)
        scores.append((scenario.id, coverage))

    # 3. Выбрать лучший с порогом уверенности
    scores.sort(key=lambda x: x[1], reverse=True)
    if scores and scores[0][1] >= MIN_CONFIDENCE:  # например 0.2
        return scores[0]
    return None
```

`MIN_CONFIDENCE` — порог, ниже которого рекомендации не показываются (корзина не соответствует ни одному сценарию). На старте: 0.15–0.2.

### 4.2 Целевое улучшение: скоринг с дополнительными сигналами

Автоопределение — ключевой компонент, от его качества зависит релевантность всех рекомендаций. После накопления данных усиливаем:

1. **Эмбеддинг-скоринг:** считать cosine similarity между средним эмбеддингом корзины и эталонными эмбеддингами сценария (средний эмбеддинг товаров, типичных для сценария).
2. **Co-purchase сигнал:** если товары корзины часто покупаются вместе с товарами из групп сценария — это дополнительное подтверждение.
3. **Комплементарность:** категории корзины комплементарны категориям сценария → выше уверенность.
4. **Статистика по сессиям:** если пользователи с похожими корзинами чаще выбирали этот сценарий.

Итоговый score можно считать как взвешенную сумму или обучить лёгкий классификатор (LogisticRegression / small CatBoost) на данных `(cart → scenario)`, собранных за фазы 1–2.

### 4.3 Анализ корзины: определение незакрытых групп

Внутренний анализ — какие группы сценария уже закрыты товарами из корзины, а для каких нужны рекомендации. Результат не показывается пользователю, но определяет набор кандидатов для retrieval.

```python
def analyze_cart(scenario, cart_products) -> dict:
    """Определяет, для каких групп нужны рекомендации."""
    missing_groups = []

    for group in sorted(scenario.groups, key=lambda g: g.sort_order):
        group_cat_ids = get_group_category_ids(group.id)
        has_product = any(p.category_id in group_cat_ids for p in cart_products)
        if not has_product:
            missing_groups.append(group)

    return {"missing_groups": missing_groups}
```

---

## 5. Pipeline: retrieval

После определения сценария и незакрытых групп, для каждой группы собираем кандидатов из нескольких каналов параллельно. Каждый канал возвращает список `(product_id, rank_in_channel)`. Результаты по всем группам объединяются в общий пул кандидатов.

### 5.1 Канал: Group popularity

Самый простой и надёжный канал. Работает всегда, даже без эмбеддингов и истории.

```sql
SELECT p.id, p.name, p.price, p.vendor, p.discount_price,
       COALESCE(pf.popularity_score, 0) as popularity_score,
       COALESCE(pf.purchases_7d, 0) as purchases_7d,
       COALESCE(pf.cart_adds_7d, 0) as cart_adds_7d,
       COALESCE(pf.ctr_7d, 0) as ctr_7d
FROM products p
LEFT JOIN product_features pf ON p.id = pf.product_id
WHERE p.category_id = ANY(:group_category_ids)
  AND p.available = true
  AND p.id != ALL(:cart_product_ids)
ORDER BY COALESCE(pf.popularity_score, 0) DESC
LIMIT :channel_limit;  -- например 50
```

Кандидатам присваивается ранг 1..N по порядку. Канал работает с первого дня без ML-инфраструктуры.

Если подключена таблица `product_availability`, к запросу добавляется `JOIN product_availability pa ON p.id = pa.product_id AND pa.store_id = :store_id AND pa.in_stock = true`. Аналогичная фильтрация применяется во всех каналах retrieval.

### 5.2 Канал: Basket-to-item embedding

Ищет товары из категорий группы, семантически близкие к контексту корзины.

```python
def basket_embedding_retrieval(cart_embeddings, group_category_ids, limit=50):
    # 1. Средний эмбеддинг корзины
    cart_mean = np.mean(cart_embeddings, axis=0).astype(np.float32)
    cart_mean = cart_mean / (np.linalg.norm(cart_mean) + 1e-8)

    # 2. FAISS поиск по всему индексу
    k = min(500, index.ntotal)
    scores, indices = index.search(cart_mean.reshape(1, -1), k)

    # 3. Фильтрация: оставить только товары из категорий группы
    candidates = []
    for score, idx in zip(scores[0], indices[0]):
        pid = product_ids[idx]
        if pid in cart_product_ids_set:
            continue
        if products[pid].category_id not in group_category_ids:
            continue
        candidates.append((pid, score))
        if len(candidates) >= limit:
            break

    return candidates  # отсортированы по cosine similarity
```

Этот канал полезен когда в группе много товаров и нужно выбрать те, что ближе к контексту покупки. Например, для группы "Клей для плитки" — найти клей, подходящий к уже выбранной плитке по типу и назначению.

### 5.3 Канал: Co-purchase

Товары из категорий группы, которые чаще всего покупались вместе с товарами из корзины.

```sql
-- Для каждого товара в корзине найти co-purchase с товарами из категорий группы
-- Ранжируем по lift (насколько чаще покупают вместе, чем случайно), а не по абсолютной частоте
WITH copurchase_candidates AS (
    SELECT cs.product_id_2 as product_id,
           MAX(cs.lift) as max_lift,
           MAX(cs.confidence) as max_confidence,
           SUM(cs.copurchase_count) as total_copurchase
    FROM copurchase_stats cs
    JOIN products p ON p.id = cs.product_id_2
    WHERE cs.product_id_1 = ANY(:cart_product_ids)
      AND p.category_id = ANY(:group_category_ids)
      AND p.available = true
      AND p.id != ALL(:cart_product_ids)
      AND cs.lift > 1.0  -- только пары, которые покупают вместе чаще случайного
    GROUP BY cs.product_id_2

    UNION ALL

    SELECT cs.product_id_1 as product_id,
           MAX(cs.lift) as max_lift,
           MAX(cs.confidence) as max_confidence,
           SUM(cs.copurchase_count) as total_copurchase
    FROM copurchase_stats cs
    JOIN products p ON p.id = cs.product_id_1
    WHERE cs.product_id_2 = ANY(:cart_product_ids)
      AND p.category_id = ANY(:group_category_ids)
      AND p.available = true
      AND p.id != ALL(:cart_product_ids)
      AND cs.lift > 1.0
    GROUP BY cs.product_id_1
)
SELECT product_id, MAX(max_lift) as lift, MAX(max_confidence) as confidence,
       SUM(total_copurchase) as copurchase_count
FROM copurchase_candidates
GROUP BY product_id
ORDER BY MAX(max_lift) DESC
LIMIT :channel_limit;
```

Ранжирование по lift вместо абсолютной частоты позволяет находить товары, которые действительно связаны с корзиной, а не просто популярны. Например, если товар A покупают в 80% заказов — он будет в co-purchase со всем, но lift покажет, что связь неспецифична.

Самый сильный сигнал реального спроса. Если пользователь положил в корзину плитку Kerama Marazzi, а с ней чаще всего покупают клей Ceresit CM 11 — это co-purchase.

### 5.4 Канал: Complementarity

Товары из категорий, которые модель комплементарности считает дополняющими к категориям корзины.

```python
def complementarity_retrieval(cart_categories, group_category_ids, limit=50):
    # 1. Для каждой категории корзины получить complementarity score с категориями группы
    category_scores = {}
    for cart_cat in cart_categories:
        for group_cat in group_category_ids:
            score = complementarity_model.predict_score(cart_cat, group_cat)
            category_scores[group_cat] = max(
                category_scores.get(group_cat, 0), score
            )

    # 2. Отранжировать категории группы по complementarity score
    ranked_cats = sorted(category_scores.items(), key=lambda x: x[1], reverse=True)

    # 3. Из наиболее комплементарных категорий взять популярные товары
    candidates = []
    for cat_id, comp_score in ranked_cats:
        products = get_popular_products_by_category(cat_id, limit=20)
        for p in products:
            candidates.append((p.id, comp_score))
        if len(candidates) >= limit:
            break

    return candidates[:limit]
```

Этот канал полезен когда группа содержит несколько категорий с разной степенью связи с контекстом корзины. Например, в группе "Инструменты" модель может понять, что шпатели комплементарнее к штукатурке, чем валики.

### 5.5 Канал: Scenario prior

Какие товары чаще всего выбирают/покупают для закрытия этой группы в этом сценарии. Работает когда накопилась статистика.

```sql
SELECT product_id,
       times_purchased * 3 + times_added * 2 + times_clicked as weighted_score
FROM scenario_group_product_stats
WHERE scenario_id = :scenario_id
  AND group_name = :group_name
  AND product_id NOT IN (SELECT unnest(:cart_product_ids))
ORDER BY weighted_score DESC
LIMIT :channel_limit;
```

Этот канал — обратная связь от реальных пользователей. На старте пустой, но со временем становится одним из самых ценных.

### 5.6 Слияние кандидатов

Все каналы возвращают списки `(product_id, rank_in_channel)`. Слияние:

```python
def merge_candidates(channel_results: dict[str, list[tuple[int, int]]]) -> list[dict]:
    """
    channel_results: {"popularity": [(pid, rank), ...], "copurchase": [...], ...}
    """
    candidates = {}

    for channel_name, items in channel_results.items():
        for product_id, rank in items:
            if product_id not in candidates:
                candidates[product_id] = {
                    "product_id": product_id,
                    "sources": {},
                    "rrf_score": 0.0
                }
            candidates[product_id]["sources"][channel_name] = rank
            # RRF: Reciprocal Rank Fusion (Cormack et al., 2009)
            candidates[product_id]["rrf_score"] += 1.0 / (60 + rank)

    # Сортировка по RRF score
    merged = sorted(candidates.values(), key=lambda x: x["rrf_score"], reverse=True)
    return merged
```

RRF не требует нормализации скоров. `k=60` — стандартное значение из оригинальной статьи. Каждый канал вносит вклад пропорционально рангу кандидата в этом канале.

После появления ML-ранкера RRF используется только как один из fallback-режимов. Основной путь: объединить всех кандидатов, извлечь признаки, отранжировать CatBoost.

---

## 6. Pipeline: ranking

### 6.1 Два режима

**RRF-режим (фаза 0–1, fallback):** кандидаты ранжируются по RRF score из раздела 5.6. Не требует обучения.

**ML-режим (фаза 2+):** для каждого кандидата извлекаются признаки, CatBoostRanker предсказывает score.

### 6.2 Признаки ранкера

Для каждого кандидата в контексте `(корзина, сценарий, группа)` извлекаются ~30 табличных признаков. Сценарий и группа — внутренние сущности, пользователь их не видит, но они определяют набор кандидатов и используются в признаках. CatBoost работает с таблицами, корзина не подаётся как вектор.

#### Basket-candidate (взаимодействие с корзиной)

```python
def extract_basket_candidate_features(candidate, cart_products, cart_embeddings):
    cand_emb = get_embedding(candidate.id)
    features = {}

    # Косинусное сходство с корзиной
    if cand_emb is not None and cart_embeddings:
        cart_mean = np.mean(cart_embeddings, axis=0)
        similarities = [cosine_similarity(cand_emb, ce) for ce in cart_embeddings]
        features["cosine_to_cart_mean"] = cosine_similarity(cand_emb, cart_mean)
        features["cosine_to_cart_max"] = max(similarities)
        features["cosine_to_cart_min"] = min(similarities)
    else:
        features["cosine_to_cart_mean"] = 0.0
        features["cosine_to_cart_max"] = 0.0
        features["cosine_to_cart_min"] = 0.0

    # Co-purchase с товарами корзины (lift, confidence, count)
    copurchase = get_copurchase_with_products(
        candidate.id, [p.id for p in cart_products]
    )  # список {count, lift, confidence} для каждого товара корзины
    features["copurchase_with_cart_max_count"] = max((c["count"] for c in copurchase), default=0)
    features["copurchase_with_cart_sum_count"] = sum(c["count"] for c in copurchase)
    features["copurchase_max_lift"] = max((c["lift"] for c in copurchase), default=0)
    features["copurchase_max_confidence"] = max((c["confidence"] for c in copurchase), default=0)

    # Бренд
    cart_vendors = {p.vendor for p in cart_products if p.vendor}
    features["brand_in_cart"] = 1.0 if candidate.vendor in cart_vendors else 0.0

    # Цена относительно корзины
    cart_prices = [p.price for p in cart_products if p.price]
    if cart_prices:
        features["price_vs_cart_median"] = candidate.price / np.median(cart_prices)
    else:
        features["price_vs_cart_median"] = 1.0

    return features
```

#### Retrieval-source (из какого канала)

```python
def extract_retrieval_features(candidate_sources: dict[str, int]):
    channels = ["popularity", "copurchase", "embedding", "complementarity", "scenario_prior"]
    features = {}
    for ch in channels:
        features[f"from_{ch}"] = 1.0 if ch in candidate_sources else 0.0
        features[f"rank_{ch}"] = candidate_sources.get(ch, 0)
    features["num_sources"] = len(candidate_sources)
    features["rrf_score"] = sum(1.0 / (60 + r) for r in candidate_sources.values())
    return features
```

#### Candidate (свойства товара)

```python
def extract_candidate_features(candidate, scenario_id, group_name):
    # Признаки из product_features (предрассчитанные агрегаты)
    pf = get_product_features(candidate.id)
    features = {
        "price": candidate.price or 0,
        "has_discount": 1.0 if candidate.discount_price else 0.0,
        "discount_percent": 0.0,
        "popularity_score": pf.popularity_score if pf else 0,
        "ctr_7d": pf.ctr_7d if pf else 0,
        "conversion_rate_7d": pf.conversion_rate_7d if pf else 0,
        "purchases_7d_log": np.log1p(pf.purchases_7d) if pf else 0,
        "has_image": 1.0 if candidate.picture else 0.0,
    }

    if candidate.discount_price and candidate.price:
        features["discount_percent"] = (
            (candidate.price - candidate.discount_price) / candidate.price
        )

    # Scenario group stats — как часто этот товар выбирали в этой группе
    stats = get_scenario_group_product_stats(scenario_id, group_name, candidate.id)
    if stats:
        features["group_purchase_rate"] = (
            (stats.times_purchased + 1) / (stats.times_shown + 2)
        )
        features["group_add_rate"] = (
            (stats.times_added + 1) / (stats.times_shown + 2)
        )
    else:
        features["group_purchase_rate"] = 0.5  # нейтральный prior
        features["group_add_rate"] = 0.5

    # Комплементарность с категориями корзины
    features["complementarity_score"] = get_max_complementarity_with_cart(
        candidate.category_id, cart_category_ids
    )

    return features
```

#### Итого: ~31 признак

| Группа | Признаки | Кол-во |
|--------|----------|--------|
| Basket-candidate | cosine_to_cart_mean/max/min, copurchase_max/sum_count, copurchase_max_lift, copurchase_max_confidence, brand_in_cart, price_vs_cart_median | 9 |
| Retrieval-source | from_* (5 каналов), rank_* (5 каналов), num_sources, rrf_score | 12 |
| Candidate | price, discount, popularity_score, ctr_7d, conversion_rate_7d, purchases_7d_log, image, group_purchase_rate, group_add_rate, complementarity_score | 10 |

Нейросети не нужны. CatBoost на табличных признаках — стандарт для structured data (быстрее, интерпретируемее, не хуже по качеству).

### 6.3 CatBoost: конфигурация

```python
from catboost import CatBoostRanker, Pool

model = CatBoostRanker(
    loss_function="YetiRank",
    eval_metric="NDCG:top=10",
    iterations=500,
    learning_rate=0.05,
    depth=6,
    random_seed=42,
    use_best_model=True,
    verbose=50,
)
```

YetiRank — loss function, оптимизирующая порядок (NDCG), а не точность отдельного предсказания. Модель учится: "из этих кандидатов в этом контексте какой должен быть выше".

### 6.4 Inference

```python
def rank_candidates(candidates_with_features: list[dict]) -> list[dict]:
    if not model:
        return candidates_with_features  # fallback: вернуть в порядке RRF

    feature_matrix = np.array([c["features"] for c in candidates_with_features])
    raw_scores = model.predict(feature_matrix)

    # Нормализация в [0, 1]
    min_s, max_s = raw_scores.min(), raw_scores.max()
    if max_s - min_s > 0:
        normalized = (raw_scores - min_s) / (max_s - min_s)
    else:
        normalized = np.full_like(raw_scores, 0.5)

    for i, candidate in enumerate(candidates_with_features):
        candidate["score"] = float(normalized[i])

    return sorted(candidates_with_features, key=lambda c: c["score"], reverse=True)
```

### 6.5 Жёсткие правила поверх ML

После ML-ранжирования применяется слой бизнес-правил:

```python
def apply_rules(ranked_candidates, cart_products, scenario_id, group):
    rules = get_compatibility_rules(scenario_id, group.id)

    filtered = []
    for candidate in ranked_candidates:
        excluded = False
        for rule in rules:
            if rule.rule_type == "exclude" and matches_condition(rule, candidate, cart_products):
                excluded = True
                break
        if not excluded:
            filtered.append(candidate)

    return filtered
```

Правила хранятся в `compatibility_rules` и редактируются через админку. Пример: "Если в корзине цементная штукатурка, не рекомендовать гипсовые шпатлёвки".

### 6.6 Формирование итогового списка

Пользователь видит один плоский список рекомендаций. Внутри система обрабатывает каждую незакрытую группу отдельно (retrieval → ranking → rules), а затем объединяет результаты:

```python
def build_final_recommendations(scenario, missing_groups, cart_products, limit=20):
    all_candidates = []

    for group in missing_groups:
        # Полный pipeline для группы: retrieval → merge → rank → rules
        group_candidates = process_group(group, scenario, cart_products)
        for c in group_candidates:
            c["_group_name"] = group.name  # для логирования, не для пользователя
        all_candidates.extend(group_candidates)

    # Дедупликация: если товар попал в кандидаты нескольких групп — оставить с лучшим score
    seen = {}
    for c in all_candidates:
        pid = c["product_id"]
        if pid not in seen or c["score"] > seen[pid]["score"]:
            seen[pid] = c
    unique = sorted(seen.values(), key=lambda c: c["score"], reverse=True)

    return unique[:limit]
```

Внутри каждой группы ранжирование происходит в контексте `(cart, scenario, group)`. Между группами товары сравниваются по абсолютному score. При необходимости можно добавить диверсификацию: чередовать товары из разных групп, чтобы рекомендации не были однобокими.

---

## 7. Модель комплементарности категорий

### 7.1 Задача

Предсказать, насколько две категории товаров дополняют друг друга. Семантические эмбеддинги плохо справляются с этим: "штукатурка" и "шпатель" семантически далеки, но для ремонта неотделимы.

### 7.2 Архитектура

`LogisticRegression` (scikit-learn), вход — конкатенация признаков пары категорий.

Feature vector для пары категорий (размерность `4 × 768 + 1 = 3073`):

```python
def create_category_pair_features(emb1, emb2):
    emb1_norm = emb1 / (np.linalg.norm(emb1) + 1e-8)
    emb2_norm = emb2 / (np.linalg.norm(emb2) + 1e-8)
    diff    = emb1_norm - emb2_norm
    product = emb1_norm * emb2_norm
    cosine  = np.array([np.dot(emb1_norm, emb2_norm)])
    return np.concatenate([emb1_norm, emb2_norm, diff, product, cosine])
```

Обучение: `StandardScaler` → `LogisticRegression(C=1.0, class_weight='balanced', max_iter=1000)`. Разбивка 80/20, stratify=y.

### 7.3 Обучающие данные

CSV-файл с размеченными парами: `category_id_1, category_id_2, is_complementary, relation_type`. Размечается вручную или выводится из co-purchase статистики: если категории часто покупаются вместе → complementary.

### 7.4 Хранение результатов: category_relations

Результаты модели сохраняются в таблицу. Для каждой пары хранится источник сигнала (`source`) — это помогает в отладке, explainability и смешивании сигналов из разных источников.

```sql
CREATE TABLE category_relations (
    category_id          INTEGER,
    related_category_id  INTEGER,
    score                FLOAT NOT NULL,       -- предсказанная комплементарность
    source               VARCHAR(20) NOT NULL,  -- 'ml' | 'heuristic' | 'manual' | 'copurchase'
    updated_at           TIMESTAMP DEFAULT now(),
    PRIMARY KEY (category_id, related_category_id)
);
```

Источники `source`:
- `ml` — предсказание модели LogisticRegression
- `copurchase` — автоматически из co-purchase статистики категорий (если категории покупаются вместе чаще порога)
- `heuristic` — правила, заданные экспертами предметной области
- `manual` — ручная разметка через админ-панель

При загрузке в online-слой таблица читается в in-memory dict `(cat1, cat2) → float` для мгновенного lookup. При наличии нескольких source для одной пары берётся максимальный score (или приоритет: manual > heuristic > ml > copurchase).

### 7.5 Использование

1. **В retrieval** — канал Complementarity (раздел 5.4)
2. **В признаках ранкера** — `complementarity_score` как один из candidate features
3. **В автоопределении сценария** — дополнительный сигнал к покрытию групп (будущее улучшение)

---

## 8. Обучение ранкера

### 8.1 Структура обучающей выборки

Каждый пример: "при таком состоянии корзины, в таком сценарии, для такой группы — насколько хорош этот кандидат".

```python
@dataclass
class TrainingExample:
    query_id: str       # hash(session_id, scenario_id, group_name, sorted(cart_snapshot))
    features: np.array  # ~31 признак
    label: int          # 0-3 graded relevance
    position: int       # позиция в выдаче (для position bias correction)
```

**Метка релевантности:**
- 3 = покупка после показа
- 2 = добавление в корзину
- 1 = клик
- 0 = показан, но проигнорирован

### 8.2 Сборка датасета из логов

```python
def build_training_dataset():
    """Собирает датасет из recommendation_impressions + recommendation_actions."""

    examples = []

    for impression in get_recent_impressions(days=30):
        # Восстановить контекст запроса
        cart_products = get_products_by_ids(impression.cart_snapshot)
        cart_embeddings = get_embeddings(impression.cart_snapshot)

        # Получить действия пользователя для этого показа
        actions = get_actions_for_impression(impression.id)
        action_map = {a.product_id: a.action_type for a in actions}

        # Для каждого показанного кандидата
        for candidate_info in impression.candidates:
            product = get_product(candidate_info["product_id"])

            # Метка
            action = action_map.get(product.id)
            if action == "purchase":
                label = 3
            elif action == "add_to_cart":
                label = 2
            elif action == "click":
                label = 1
            else:
                label = 0

            # Признаки
            features = extract_all_features(
                candidate=product,
                cart_products=cart_products,
                cart_embeddings=cart_embeddings,
                candidate_sources=candidate_info["sources"],
                scenario_id=impression.scenario_id,
                group_name=impression.group_name,
            )

            examples.append(TrainingExample(
                query_id=make_query_id(impression),
                features=features,
                label=label,
                position=candidate_info["position"],
            ))

    # Добавить hard negatives: случайные товары из группы, не попавшие в показ
    examples += generate_hard_negatives(examples, ratio=3)

    return examples
```

### 8.3 Hard negatives

Для каждого query берём случайные товары из категорий группы, которые не были показаны. Им присваивается label=0. Это заставляет модель различать "средний товар из группы" от "хорошего кандидата для этой корзины".

```python
def generate_hard_negatives(positive_examples, ratio=3):
    negatives = []
    queries = group_by_query(positive_examples)

    for query_id, query_examples in queries.items():
        scenario_id, group_name = parse_query(query_id)
        shown_ids = {e.product_id for e in query_examples}
        group_category_ids = get_group_categories(scenario_id, group_name)

        # Случайные товары из категорий группы
        pool = get_random_products_by_categories(
            group_category_ids,
            exclude=shown_ids,
            limit=len(query_examples) * ratio
        )

        for product in pool:
            features = extract_all_features(...)
            negatives.append(TrainingExample(
                query_id=query_id,
                features=features,
                label=0,
                position=0,  # не показывался
            ))

    return negatives
```

### 8.4 Обучение CatBoost

```python
def train_scenario_ranker(examples: list[TrainingExample]):
    # Группировка по query_id (обязательно для LTR)
    query_ids = [e.query_id for e in examples]
    unique_queries = sorted(set(query_ids))

    # Split 80/20 по query, не по примерам
    train_queries = unique_queries[:int(len(unique_queries) * 0.8)]
    val_queries = set(unique_queries) - set(train_queries)

    train_examples = [e for e in examples if e.query_id in train_queries]
    val_examples = [e for e in examples if e.query_id in val_queries]

    # Сортировка по group_id (требование CatBoost)
    train_examples.sort(key=lambda e: e.query_id)
    val_examples.sort(key=lambda e: e.query_id)

    # Features: добавить position для position bias correction
    train_features = np.array([
        np.append(e.features, e.position) for e in train_examples
    ])
    train_labels = [e.label for e in train_examples]
    train_groups = compute_group_sizes(train_examples)

    train_pool = Pool(
        data=train_features,
        label=train_labels,
        group_id=[e.query_id for e in train_examples],
    )
    val_pool = Pool(
        data=val_features,
        label=val_labels,
        group_id=[e.query_id for e in val_examples],
    )

    model = CatBoostRanker(
        loss_function="YetiRank",
        eval_metric="NDCG:top=10",
        iterations=500,
        learning_rate=0.05,
        depth=6,
        random_seed=42,
        use_best_model=True,
    )
    model.fit(train_pool, eval_set=val_pool)

    return model
```

### 8.5 Position bias correction

При обучении `position` добавляется как дополнительный признак. Модель учится, что товары на позиции 1 кликают чаще, и компенсирует это.

При inference `position` фиксируется в 1 для всех кандидатов:

```python
# При inference:
features_with_position = np.append(features, 1)  # position = 1 для всех
score = model.predict([features_with_position])[0]
```

Альтернатива — Inverse Propensity Scoring: взвесить примеры обратной вероятностью показа на данной позиции. Но position-as-feature проще в реализации и работает на практике.

### 8.6 Персистентность модели

```
models/
  scenario_ranker_{YYYYMMDD_HHMMSS}.cbm          # CatBoost binary
  scenario_ranker_{YYYYMMDD_HHMMSS}_metadata.json # метрики, гиперпараметры
```

При переобучении новая модель сохраняется рядом. Загрузка — последняя по дате. Старые модели остаются для сравнения и отката.

---

## 9. Cold start: поэтапный запуск

### Фаза 0 — до запуска продукта

**Что работает:** retrieval из всех каналов, слияние через RRF. Нет ML-ранкера.

**Что делаем заранее:**
1. Загрузить каталог товаров и сгенерировать эмбеддинги
2. Посчитать co-purchase из истории заказов магазина
3. Обучить модель комплементарности на размеченных парах категорий
4. Настроить сценарии в БД
5. Сгенерировать синтетические примеры для scenario_group_product_stats из co-purchase:

```python
def generate_synthetic_prior():
    """Если A и B часто покупаются вместе, и B входит в группу сценария —
    записать B как 'хороший товар для этой группы'."""
    for scenario in get_active_scenarios():
        for group in scenario.groups:
            for cat_id in get_group_category_ids(group.id):
                products = get_products_by_category(cat_id)
                for product in products:
                    # Посчитать co-purchase с любыми товарами из других групп сценария
                    copurchase_sum = get_copurchase_with_scenario(product.id, scenario, group)
                    if copurchase_sum > 0:
                        upsert_group_stats(
                            scenario.id, group.name, product.id,
                            times_shown=copurchase_sum,  # синтетический "показ"
                            times_purchased=copurchase_sum  # синтетическая "покупка"
                        )
```

### Фаза 1 — запуск (2–4 недели)

**Что работает:** RRF-ранкер в проде. Пользователи получают рекомендации.

**Что собираем:** impression + action логи. Каждый показ рекомендации записывается в `recommendation_impressions` с `cart_snapshot`. Каждое действие — в `recommendation_actions`.

### Фаза 2 — первый ML-ранкер

Когда накопилось достаточно данных (ориентир: ~1000 impression с хотя бы одним действием), обучаем CatBoost на логах.

A/B тест: 90% трафика на RRF, 10% на ML. Сравниваем CTR, add-to-cart rate, conversion по сценариям. Постепенно увеличиваем долю ML.

### Фаза 3 — итерации

Регулярное переобучение (например, раз в неделю). Расширение набора признаков. Эксперименты с каналами retrieval. Добавление новых сигналов по мере их появления.

---

## 10. Альтернативы (замена товара в корзине)

Альтернативы — вспомогательный режим. Пользователь хочет заменить товар в корзине на аналог (другой бренд, другая цена). Используют ту же инфраструктуру retrieval и ranking.

### 10.1 Когда показывать

- Пользователь запросил "Показать похожие" для конкретного товара в корзине
- Интерфейс предлагает альтернативы при просмотре товара

### 10.2 Retrieval альтернатив

Для товара `current` гибридный подбор из нескольких источников:

```python
def retrieve_alternatives(current_product, cart_products, limit=10):
    candidates = {}

    # 1. Embedding similarity — семантически похожие товары из той же категории
    current_emb = get_embedding(current_product.id)
    if current_emb is not None:
        similar = faiss_search_in_categories(
            current_emb, [current_product.category_id], k=30
        )
        for pid, sim_score in similar:
            if pid != current_product.id:
                candidates[pid] = {"embedding_sim": sim_score}

    # 2. Co-purchase overlap — товары, которые покупают вместо текущего
    copurchase_alts = get_copurchase_alternatives(
        current_product.id, [current_product.category_id], limit=20
    )
    for pid, lift in copurchase_alts:
        if pid not in candidates:
            candidates[pid] = {}
        candidates[pid]["copurchase_lift"] = lift

    # 3. Popularity fallback — популярные товары из той же категории
    popular = get_popular_in_categories(
        [current_product.category_id], exclude=[current_product.id], limit=20
    )
    for pid, pop_score in popular:
        if pid not in candidates:
            candidates[pid] = {}
        candidates[pid]["popularity"] = pop_score

    return candidates
```

### 10.3 Ранжирование альтернатив

Альтернативы ранжируются тем же CatBoostRanker, но с дополнительными признаками:

```python
def extract_alternative_features(alternative, current_product, cart_products):
    base = extract_basket_candidate_features(alternative, cart_products, cart_embeddings)

    # Сходство с заменяемым товаром
    alt_emb = get_embedding(alternative.id)
    cur_emb = get_embedding(current_product.id)
    base["sim_to_current"] = cosine_similarity(alt_emb, cur_emb) if (alt_emb is not None and cur_emb is not None) else 0

    # Ценовые признаки относительно текущего
    if current_product.price:
        base["price_ratio_to_current"] = alternative.price / current_product.price
        base["is_cheaper"] = 1.0 if alternative.price < current_product.price else 0.0
    else:
        base["price_ratio_to_current"] = 1.0
        base["is_cheaper"] = 0.0

    # Другой бренд (диверсификация)
    base["different_brand"] = 1.0 if alternative.vendor != current_product.vendor else 0.0

    return base
```

Пока ML-ранкер не обучен на данных об альтернативах, используется формульный скоринг:
`score = 0.4 * embedding_sim + 0.3 * popularity_norm + 0.2 * (1 if different_brand) + 0.1 * copurchase_lift_norm`

### 10.4 API альтернатив

```
GET /api/alternatives?product_id=456&cart=1,2,3
```

Возвращает список альтернатив с `request_id` для логирования. Фидбек собирается тем же механизмом (`POST /api/events`).

---

## 11. Go-бэкенд

### 11.1 Ответственность

Go-бэкенд — Data API и точка входа для клиентов:

1. **Каталог:** синхронизация товаров, категорий, цен, акций из внешнего источника (ERP/1С). Хранение локальной копии в PostgreSQL.
2. **Сценарии:** CRUD через админ-панель (внутренний интерфейс). Хранение в БД, версионирование.
3. **Заказы:** приём и хранение заказов. Источник данных для co-purchase.
4. **События:** приём action событий от клиента, запись в БД.
5. **Proxy:** проксирование запросов рекомендаций в Python ML-сервис.

### 11.2 API

**Каталог:**

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/api/products` | Список товаров с фильтрацией |
| GET | `/api/products/:id` | Детали товара |
| GET | `/api/categories` | Иерархия категорий |

**Рекомендации (proxy → ML-сервис):**

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/api/recommendations?cart=1,2,3` | Рекомендации товаров по корзине |
| GET | `/api/alternatives?product_id=456&cart=1,2,3` | Альтернативы для товара |

**События:**

| Метод | Путь | Назначение |
|-------|------|------------|
| POST | `/api/events` | click/add_to_cart |

**Админка (внутренний интерфейс, не для клиентов):**

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/api/admin/scenarios` | Список сценариев |
| GET | `/api/admin/scenarios/:id` | Детали сценария с группами |
| POST | `/api/admin/scenarios` | Создание сценария |
| PUT | `/api/admin/scenarios/:id` | Обновление сценария |

### 11.3 Синхронизация каталога

Источник — Oracle БД магазина. Go-бэкенд получает события об изменениях в каталоге (новые товары, изменение цен, изменение наличия) и обновляет локальные таблицы почти в реальном времени.

```
Oracle БД → событие об изменении → Go-бэкенд
  → UPDATE products (цена, наличие, описание)
  → если новый товар или изменилось описание:
      POST /embeddings/generate → ML-сервис генерирует эмбеддинг
  → если изменилось наличие по региону:
      UPDATE product_availability
```

Региональные стоки (`product_availability`) синхронизируются из отдельного источника (TBD). Формат и частота обновления уточняются.

### 11.4 Пересчёт co-purchase

Периодическая задача (ежедневно или по расписанию). Считает не только частоту совместных покупок, но и lift и confidence:

```sql
WITH pairs AS (
    SELECT
        LEAST(oi1.product_id, oi2.product_id) AS product_id_1,
        GREATEST(oi1.product_id, oi2.product_id) AS product_id_2,
        COUNT(DISTINCT oi1.order_id) AS co_count
    FROM order_items oi1
    JOIN order_items oi2
        ON oi1.order_id = oi2.order_id
       AND oi1.product_id < oi2.product_id
    GROUP BY 1, 2
),
product_counts AS (
    SELECT product_id, COUNT(DISTINCT order_id) AS cnt
    FROM order_items
    GROUP BY product_id
),
total AS (
    SELECT COUNT(DISTINCT order_id) AS total FROM order_items
)
INSERT INTO copurchase_stats (product_id_1, product_id_2, copurchase_count, confidence, lift)
SELECT
    p.product_id_1,
    p.product_id_2,
    p.co_count,
    -- confidence: P(B | A) — вероятность покупки B если купили A
    p.co_count::float / pc1.cnt,
    -- lift: P(A,B) / (P(A) * P(B)) — покупают ли вместе чаще, чем случайно
    (p.co_count::float / t.total) / ((pc1.cnt::float / t.total) * (pc2.cnt::float / t.total))
FROM pairs p
JOIN product_counts pc1 ON p.product_id_1 = pc1.product_id
JOIN product_counts pc2 ON p.product_id_2 = pc2.product_id
CROSS JOIN total t
WHERE p.co_count >= 3  -- отсечь случайные совпадения
ON CONFLICT (product_id_1, product_id_2)
DO UPDATE SET
    copurchase_count = EXCLUDED.copurchase_count,
    confidence = EXCLUDED.confidence,
    lift = EXCLUDED.lift,
    updated_at = now();
```

Фильтр `co_count >= 3` убирает шум от случайных совпадений. Пары с `lift > 1` покупаются вместе чаще, чем можно ожидать случайно — это и есть ценный сигнал.

### 11.5 Пересчёт product_features

Периодическая задача. Агрегирует статистику из событий и заказов за скользящее окно 7 дней:

```sql
WITH event_agg AS (
    SELECT
        (c->>'product_id')::int AS product_id,
        COUNT(*) FILTER (WHERE ri.id IS NOT NULL) AS views_7d,
        COUNT(*) FILTER (WHERE ra.action_type = 'click') AS clicks_7d,
        COUNT(*) FILTER (WHERE ra.action_type = 'add_to_cart') AS cart_adds_7d
    FROM recommendation_impressions ri,
         jsonb_array_elements(ri.candidates) AS c
    LEFT JOIN recommendation_actions ra
        ON ra.impression_id = ri.id AND ra.product_id = (c->>'product_id')::int
    WHERE ri.created_at >= now() - interval '7 days'
    GROUP BY (c->>'product_id')::int
),
purchase_agg AS (
    SELECT product_id, COUNT(*) AS purchases_7d
    FROM order_items
    WHERE created_at >= now() - interval '7 days'
    GROUP BY product_id
)
INSERT INTO product_features (
    product_id, views_7d, clicks_7d, cart_adds_7d, purchases_7d,
    ctr_7d, conversion_rate_7d, popularity_score, updated_at
)
SELECT
    COALESCE(e.product_id, p.product_id) AS product_id,
    COALESCE(e.views_7d, 0),
    COALESCE(e.clicks_7d, 0),
    COALESCE(e.cart_adds_7d, 0),
    COALESCE(p.purchases_7d, 0),
    CASE WHEN COALESCE(e.views_7d, 0) > 0
         THEN e.clicks_7d::float / e.views_7d ELSE 0 END,
    CASE WHEN COALESCE(e.views_7d, 0) > 0
         THEN COALESCE(p.purchases_7d, 0)::float / e.views_7d ELSE 0 END,
    -- Взвешенный popularity_score
    0.1 * COALESCE(e.views_7d, 0) +
    0.3 * COALESCE(e.clicks_7d, 0) +
    0.7 * COALESCE(e.cart_adds_7d, 0) +
    1.0 * COALESCE(p.purchases_7d, 0),
    now()
FROM event_agg e
FULL OUTER JOIN purchase_agg p ON e.product_id = p.product_id
ON CONFLICT (product_id)
DO UPDATE SET
    views_7d = EXCLUDED.views_7d,
    clicks_7d = EXCLUDED.clicks_7d,
    cart_adds_7d = EXCLUDED.cart_adds_7d,
    purchases_7d = EXCLUDED.purchases_7d,
    ctr_7d = EXCLUDED.ctr_7d,
    conversion_rate_7d = EXCLUDED.conversion_rate_7d,
    popularity_score = EXCLUDED.popularity_score,
    updated_at = now();
```

Веса в `popularity_score` (0.1 / 0.3 / 0.7 / 1.0) — начальная эвристика, подбираются эмпирически.

### 11.6 Атомарное обновление агрегатов

При пересчёте агрегатных таблиц (`product_features`, `copurchase_stats`, `category_relations`) нужно избегать ситуации, когда ML-сервис читает данные в процессе обновления.

Паттерн атомарного переключения:

1. Пересчитать новую версию во временную таблицу: `copurchase_stats_new`
2. В одной транзакции: `ALTER TABLE copurchase_stats RENAME TO copurchase_stats_old; ALTER TABLE copurchase_stats_new RENAME TO copurchase_stats;`
3. Удалить старую таблицу: `DROP TABLE copurchase_stats_old;`

Для in-memory структур (FAISS-индекс, матрица комплементарности): ML-сервис перечитывает данные из БД и атомарно подменяет ссылку на новый объект. Старый объект удаляется сборщиком мусора.

```python
def refresh_copurchase_cache():
    new_data = load_copurchase_from_db()  # читаем новую таблицу
    global copurchase_cache
    copurchase_cache = new_data           # атомарная подмена ссылки
```

Этот подход гарантирует, что сервис всегда работает с консистентным снимком данных.

---

## 12. ML-сервис: API

### 12.1 Эндпоинты

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/recommendations` | Основной: рекомендации по корзине |
| GET | `/alternatives` | Альтернативы для товара |
| POST | `/ml/train` | Переобучение ранкера |
| GET | `/ml/model-info` | Статус модели |
| POST | `/embeddings/generate` | Генерация эмбеддинга для нового товара |
| GET | `/health` | Health check |

### 12.2 Основной запрос: рекомендации по корзине

**Request:**
```
GET /recommendations?cart_product_ids=123,456,789&limit=20
```

**Response:**
```json
{
  "request_id": "abc-123",
  "recommendations": [
    {
      "product_id": 1001,
      "name": "Шпатель стальной 200мм",
      "price": 350,
      "score": 0.87,
      "position": 1
    },
    {
      "product_id": 2005,
      "name": "Грунтовка Ceresit CT 17",
      "price": 890,
      "score": 0.82,
      "position": 2
    }
  ],
  "ranking_method": "catboost"
}
```

### 12.3 Инициализация при старте

```python
async def startup():
    await init_db()
    scenarios = await load_scenarios_from_db()
    await load_embeddings_and_build_faiss_index()
    await compute_category_embeddings()
    load_complementarity_model()
    load_scenario_ranker()     # последняя .cbm модель
```

---

## 13. Производительность

### 13.1 Оценка latency для целевого pipeline

| Операция | Оценка | Примечание |
|----------|--------|------------|
| Загрузка сценария из БД | <1ms | Можно кэшировать |
| Анализ корзины (completed/missing) | <1ms | In-memory |
| Retrieval: 5 каналов параллельно | 20–50ms | SQL + FAISS |
| Feature extraction (200 кандидатов) | 10–20ms | Batch SQL |
| CatBoost predict (200 кандидатов) | ~50ms | CPU |
| RRF scoring (без ML) | <1ms | In-memory |
| Полный цикл (1 группа, ML) | 80–120ms | |
| Полный цикл (5–8 групп, параллельно) | 100–200ms | |

### 13.2 Масштабирование

| Масштаб каталога | FAISS RAM | FAISS поиск | Рекомендация |
|-----------------|-----------|-------------|------|
| 90k товаров (текущий) | ~270 MB | ~1ms | IndexFlatIP достаточен |
| 500k товаров (целевой) | ~1.5 GB | ~50ms | Пограничный — при деградации перейти на IndexIVFFlat |
| 1M товаров | ~3 GB | ~100ms | Нужен IVFFlat/HNSW |

---

## 14. Принятые решения и открытые вопросы

### Принятые решения

| Вопрос | Решение |
|--------|---------|
| Источник каталога | Oracle БД магазина. Синхронизация через события, почти real-time. |
| История заказов | Доступна, можно использовать регулярно для пересчёта co-purchase. |
| Масштаб каталога | Сейчас ~90k товаров, целевой максимум ~500k. |
| Владелец сценариев | Менеджеры магазина через админку. Поддержка статуса `draft` обязательна. |
| Корзины и сессии | Доступны. session_id можно использовать для привязки impressions. |
| Региональные стоки | Нужно учитывать наличие по регионам. `product_availability` — обязательная часть схемы. Источник данных: TBD (предстоит найти). |
| Эмбеддинги | Ollama + nomic-embed-text. |
| Дедупликация | Если товар подходит нескольким группам — показывать один раз с наибольшим score. Реализовано в разделе 6.6. |

### Открытые вопросы

1. **Минимальный размер корзины:** при какой корзине начинать показывать рекомендации? (1 товар? 2+?) Влияет на качество автоопределения сценария.
2. **Источник региональных стоков:** откуда брать данные о наличии по регионам? Формат, частота обновления?

---

*Документ описывает техническую реализацию системы рекомендаций товаров в корзине. Сценарии — скрытая внутренняя сущность, пользователь видит только рекомендованные товары. Основан на анализе хакатонного решения SpbTechRun, исследовании индустриальных подходов (Home Depot, Leroy Merlin, Alibaba, Pinterest) и целевом видении продукта.*
