# в

## Metadata

| Поле | Значение |
|------|----------|
| **Статус** | Draft |
| **Автор** | - |
| **Дата** | 2025-12-03 |
| **Приоритет** | High |
| **Оценка** | 4-6 часов |

---

## 1. Контекст и проблема

### Текущее состояние

Система рекомендаций использует:
1. **Семантические эмбеддинги** — ищем товары с похожими описаниями
2. **Co-purchase статистика** — бонус за совместные покупки
3. **Category penalty** — штраф за товары из разных root-категорий

### Проблема

Рекомендации для товара показывают семантически похожие товары из той же категории:
- Для **лака** рекомендуются другие лаки, а не кисточки и растворители
- Для **краски** рекомендуются другие краски, а не валики и ёмкости
- Для **штукатурки** — другие штукатурки, а не шпатели и миксеры

**Причины:**
1. Семантическая близость высокая для товаров одной категории (похожие описания)
2. Штраф за разные категории (-0.15) отсекает комплементарные товары
3. Мало данных о совместных покупках (31 пара в `copurchase_stats`)

---

## 2. Цели

1. Модель определяет комплементарность категорий (вероятность что товары нужны вместе)
2. Рекомендации включают товары из комплементарных категорий
3. Скор комплементарности интегрирован в гибридное ранжирование
4. Возможность дообучения на новых данных о совместных покупках

---

## 3. Архитектура решения

### 3.1 Общая схема

```
┌─────────────────────┐
│  Training Dataset   │
│  (ручная разметка)  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     ┌─────────────────────┐
│  Category Embeddings │────▶│  Complementarity    │
│  (avg of products)   │     │  Classifier         │
└─────────────────────┘     └──────────┬──────────┘
                                       │
                                       ▼
                            ┌─────────────────────┐
                            │  Complementarity    │
                            │  Score Matrix       │
                            └──────────┬──────────┘
                                       │
                                       ▼
                            ┌─────────────────────┐
                            │  Product Recommender │
                            │  (hybrid scoring)    │
                            └─────────────────────┘
```

### 3.2 Компоненты

| Компонент | Ответственность |
|-----------|-----------------|
| `ComplementaryDataset` | Датасет пар категорий с метками |
| `CategoryEmbeddings` | Эмбеддинги категорий (среднее по товарам) |
| `ComplementarityModel` | Классификатор комплементарности |
| `ComplementarityMatrix` | Матрица скоров для быстрого lookup |

---

## 4. Детальный дизайн

### 4.1 Training Dataset

**Путь:** `recommendations/data/complementary_categories.csv`

```csv
category_1,category_2,is_complementary,relation_type
Лаки,Кисти,1,tool
Лаки,Растворители,1,material
Лаки,Лаки,0,same
Краски,Валики,1,tool
Краски,Кисти,1,tool
Краски,Ёмкости для краски,1,tool
Краски,Краски,0,same
Штукатурка,Шпатели,1,tool
Штукатурка,Миксеры строительные,1,tool
Штукатурка,Грунтовки,1,material
Шпатлёвки,Шпатели,1,tool
Шпатлёвки,Наждачная бумага,1,tool
Плитка,Клей для плитки,1,material
Плитка,Крестики для плитки,1,tool
Плитка,Затирка,1,material
Обои,Клей для обоев,1,material
Обои,Валики обойные,1,tool
Ламинат,Подложка,1,material
Ламинат,Плинтусы,1,finish
Наливные полы,Валики игольчатые,1,tool
Наливные полы,Грунтовки,1,material
Гипсокартон,Профили,1,material
Гипсокартон,Саморезы,1,fastener
Гипсокартон,Шуруповёрты,1,tool
...
```

**Типы связей (`relation_type`):**
- `tool` — инструмент для работы с материалом
- `material` — сопутствующий материал
- `fastener` — крепёж
- `finish` — финишная отделка
- `same` — та же категория (негативный пример)
- `unrelated` — несвязанные категории (негативный пример)

### 4.2 Category Embeddings

**Путь:** `recommendations/app/services/category_embeddings.py`

```python
"""
Вычисление эмбеддингов категорий как среднее эмбеддингов товаров.
"""

import numpy as np
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class CategoryEmbeddingsService:
    def __init__(self):
        self.embeddings: dict[int, np.ndarray] = {}  # category_id -> embedding
        self.category_names: dict[int, str] = {}  # category_id -> name

    async def compute_embeddings(self, session: AsyncSession):
        """Вычисляет эмбеддинги категорий как среднее эмбеддингов товаров."""

        # Получаем все категории с товарами
        result = await session.execute(text("""
            SELECT
                c.id,
                c.name,
                ARRAY_AGG(pe.embedding) as embeddings
            FROM categories c
            JOIN products p ON p.category_id = c.id
            JOIN product_embeddings pe ON pe.product_id = p.id
            GROUP BY c.id, c.name
            HAVING COUNT(pe.embedding) > 0
        """))

        for row in result.fetchall():
            category_id, name, embeddings = row
            # Среднее по всем товарам категории
            if embeddings:
                avg_embedding = np.mean(embeddings, axis=0)
                self.embeddings[category_id] = avg_embedding
                self.category_names[category_id] = name

        print(f"Computed embeddings for {len(self.embeddings)} categories")

    def get_embedding(self, category_id: int) -> np.ndarray | None:
        return self.embeddings.get(category_id)

    def get_all_embeddings(self) -> dict[int, np.ndarray]:
        return self.embeddings

    def similarity(self, cat1_id: int, cat2_id: int) -> float:
        """Косинусное сходство между категориями."""
        emb1 = self.embeddings.get(cat1_id)
        emb2 = self.embeddings.get(cat2_id)

        if emb1 is None or emb2 is None:
            return 0.0

        return float(np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2)))


category_embeddings_service = CategoryEmbeddingsService()
```

### 4.3 Complementarity Model

**Путь:** `recommendations/app/services/complementarity_model.py`

```python
"""
Модель для предсказания комплементарности категорий.
Использует эмбеддинги категорий + обучается на размеченных парах.
"""

import numpy as np
import pickle
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import pandas as pd

from .category_embeddings import category_embeddings_service


MODEL_PATH = Path(__file__).parent.parent / "models" / "complementarity_model.pkl"
SCALER_PATH = Path(__file__).parent.parent / "models" / "complementarity_scaler.pkl"
MATRIX_PATH = Path(__file__).parent.parent / "models" / "complementarity_matrix.pkl"


class ComplementarityModel:
    def __init__(self):
        self.model: LogisticRegression | None = None
        self.scaler: StandardScaler | None = None
        self.complementarity_matrix: dict[tuple[int, int], float] = {}

    def _create_features(self, emb1: np.ndarray, emb2: np.ndarray) -> np.ndarray:
        """
        Создаёт признаки для пары категорий:
        - Конкатенация эмбеддингов
        - Разность эмбеддингов
        - Поэлементное произведение
        - Косинусное сходство
        """
        diff = emb1 - emb2
        product = emb1 * emb2
        cosine = np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))

        return np.concatenate([
            emb1,
            emb2,
            diff,
            product,
            [cosine]
        ])

    async def train(self, dataset_path: str, session):
        """Обучает модель на размеченном датасете."""

        # Загружаем датасет
        df = pd.read_csv(dataset_path)

        # Убеждаемся что эмбеддинги категорий вычислены
        if not category_embeddings_service.embeddings:
            await category_embeddings_service.compute_embeddings(session)

        # Маппинг имён категорий на ID
        name_to_id = {v: k for k, v in category_embeddings_service.category_names.items()}

        # Создаём признаки
        X = []
        y = []
        valid_pairs = []

        for _, row in df.iterrows():
            cat1_name = row['category_1']
            cat2_name = row['category_2']

            cat1_id = name_to_id.get(cat1_name)
            cat2_id = name_to_id.get(cat2_name)

            if cat1_id is None or cat2_id is None:
                continue

            emb1 = category_embeddings_service.get_embedding(cat1_id)
            emb2 = category_embeddings_service.get_embedding(cat2_id)

            if emb1 is None or emb2 is None:
                continue

            features = self._create_features(emb1, emb2)
            X.append(features)
            y.append(row['is_complementary'])
            valid_pairs.append((cat1_id, cat2_id))

        X = np.array(X)
        y = np.array(y)

        print(f"Training on {len(X)} pairs")

        # Нормализация
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        # Split
        X_train, X_test, y_train, y_test = train_test_split(
            X_scaled, y, test_size=0.2, random_state=42
        )

        # Train
        self.model = LogisticRegression(max_iter=1000, class_weight='balanced')
        self.model.fit(X_train, y_train)

        # Evaluate
        y_pred = self.model.predict(X_test)
        print(classification_report(y_test, y_pred))

        # Save model
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(MODEL_PATH, 'wb') as f:
            pickle.dump(self.model, f)
        with open(SCALER_PATH, 'wb') as f:
            pickle.dump(self.scaler, f)

        # Precompute matrix for all category pairs
        await self._compute_matrix()

    async def _compute_matrix(self):
        """Предвычисляет матрицу комплементарности для всех пар категорий."""

        category_ids = list(category_embeddings_service.embeddings.keys())

        for i, cat1_id in enumerate(category_ids):
            for cat2_id in category_ids[i+1:]:
                score = self.predict_score(cat1_id, cat2_id)
                # Симметричная матрица
                self.complementarity_matrix[(cat1_id, cat2_id)] = score
                self.complementarity_matrix[(cat2_id, cat1_id)] = score

        # Save matrix
        with open(MATRIX_PATH, 'wb') as f:
            pickle.dump(self.complementarity_matrix, f)

        print(f"Computed complementarity matrix for {len(self.complementarity_matrix)} pairs")

    def load(self):
        """Загружает модель и матрицу из файлов."""

        if MODEL_PATH.exists():
            with open(MODEL_PATH, 'rb') as f:
                self.model = pickle.load(f)
        if SCALER_PATH.exists():
            with open(SCALER_PATH, 'rb') as f:
                self.scaler = pickle.load(f)
        if MATRIX_PATH.exists():
            with open(MATRIX_PATH, 'rb') as f:
                self.complementarity_matrix = pickle.load(f)

        print(f"Loaded complementarity model, matrix size: {len(self.complementarity_matrix)}")

    def predict_score(self, cat1_id: int, cat2_id: int) -> float:
        """Предсказывает скор комплементарности для пары категорий."""

        # Сначала проверяем кэш
        if (cat1_id, cat2_id) in self.complementarity_matrix:
            return self.complementarity_matrix[(cat1_id, cat2_id)]

        if self.model is None or self.scaler is None:
            return 0.0

        emb1 = category_embeddings_service.get_embedding(cat1_id)
        emb2 = category_embeddings_service.get_embedding(cat2_id)

        if emb1 is None or emb2 is None:
            return 0.0

        features = self._create_features(emb1, emb2)
        features_scaled = self.scaler.transform([features])

        # Вероятность класса 1 (комплементарные)
        proba = self.model.predict_proba(features_scaled)[0][1]

        return float(proba)

    def get_complementary_categories(
        self,
        category_id: int,
        top_k: int = 10,
        min_score: float = 0.5
    ) -> list[tuple[int, float]]:
        """Возвращает топ-K комплементарных категорий."""

        scores = []
        for (cat1, cat2), score in self.complementarity_matrix.items():
            if cat1 == category_id and score >= min_score:
                scores.append((cat2, score))

        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]


complementarity_model = ComplementarityModel()
```

### 4.4 Интеграция в Product Recommender

**Путь:** `recommendations/app/services/product_recommender.py`

```python
# Добавить импорт
from .complementarity_model import complementarity_model

class ProductRecommender:
    async def get_recommendations(self, product_id: int, ...):
        # ... существующий код ...

        # Получаем категорию исходного товара
        source_category_id = await self._get_product_category(session, product_id)

        # Получаем комплементарные категории
        complementary_cats = complementarity_model.get_complementary_categories(
            source_category_id,
            top_k=5,
            min_score=0.6
        )
        complementary_cat_ids = {cat_id for cat_id, _ in complementary_cats}
        complementary_scores = {cat_id: score for cat_id, score in complementary_cats}

        # Модифицируем scoring
        for candidate in candidates:
            base_score = semantic_scores.get(candidate.id, 0.5)
            copurchase_boost = min(copurchase_stats.get(candidate.id, 0) * 0.15, 0.3)

            # NEW: Комплементарность вместо штрафа
            candidate_category_id = candidate.category_id
            if candidate_category_id in complementary_cat_ids:
                # Бонус за комплементарную категорию
                complementary_boost = complementary_scores[candidate_category_id] * 0.3
                category_penalty = 0
            elif candidate_category_id == source_category_id:
                # Та же категория — без штрафа, но и без бонуса
                complementary_boost = 0
                category_penalty = 0
            else:
                # Разные некомплементарные категории — штраф
                complementary_boost = 0
                category_penalty = 0.15

            final_score = base_score + copurchase_boost + complementary_boost - category_penalty

            # ...
```

### 4.5 Скрипт обучения

**Путь:** `recommendations/app/train_complementarity.py`

```python
#!/usr/bin/env python3
"""
Обучение модели комплементарности категорий.
Запуск: docker exec spbtechrun-recommendations-1 python -m app.train_complementarity
"""

import asyncio
from pathlib import Path

from .db.database import async_session, init_db
from .services.category_embeddings import category_embeddings_service
from .services.complementarity_model import complementarity_model


DATASET_PATH = Path(__file__).parent / "data" / "complementary_categories.csv"


async def main():
    await init_db()

    async with async_session() as session:
        print("Computing category embeddings...")
        await category_embeddings_service.compute_embeddings(session)

        print("Training complementarity model...")
        await complementarity_model.train(str(DATASET_PATH), session)

    print("Done!")


if __name__ == "__main__":
    asyncio.run(main())
```

---

## 5. Датасет комплементарных категорий

### 5.1 Структура

| Поле | Тип | Описание |
|------|-----|----------|
| `category_1` | string | Название первой категории |
| `category_2` | string | Название второй категории |
| `is_complementary` | int (0/1) | Метка комплементарности |
| `relation_type` | string | Тип связи (tool, material, etc.) |

### 5.2 Примеры пар

**Позитивные примеры (is_complementary=1):**

| Категория 1 | Категория 2 | Тип связи |
|-------------|-------------|-----------|
| Лаки | Кисти | tool |
| Лаки | Растворители | material |
| Краски водно-дисперсионные | Валики | tool |
| Краски водно-дисперсионные | Ёмкости для краски | tool |
| Штукатурка гипсовая | Шпатели | tool |
| Штукатурка гипсовая | Миксеры строительные | tool |
| Штукатурка гипсовая | Грунтовки | material |
| Шпатлёвки | Шпатели | tool |
| Шпатлёвки | Наждачная бумага | tool |
| Плитка керамическая | Клей для плитки | material |
| Плитка керамическая | Крестики для плитки | tool |
| Плитка керамическая | Затирка | material |
| Плитка керамическая | Плиткорез | tool |
| Обои | Клей для обоев | material |
| Обои | Валики обойные | tool |
| Обои | Ножи обойные | tool |
| Ламинат | Подложка | material |
| Ламинат | Плинтусы | finish |
| Наливные полы | Валики игольчатые | tool |
| Наливные полы | Грунтовки | material |
| Наливные полы | Миксеры строительные | tool |
| Гипсокартон | Профили для ГКЛ | material |
| Гипсокартон | Саморезы | fastener |
| Гипсокартон | Шуруповёрты | tool |
| Сухие смеси | Ёмкости для замеса | tool |
| Сухие смеси | Миксеры строительные | tool |

**Негативные примеры (is_complementary=0):**

| Категория 1 | Категория 2 | Тип связи |
|-------------|-------------|-----------|
| Лаки | Лаки | same |
| Краски | Краски | same |
| Обои | Плитка | unrelated |
| Ламинат | Штукатурка | unrelated |
| Кисти | Валики | same_function |
| Саморезы | Гвозди | same_function |

### 5.3 Источники для разметки

1. **Сценарии ремонта** — уже размечены группы товаров для задач
2. **Здравый смысл** — эксперт размечает очевидные пары
3. **Каталог МАКСИДОМ** — раздел "Сопутствующие товары" (если есть)
4. **Будущее:** дообучение на реальных copurchase данных

---

## 6. Формула гибридного ранжирования (обновлённая)

```
final_score = semantic_similarity
            + copurchase_boost
            + complementary_boost
            - category_penalty

где:
- semantic_similarity: [0, 1] — косинусное сходство эмбеддингов товаров
- copurchase_boost: [0, 0.3] — min(copurchase_count * 0.15, 0.3)
- complementary_boost: [0, 0.3] — complementarity_score * 0.3 (если категория комплементарная)
- category_penalty: 0.15 (если категории разные и НЕ комплементарные)
```

---

## 7. API изменения

### Новый эндпоинт: GET /complementary-categories/{category_id}

```json
{
  "category_id": 123,
  "category_name": "Лаки",
  "complementary": [
    {"category_id": 456, "name": "Кисти", "score": 0.92},
    {"category_id": 789, "name": "Растворители", "score": 0.85},
    {"category_id": 101, "name": "Валики", "score": 0.71}
  ]
}
```

---

## 8. План реализации

| # | Задача | Время |
|---|--------|-------|
| 1 | Создать датасет `complementary_categories.csv` | 1-2 часа |
| 2 | Реализовать `CategoryEmbeddingsService` | 30 мин |
| 3 | Реализовать `ComplementarityModel` | 1 час |
| 4 | Скрипт обучения `train_complementarity.py` | 30 мин |
| 5 | Интегрировать в `ProductRecommender` | 45 мин |
| 6 | Добавить API endpoint | 20 мин |
| 7 | Тестирование и отладка | 1 час |
| **Итого** | | **~5-6 часов** |

---

## 9. Тестирование

### 9.1 Валидация модели

```python
# После обучения проверяем метрики
precision: 0.85+
recall: 0.80+
f1-score: 0.82+
```

### 9.2 Качественная проверка

```bash
# Запрос рекомендаций для лака
curl "http://localhost:8000/recommendations/12345"

# Ожидаем:
# - Кисточки (комплементарная категория)
# - Растворители (комплементарная категория)
# - Другие лаки (та же категория, но с меньшим приоритетом)
```

### 9.3 A/B тест (опционально)

- Группа A: старый алгоритм
- Группа B: с комплементарными категориями
- Метрика: CTR на рекомендации, добавление в корзину

---

## 10. Риски и митигации

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Мало данных для обучения | Medium | Расширить датасет, использовать augmentation |
| Модель переобучается | Low | Cross-validation, regularization |
| Неполный маппинг категорий | Medium | Fuzzy matching названий, ручная проверка |
| Долгое предвычисление матрицы | Low | Кэширование, инкрементальное обновление |

---

## 11. Метрики успеха

- [ ] Датасет содержит 100+ пар категорий
- [ ] Модель достигает F1 > 0.80 на тестовой выборке
- [ ] Рекомендации для лака включают кисточки
- [ ] Рекомендации для краски включают валики
- [ ] Время ответа API не увеличилось более чем на 50мс

---

## 12. Будущие улучшения

1. **Дообучение на copurchase** — когда накопится больше данных о заказах
2. **Multi-label classification** — предсказывать тип связи (tool, material, etc.)
3. **Graph-based модель** — категории как граф, GNN для эмбеддингов
4. **Персонализация** — учитывать историю покупок пользователя
