# Руководство по комплементарным категориям

## Обзор

Реализована система комплементарных категорий для улучшения качества рекомендаций через понимание связей между категориями товаров (например, штукатурка → шпатели, плитка → клей).

### Что реализовано

1. **CategoryEmbeddingsService** - эмбеддинги категорий (среднее по товарам)
2. **ComplementarityModel** - LogisticRegression модель для предсказания комплементарности
3. **5 новых признаков** в FeatureExtractor для CatBoost
4. **Датасет** из 300+ пар категорий (позитивные + негативные примеры)
5. **API endpoints** для работы с комплементарными категориями
6. **Скрипт обучения** модели

---

## Новые признаки (44 вместо 39)

### Группа: Complementarity (5 новых признаков)

| Признак | Описание | Диапазон |
|---------|----------|----------|
| `complementarity_score` | Вероятность комплементарности из LogReg модели | 0-1 |
| `category_semantic_similarity` | Косинусное сходство эмбеддингов категорий | -1 to 1 |
| `scenario_category_match` | Входят ли в один сценарий (1.0=разные группы, 0.5=одна группа) | 0/0.5/1.0 |
| `copurchase_category_count` | log1p(сумма совместных покупок на уровне категорий) | 0+ |
| `categories_in_same_scenario` | В скольких сценариях категории встречаются вместе | 0-5 |

---

## Использование

### Шаг 1: Обучение модели комплементарности

```bash
# В контейнере
docker exec spbtechrun-recommendations-1 python -m app.train_complementarity

# Или локально
python -m app.train_complementarity
```

**Что делает:**
1. Вычисляет эмбеддинги категорий
2. Обучает LogisticRegression на размеченных парах
3. Предвычисляет матрицу комплементарности для всех пар
4. Сохраняет в `models/`:
   - `complementarity_model.pkl`
   - `complementarity_scaler.pkl`
   - `complementarity_matrix.pkl`
   - `complementarity_type_map.pkl`

**Ожидаемые метрики:**
- Train AUC: > 0.95
- Test AUC: > 0.85
- Precision/Recall: > 0.85

### Шаг 2: Переобучение CatBoost

После обучения модели комплементарности нужно переобучить CatBoost с новыми признаками:

```bash
curl -X POST "http://localhost:8000/ml/train?iterations=500"
```

**Важно:** CatBoost теперь использует 44 признака вместо 39.

### Шаг 3: Перезапуск сервиса

```bash
docker-compose restart recommendations
```

При запуске сервис автоматически:
- Загружает эмбеддинги категорий
- Загружает модель комплементарности
- Загружает предвычисленную матрицу

---

## API

### GET /complementary-categories/{category_id}

Возвращает топ-K комплементарных категорий.

**Параметры:**
- `category_id` (path): ID категории
- `top_k` (query, default=10): количество результатов
- `min_score` (query, default=0.5): минимальный скор комплементарности

**Пример запроса:**
```bash
curl "http://localhost:8000/complementary-categories/25185?top_k=5&min_score=0.6"
```

**Пример ответа:**
```json
{
  "category_id": 25185,
  "category_name": "Смеси для выравнивания полов",
  "complementary": [
    {
      "category_id": 25380,
      "name": "Грунтовки",
      "score": 0.923,
      "relation_type": "material"
    },
    {
      "category_id": 30808,
      "name": "Валики игольчатые",
      "score": 0.887,
      "relation_type": "tool"
    },
    {
      "category_id": 29165,
      "name": "Насадки для миксеров",
      "score": 0.851,
      "relation_type": "tool"
    }
  ]
}
```

### GET /complementarity/model-info

Возвращает информацию о модели.

**Пример запроса:**
```bash
curl "http://localhost:8000/complementarity/model-info"
```

**Пример ответа:**
```json
{
  "status": "ready",
  "matrix_size": 2450,
  "categories_count": 70,
  "model_type": "LogisticRegression",
  "category_embeddings": {
    "total_categories": 70,
    "total_products": 5234,
    "avg_products_per_category": 74.8
  }
}
```

---

## Датасет комплементарных категорий

Файл: `recommendations/data/complementary_categories.csv`

### Структура

```csv
category_id_1,category_id_2,is_complementary,relation_type,scenario
25185,25380,1,material,floor
25185,30808,1,tool,floor
25185,25185,0,same,none
25185,25026,0,unrelated,none
```

### Типы связей

- `material` - сопутствующий материал (штукатурка → грунтовка)
- `tool` - инструмент для работы (штукатурка → шпатель)
- `fastener` - крепёж (гипсокартон → саморезы)
- `finish` - финишная отделка (плитка → затирка)
- `same` - одна и та же категория (негативный пример)
- `unrelated` - несвязанные категории (негативный пример)
- `same_function` - товары-заменители (негативный пример)

### Статистика датасета

- **Позитивные примеры:** ~165 пар
- **Негативные примеры:** ~138 пар
- **Всего:** ~303 пары
- **Balance:** 54% positive / 46% negative

---

## Как это улучшает метрики

### До внедрения (39 признаков)

**Проблема:**
- Категорийные признаки примитивные (`same_category`, `same_root_category`)
- Штраф -0.15 за разные root-категории отсекает комплементарные товары
- Для лака рекомендуются другие лаки, а не кисти

### После внедрения (44 признака)

**Улучшения:**
1. **Явное моделирование комплементарности** через `complementarity_score`
2. **Семантическая близость категорий** через `category_semantic_similarity`
3. **Контекст сценариев** через `scenario_category_match`
4. **Агрегированные co-purchase** на уровне категорий
5. **CatBoost адаптивно использует** новые сигналы

### Ожидаемый impact

| Метрика | До | После | Улучшение |
|---------|-----|-------|-----------|
| Cross-category NDCG@10 | ~0.45 | ~0.65 | +44% |
| Category diversity в топ-10 | 1-2 | 3-4 | +100% |
| Approval rate для cross-category | ~55% | ~75% | +36% |
| CTR на комплементарные товары | ~3% | ~7% | +133% |

---

## Feature Importance (ожидаемые топ-признаки)

После переобучения CatBoost:

1. `complementarity_score` - **NEW** ⭐
2. `pair_feedback_approval_rate`
3. `embedding_cosine_similarity`
4. `copurchase_count`
5. `scenario_category_match` - **NEW** ⭐
6. `category_semantic_similarity` - **NEW** ⭐
7. `scenario_feedback_approval_rate`
8. `discount_percent`
9. `cart_similarity_max`
10. `categories_in_same_scenario` - **NEW** ⭐

---

## Troubleshooting

### Модель не загружается

```
⚠ Complementarity model not trained
```

**Решение:** Запустите обучение
```bash
docker exec spbtechrun-recommendations-1 python -m app.train_complementarity
```

### Мало данных для обучения

```
ValueError: Недостаточно данных для обучения: X примеров
```

**Причина:** Нет эмбеддингов категорий в БД

**Решение:**
1. Убедитесь что товары имеют эмбеддинги
2. Проверьте что category_id заполнены у товаров
3. Запустите генерацию эмбеддингов если нужно

### Низкие метрики модели (AUC < 0.8)

**Возможные причины:**
1. Мало размеченных пар - расширьте датасет
2. Плохое качество эмбеддингов товаров
3. Несбалансированный датасет - добавьте больше негативных примеров

---

## Дальнейшие улучшения

1. **Расширение датасета**
   - Добавить больше категорий из каталога
   - Использовать copurchase данные для автоматической разметки

2. **Улучшение модели**
   - Попробовать GradientBoosting вместо LogisticRegression
   - Добавить признаки из описаний категорий
   - Multi-label classification для типов связей

3. **Интеграция**
   - Использовать в формульном скоринге (не только в CatBoost)
   - Показывать "Обычно покупают вместе" на основе complementarity_score
   - Персонализация через историю покупок пользователя

---

## Контакты

При вопросах или проблемах:
- Проверьте логи: `docker logs spbtechrun-recommendations-1`
- Проверьте модель: `curl http://localhost:8000/complementarity/model-info`
- Проверьте CatBoost: `curl http://localhost:8000/ml/model-info`
