# ML Рекомендации: Реализация (Checkpoint 3)

## Что реализовано

Полностью работающая система ML-рекомендаций с двумя типами рекомендаций, сбором фидбека и непрерывным обучением.

---

## Архитектура

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐     ┌─────────┐
│  Frontend   │────▶│  Go Backend │────▶│  ML Service      │────▶│ Ollama  │
│  (React)    │     │  (Gin)      │     │  (FastAPI)       │     │         │
└─────────────┘     └─────────────┘     └──────────────────┘     └─────────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌──────────────────┐
                    │ PostgreSQL  │◀────│ product_embeddings│
                    │             │     │ pair_feedback     │
                    └─────────────┘     │ scenario_feedback │
                                        └──────────────────┘
```

### Компоненты:

| Компонент | Технология | Порт | Назначение |
|-----------|------------|------|------------|
| Frontend | React + Vite | 3000 | UI приложения |
| Backend | Go + Gin | 8080 | API Gateway, проксирует к ML |
| ML Service | FastAPI | 8000 | Рекомендации, фидбек |
| Ollama | ollama/ollama | 11434 | Генерация эмбеддингов |
| PostgreSQL | postgres:16 | 5432 | Хранение данных |

---

## Структура ML-сервиса

```
recommendations/
├── app/
│   ├── main.py              # FastAPI приложение с lifespan
│   ├── core/
│   │   ├── config.py        # Настройки (PostgreSQL, Ollama)
│   │   └── embeddings.py    # OllamaEmbeddings класс
│   ├── db/
│   │   ├── models.py        # SQLAlchemy модели
│   │   └── queries.py       # Запросы к БД
│   ├── services/
│   │   ├── scenarios.py     # Определения сценариев
│   │   ├── product_recommender.py   # Тип 1: рекомендации на странице товара
│   │   └── scenario_recommender.py  # Тип 2: рекомендации по сценарию
│   └── api/
│       ├── routes.py        # Эндпоинты FastAPI
│       └── schemas.py       # Pydantic модели
├── generate_embeddings.py   # Скрипт генерации эмбеддингов
├── requirements.txt
└── Dockerfile
```

---

## Тип 1: Рекомендации на странице товара

### API Endpoint

```
GET /api/recommendations/{product_id}?limit=20
```

### Алгоритм работы

1. **Получение эмбеддинга товара** из таблицы `product_embeddings`
2. **Определение сценария** по категории товара
3. **Поиск кандидатов** из связанных категорий сценария (исключая категорию основного товара)
4. **ML-скоринг** каждого кандидата:

```python
score = 0.5  # базовый

# Семантическая близость (cosine similarity)
similarity = cosine_similarity(main_embedding, candidate_embedding)
score += similarity * 0.3  # до +0.3

# Фидбек для пары товаров
pair_stats = get_pair_feedback(main_id, candidate_id)
if pair_stats.total > 0:
    approval = (pair_stats.positive + 1) / (pair_stats.total + 2)  # Байесовское сглаживание
    score += (approval - 0.5) * 0.4  # от -0.2 до +0.2

# Фидбек в сценарии
scenario_stats = get_scenario_feedback(scenario_id, candidate_id)
if scenario_stats.total > 0:
    approval = (scenario_stats.positive + 1) / (scenario_stats.total + 2)
    score += (approval - 0.5) * 0.2  # от -0.1 до +0.1

# Буст за скидку
if candidate.discount_price:
    discount_pct = (candidate.price - candidate.discount_price) / candidate.price
    score += discount_pct * 0.1  # до +0.1
```

5. **Сортировка** по score, возврат топ-20

### Ответ API

```json
{
  "product_id": 9011800178,
  "product_name": "Штукатурка KNAUF Ротбанд 30кг",
  "detected_scenario": {"id": "walls", "name": "Выравнивание стен"},
  "recommendations": [
    {
      "product": {
        "id": 1001319777,
        "name": "грунт акриловый CERESIT CT17 Pro",
        "price": 890,
        "picture": "...",
        "discount_price": null
      },
      "score": 0.94,
      "rank": 1,
      "reason": "Категория: Грунтовки",
      "match_reasons": [
        {"type": "category", "text": "Грунтовки"},
        {"type": "feedback", "text": "94% одобрили"},
        {"type": "semantic", "text": "Схожесть: 0.87"}
      ]
    }
  ],
  "total_count": 20
}
```

---

## Тип 2: Рекомендации по сценарию

### Сценарии White Box

Определены 3 сценария ремонта:

#### 1. Монтаж наливного пола (`floor`)

| Группа | Категории | Обязательно |
|--------|-----------|-------------|
| Основа | наливной, ровнитель, стяжка | Да |
| Грунты | грунт, грунтовка | Да |
| Ёмкости | ведро, контейнер, ёмкость | Да |
| Инструмент (валик) | валик игольчатый | Да |
| Инструмент (миксер) | насадка, миксер | Да |
| Инструмент (уровень) | уровень | Нет |

#### 2. Монтаж перегородок (`partitions`)

| Группа | Категории | Обязательно |
|--------|-----------|-------------|
| Основа | газоблок, гипсокартон, пазогребневая | Да |
| Клей | клей для блоков, клей для гкл | Да |
| Грунты | грунт | Да |
| Шпатлёвка | шпатлёвка, шпаклёвка | Да |
| Ёмкости | ведро, контейнер | Да |
| Инструмент | насадка, миксер | Да |

#### 3. Выравнивание стен (`walls`)

| Группа | Категории | Обязательно |
|--------|-----------|-------------|
| Основа | штукатурка | Да |
| Грунты | грунт, бетоноконтакт | Да |
| Шпатлёвка | шпатлёвка, шпаклёвка | Да |
| Ёмкости | ведро, контейнер | Да |
| Инструмент | правило, шпатель | Да |
| Инструмент (миксер) | насадка | Да |
| Армирование | сетка, серпянка | Нет |

### API Endpoints

```
GET /api/scenarios                                    # Список сценариев
GET /api/scenarios/{id}                               # Детали сценария
GET /api/scenarios/{id}/recommendations?cart_product_ids=1,2,3
GET /api/recommendations/scenario/auto?cart_product_ids=1,2,3
```

### Алгоритм автовыбора сценария

```python
def select_scenario(cart_product_ids):
    # Для каждого сценария считаем процент заполнения
    for scenario in scenarios:
        completed = 0
        for group in scenario.groups:
            # Есть ли в корзине товар из категорий группы?
            if any(product_in_group(p, group) for p in cart_products):
                completed += 1

        scenario.progress = completed / len(scenario.required_groups)

    # Возвращаем сценарий с максимальным прогрессом
    return max(scenarios, key=lambda s: s.progress)
```

### Ответ API рекомендаций по сценарию

```json
{
  "scenario": {"id": "floor", "name": "Монтаж наливного пола"},
  "progress": {
    "completed": 2,
    "total": 5,
    "percentage": 40
  },
  "recommendations": [
    {
      "group_name": "Ёмкости",
      "is_required": true,
      "products": [
        {
          "id": 1001479759,
          "name": "контейнер строительный 90л",
          "price": 320,
          "score": 0.87,
          "reason": "Популярный выбор"
        }
      ]
    }
  ],
  "completed_groups": [
    {
      "group_name": "Основа",
      "cart_products": [{"id": 123, "name": "Ровнитель PLITONIT"}]
    }
  ],
  "all_scenarios": [
    {"id": "floor", "name": "Монтаж наливного пола"},
    {"id": "walls", "name": "Выравнивание стен"},
    {"id": "partitions", "name": "Монтаж перегородок"}
  ]
}
```

---

## Система фидбека

### Таблицы БД

```sql
-- Фидбек для пар товаров (Тип 1)
CREATE TABLE pair_feedback (
    id SERIAL PRIMARY KEY,
    main_product_id INT NOT NULL,
    recommended_product_id INT NOT NULL,
    feedback_type VARCHAR(20) NOT NULL,  -- 'positive' / 'negative'
    created_at TIMESTAMP DEFAULT NOW()
);

-- Фидбек в контексте сценария (Тип 2)
CREATE TABLE scenario_feedback (
    id SERIAL PRIMARY KEY,
    scenario_id VARCHAR(50) NOT NULL,
    group_name VARCHAR(100),
    product_id INT NOT NULL,
    feedback_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### API для фидбека

```
POST /api/feedback
{
  "main_product_id": 123,           // для Типа 1
  "recommended_product_id": 456,
  "feedback": "positive",           // или "negative"
  "context": "product_page",        // или "scenario"
  "scenario_id": "floor",           // для Типа 2
  "group_name": "Грунты"            // для Типа 2
}
```

### Влияние фидбека на рекомендации

Используется **байесовское сглаживание**:

```
approval_rate = (positive_count + 1) / (total_count + 2)
```

| Фидбек | approval_rate | Влияние на score |
|--------|---------------|------------------|
| 0👍 0👎 | 0.50 | 0 (нейтрально) |
| 5👍 0👎 | 0.86 | +0.14 |
| 10👍 2👎 | 0.79 | +0.12 |
| 2👍 8👎 | 0.25 | -0.10 |

---

## Генерация эмбеддингов

### Модель

- **Ollama** с моделью `nomic-embed-text`
- Размерность вектора: **768**
- Время генерации: ~100-500ms на товар

### Формат текста для эмбеддинга

```python
text = f"{product.name}. Категория: {category_name}. {description}"
```

### Скрипт генерации

```bash
docker exec -it spbtechrun-recommendations-1 python generate_embeddings.py
```

Скрипт:
1. Загружает все товары из PostgreSQL
2. Для каждого товара формирует текст
3. Отправляет в Ollama API
4. Сохраняет вектор в таблицу `product_embeddings`
5. Прогресс выводится в консоль

### Таблица product_embeddings

```sql
CREATE TABLE product_embeddings (
    product_id INT PRIMARY KEY,
    embedding FLOAT8[] NOT NULL,  -- массив из 768 элементов
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Frontend компоненты

### Страница товара (`ProductPage.tsx`)

- Блок "Сопутствующие товары" с 20 рекомендациями
- **Score visualization** — прогресс-бар с процентом (94%)
- **Match reasons** — цветные теги:
  - Синий — категория
  - Зелёный — фидбек
  - Фиолетовый — семантическая схожесть
- Кнопки 👍/👎 для фидбека
- Поддержка скидок (бейдж + зачёркнутая цена)

### Карусель на главной (`ScenarioCarousel.tsx`)

- Автопрокрутка с requestAnimationFrame
- Бесконечный цикл (товары дублируются 3x)
- Пауза при наведении мыши
- Прогресс-бар сценария
- Кнопки "В корзину" на карточках
- Ссылка на все сценарии

### Страница сценария (`ScenarioDetailPage.tsx`)

- Breadcrumbs навигация
- Прогресс сценария (X из Y групп)
- Группы товаров с рекомендациями
- Статусы: ✓ Готово / Нужно
- Фидбек для каждого товара
- Поддержка завершённых групп

### Список сценариев (`ScenariosPage.tsx`)

- Карточки сценариев с иконками
- Количество групп в каждом сценарии

---

## Go Backend — Proxy handlers

### Файл: `backend/internal/handler/recommendation.go`

```go
type RecommendationHandler struct {
    mlURL  string
    client *http.Client
}

func (h *RecommendationHandler) GetRecommendations(c *gin.Context) {
    productID := c.Param("product_id")
    limit := c.DefaultQuery("limit", "20")
    url := fmt.Sprintf("%s/recommendations/%s?limit=%s", h.mlURL, productID, limit)
    h.proxyRequest(c, "GET", url, nil)
}

func (h *RecommendationHandler) GetAutoScenarioRecommendations(c *gin.Context) {
    cartProductIDs := c.Query("cart_product_ids")
    url := fmt.Sprintf("%s/recommendations/scenario/auto?cart_product_ids=%s", h.mlURL, cartProductIDs)
    h.proxyRequest(c, "GET", url, nil)
}
```

### Маршруты (`router.go`)

```go
api.GET("/recommendations/:product_id", recommendationHandler.GetRecommendations)
api.GET("/recommendations/scenario/auto", recommendationHandler.GetAutoScenarioRecommendations)
api.GET("/scenarios", recommendationHandler.GetScenarios)
api.GET("/scenarios/:scenario_id", recommendationHandler.GetScenario)
api.GET("/scenarios/:scenario_id/recommendations", recommendationHandler.GetScenarioRecommendations)
api.POST("/feedback", recommendationHandler.PostFeedback)
```

---

## Docker Compose

### Сервис Ollama

```yaml
ollama:
  image: ollama/ollama:latest
  ports:
    - "11434:11434"
  volumes:
    - ollama_data:/root/.ollama
  healthcheck:
    test: ollama list | grep -q nomic-embed-text || ollama pull nomic-embed-text
    interval: 30s
    timeout: 300s
    start_period: 60s
```

### Сервис Recommendations

```yaml
recommendations:
  build: ./recommendations
  ports:
    - "8000:8000"
  environment:
    - POSTGRES_HOST=postgres
    - OLLAMA_URL=http://ollama:11434
    - OLLAMA_MODEL=nomic-embed-text
  depends_on:
    postgres:
      condition: service_healthy
    ollama:
      condition: service_healthy
```

---

## Процесс запуска

### 1. Запуск всех сервисов

```bash
docker-compose up -d
```

Порядок старта:
1. postgres → healthcheck
2. redis → healthcheck
3. elasticsearch → healthcheck
4. ollama → скачивает модель nomic-embed-text (~274MB)
5. recommendations → ждёт postgres + ollama
6. backend → ждёт все сервисы
7. frontend

### 2. Генерация эмбеддингов (один раз)

```bash
docker exec -it spbtechrun-recommendations-1 python generate_embeddings.py
```

### 3. Проверка

```bash
# Проверить модель Ollama
docker exec spbtechrun-ollama-1 ollama list

# Проверить эмбеддинги
docker exec spbtechrun-postgres-1 psql -U postgres -d spbtechrun \
  -c "SELECT COUNT(*) FROM product_embeddings"

# Тест рекомендаций
curl http://localhost:8080/api/recommendations/1

# Тест сценариев
curl http://localhost:8080/api/scenarios
```

---

## Холодный старт vs Обученная система

### День 1 (без фидбека)

Рекомендации основаны только на эмбеддингах:

```
Грунт CERESIT: similarity=0.82, feedback=0, score=0.82
Грунт KNAUF:   similarity=0.77, feedback=0, score=0.77
```

### После накопления фидбека

```
Грунт KNAUF:   similarity=0.77, feedback=45👍/3👎, score=0.98 ⬆️
Грунт CERESIT: similarity=0.82, feedback=30👍/10👎, score=0.92
```

KNAUF поднялся выше благодаря положительному фидбеку пользователей.

---

## Метрики и статистика

### API для статистики

```
GET /api/ml/stats
```

Возвращает:
- Количество эмбеддингов
- Количество фидбека (по типам)
- Статистика по сценариям

---

## Файлы проекта

### ML Service

| Файл | Описание |
|------|----------|
| `recommendations/app/main.py` | FastAPI приложение |
| `recommendations/app/core/config.py` | Настройки |
| `recommendations/app/core/embeddings.py` | Класс OllamaEmbeddings |
| `recommendations/app/db/models.py` | SQLAlchemy модели |
| `recommendations/app/db/queries.py` | Запросы к БД |
| `recommendations/app/services/scenarios.py` | Определения сценариев |
| `recommendations/app/services/product_recommender.py` | Рекомендации Тип 1 |
| `recommendations/app/services/scenario_recommender.py` | Рекомендации Тип 2 |
| `recommendations/app/api/routes.py` | Эндпоинты |
| `recommendations/app/api/schemas.py` | Pydantic модели |
| `recommendations/generate_embeddings.py` | Скрипт генерации |

### Frontend

| Файл | Описание |
|------|----------|
| `frontend/src/pages/ProductPage.tsx` | Страница товара с рекомендациями |
| `frontend/src/pages/ScenariosPage.tsx` | Список сценариев |
| `frontend/src/pages/ScenarioDetailPage.tsx` | Детали сценария |
| `frontend/src/components/recommendations/ScenarioCarousel.tsx` | Карусель на главной |
| `frontend/src/api/recommendations.ts` | API клиент рекомендаций |
| `frontend/src/api/scenarios.ts` | API клиент сценариев |
| `frontend/src/hooks/useProducts.ts` | React Query хуки |

### Backend

| Файл | Описание |
|------|----------|
| `backend/internal/handler/recommendation.go` | Proxy handlers |
| `backend/internal/handler/router.go` | Маршруты |
