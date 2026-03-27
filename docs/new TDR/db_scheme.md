# Схема данных: рекомендации товаров в корзине

Все таблицы хранятся в одной PostgreSQL. Разделены на две группы:

- **Данные рабочей БД** — получаем из Oracle на старте копией, обновляем через события 
- **Наши таблицы** — создаём и заполняем сами на основе полученных данных

---

## Часть 1: Данные из рабочей БД

Источник: Oracle БД магазина. Синхронизация через события.

---

### `products` — товары

Локальная копия каталога магазина.

| Поле | Тип | Описание |
|------|-----|----------|
| id | integer, PK | ID товара (из системы магазина) |
| category_id | integer, FK → categories | Категория товара |
| name | text | Название |
| price | decimal | Цена |
| discount_price | decimal, nullable | Цена со скидкой, NULL если акции нет |
| vendor | text | Производитель / бренд |
| description | text | Описание товара |
| params | jsonb | Характеристики товара (ключ-значение) |
| available | boolean | Глобальная доступность (не учитывает регион) |
| created_at | timestamp | |
| updated_at | timestamp | |

---

### `categories` — иерархия категорий

| Поле | Тип | Описание |
|------|-----|----------|
| id | integer, PK | ID категории |
| parent_id | integer, FK → categories, nullable | Родительская категория |
| name | text | Название |

---

### `orders` — заказы

| Поле | Тип | Описание |
|------|-----|----------|
| id | integer, PK | ID заказа |
| user_id | integer, nullable | ID пользователя |
| created_at | timestamp | Дата заказа |

---

### `order_items` — позиции заказов

Источник для расчёта co-purchase статистики.

| Поле | Тип | Описание |
|------|-----|----------|
| id | integer, PK | |
| order_id | integer, FK → orders | |
| product_id | integer, FK → products | |
| category_id | integer | Денормализовано из products для быстрых агрегаций |
| quantity | integer | Количество |
| price | decimal | Цена на момент покупки |

> `category_id` дублируется сюда чтобы при агрегациях не делать JOIN с products.

---

### `product_availability` — региональные остатки

| Поле | Тип | Описание |
|------|-----|----------|
| product_id | integer, PK+FK → products | |
| store_id | text, PK | ID магазина или региона |
| in_stock | boolean | Есть в наличии |
| quantity | integer, nullable | Остаток, если известен |
| updated_at | timestamp | |

Все retrieval-каналы фильтруют по `in_stock = true` для региона пользователя.

---

## Часть 2: Наши таблицы

Создаём и заполняем сами. Делятся на 4 подгруппы:

- **Агрегаты** — считаются из внешних данных по расписанию
- **ML-артефакты** — генерируются ML-сервисом
- **Конфигурация** — сценарии, группы, правила (заполняются через админку)
- **Логи рекомендаций** — показы и действия пользователей

---

### Агрегаты

---

#### `product_features` — поведенческие признаки товаров

Пересчитываются ежедневно из `recommendation_impressions`, `recommendation_actions` и `order_items`.

| Поле | Тип | Описание |
|------|-----|----------|
| product_id | integer, PK+FK → products | |
| views_7d | integer | Количество показов за 7 дней |
| clicks_7d | integer | Количество кликов за 7 дней |
| cart_adds_7d | integer | Добавлений в корзину за 7 дней |
| purchases_7d | integer | Покупок за 7 дней |
| ctr_7d | float | clicks / views за 7 дней |
| conversion_rate_7d | float | purchases / views за 7 дней |
| popularity_score | float | Взвешенный агрегат: 0.1×views + 0.3×clicks + 0.7×cart_adds + 1.0×purchases |
| view_count | integer | Показов за всё время |
| cart_add_count | integer | Добавлений в корзину за всё время |
| order_count | integer | Покупок за всё время |
| updated_at | timestamp | |

---

#### `copurchase_stats` — статистика совместных покупок

Пересчитывается из `order_items`. Пары нормализованы: `product_id_1 < product_id_2`.

| Поле | Тип | Описание |
|------|-----|----------|
| product_id_1 | integer, PK | |
| product_id_2 | integer, PK | |
| copurchase_count | integer | Количество заказов, где оба товара куплены вместе |
| confidence | float | P(B\|A) — вероятность купить B, если купили A |
| lift | float | P(A,B) / (P(A)×P(B)) — насколько чаще покупают вместе, чем случайно |
| updated_at | timestamp | |

Пары с `lift > 1` покупаются вместе чаще случайного. Пары с `co_count < 3` не сохраняются (шум).

---

#### `category_relations` — комплементарность категорий

Заполняется ML-сервисом после обучения модели комплементарности. Показывает, насколько две категории дополняют друг друга.

| Поле | Тип | Описание |
|------|-----|----------|
| category_id | integer, PK | |
| related_category_id | integer, PK | |
| score | float | Степень комплементарности (0.0–1.0) |
| source | text | Откуда взялась связь |
| updated_at | timestamp | |

---

#### `scenario_group_product_stats` — что чаще выбирают в группе

Накапливается из логов показов. Используется как канал retrieval ("scenario prior").

| Поле | Тип | Описание |
|------|-----|----------|
| scenario_id | text, PK | |
| group_name | text, PK | |
| product_id | integer, PK | |
| times_shown | integer | Сколько раз был показан |
| times_clicked | integer | Сколько раз кликнули |
| times_added | integer | Сколько раз добавили в корзину |
| times_purchased | integer | Сколько раз купили |
| updated_at | timestamp | |

---

### ML-артефакты

---

#### `product_embeddings` — векторные представления товаров

Генерируются ML-сервисом через Ollama (nomic-embed-text, 768 измерений). Хранятся через расширение pgvector.

| Поле | Тип | Описание |
|------|-----|----------|
| product_id | integer, PK+FK → products | |
| embedding | vector(768) | 768-мерный вектор (pgvector) |
| model_name | text | |
| created_at | timestamp | |


---

### Конфигурация сценариев

Управляется через админку менеджерами магазина.

---

#### `scenarios` — сценарии

| Поле | Тип | Описание |
|------|-----|----------|
| id | text, PK | Читаемый идентификатор, например "tile_installation" |
| name | text | Название для отображения в админке |
| description | text | Описание |
| status | text | `draft` / `active` / `archived` |
| sort_order | integer | Порядок при отображении |
| version | integer | Инкрементируется при каждом изменении |
| created_at | timestamp | |
| updated_at | timestamp | |


---

#### `scenario_groups` — группы товаров внутри сценария

| Поле | Тип | Описание |
|------|-----|----------|
| id | integer, PK | |
| scenario_id | text, FK → scenarios | |
| name | text | Внутреннее название |
| is_required | boolean | Обязательная ли группа для сценария |
| sort_order | integer | Порядок групп |
| created_at | timestamp | |

---

#### `scenario_group_category_weights` — какие категории входят в группу

Вместо простого списка категорий — таблица с весами. Вес показывает, насколько категория типична для группы.

| Поле | Тип | Описание |
|------|-----|----------|
| group_id | integer, PK+FK → scenario_groups | |
| category_id | integer, PK+FK → categories | |
| weight | float | 0.0–1.0, типичность категории для группы |

Пример: для группы "Напольное покрытие" — "Плитка напольная" имеет вес 1.0, "Ламинат" — 0.8, "Паркетная доска" — 0.8. Используется при определении сценария по корзине и в retrieval.

---

#### `compatibility_rules` — жёсткие правила совместимости


| Поле | Тип | Описание |
|------|-----|----------|
| id | integer, PK | |
| scenario_id | text, FK → scenarios | |
| rule_type | text | `exclude` / `require` |
| source_group_id | integer, FK → scenario_groups | Группа, которая является условием |
| target_group_id | integer, FK → scenario_groups | Группа, на которую действует правило |
| condition | jsonb | Гибкие условия (категории, бренды и т.д.) |
| description | text | Описание правила для редактора |

---

### Логи рекомендаций

Критически важны для обучения ранкера. Без этих данных нельзя обучить ML-модель.

---

#### `recommendation_impressions` — показы рекомендаций

Один показ = одна незакрытая группа. Один запрос рекомендаций создаёт несколько записей (по группам), объединённых `request_id`.

| Поле | Тип | Описание |
|------|-----|----------|
| id | bigint, PK | |
| request_id | text | Общий ID запроса (группирует показы одного вызова API) |
| session_id | text | Сессия пользователя |
| user_id | integer, nullable | ID пользователя, если авторизован |
| scenario_id | text | Определённый сценарий |
| scenario_version | integer | Версия сценария на момент показа |
| group_name | text | Внутреннее название группы |
| cart_snapshot | integer[] | product_id товаров в корзине на момент показа |
| cart_categories | integer[] | Категории корзины (денормализовано) |
| candidates | jsonb | Список показанных кандидатов: [{product_id, position, score, sources}] |
| ranking_method | text | Метод ранжирования: `rrf` / `catboost` |
| created_at | timestamp | |

---

#### `recommendation_actions` — действия пользователя по показам

| Поле | Тип | Описание |
|------|-----|----------|
| id | bigint, PK | |
| impression_id | bigint, FK → recommendation_impressions | |
| product_id | integer | Товар, с которым произошло действие |
| action_type | text | `click` / `add_to_cart` / `purchase` |
| position | integer | Позиция товара в списке рекомендаций |
| created_at | timestamp | |

---
