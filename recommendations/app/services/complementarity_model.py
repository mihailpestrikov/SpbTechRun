"""
Модель для предсказания комплементарности категорий.
Использует эмбеддинги категорий + обучается на размеченных парах.
"""

import logging
import numpy as np
import pickle
from pathlib import Path
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score
import pandas as pd

from .category_embeddings import category_embeddings_service
from .scenarios import scenarios_service

logger = logging.getLogger(__name__)

MODEL_PATH = Path(__file__).parent.parent / "models" / "complementarity_model.pkl"
SCALER_PATH = Path(__file__).parent.parent / "models" / "complementarity_scaler.pkl"
MATRIX_PATH = Path(__file__).parent.parent / "models" / "complementarity_matrix.pkl"
TYPE_MAP_PATH = Path(__file__).parent.parent / "models" / "complementarity_type_map.pkl"


class ComplementarityModel:
    """
    Модель для определения комплементарности категорий.

    Архитектура:
    - LogisticRegression классификатор
    - Признаки: конкатенация, разность, произведение, косинус эмбеддингов
    - Предвычисленная матрица для быстрого lookup
    """

    def __init__(self):
        self.model: LogisticRegression | None = None
        self.scaler: StandardScaler | None = None
        self.complementarity_matrix: dict[tuple[int, int], float] = {}
        self.complementarity_type_map: dict[tuple[int, int], str] = {}

        self._load_models()

    def _create_features(self, emb1: np.ndarray, emb2: np.ndarray) -> np.ndarray:
        """
        Создаёт признаки для пары категорий:
        - Конкатенация эмбеддингов [emb1, emb2]
        - Разность [emb1 - emb2]
        - Поэлементное произведение [emb1 * emb2]
        - Косинусное сходство (скаляр)
        """
        # Нормализуем
        emb1_norm = emb1 / (np.linalg.norm(emb1) + 1e-8)
        emb2_norm = emb2 / (np.linalg.norm(emb2) + 1e-8)

        diff = emb1_norm - emb2_norm
        product = emb1_norm * emb2_norm
        cosine = np.dot(emb1_norm, emb2_norm)

        return np.concatenate([
            emb1_norm,
            emb2_norm,
            diff,
            product,
            [cosine]
        ])

    async def train(self, dataset_path: str, session):
        """Обучает модель на размеченном датасете."""

        logger.info("=" * 80)
        logger.info("ОБУЧЕНИЕ МОДЕЛИ КОМПЛЕМЕНТАРНОСТИ КАТЕГОРИЙ")
        logger.info("=" * 80)

        # Загружаем датасет
        df = pd.read_csv(dataset_path, comment='#')
        logger.info(f"Загружен датасет: {len(df)} пар")

        # Убеждаемся что эмбеддинги категорий вычислены
        if not category_embeddings_service.embeddings:
            await category_embeddings_service.compute_embeddings(session)

        # Создаём признаки
        X = []
        y = []
        valid_pairs = []
        relation_types = []

        for _, row in df.iterrows():
            cat1_id = int(row['category_id_1'])
            cat2_id = int(row['category_id_2'])
            is_comp = int(row['is_complementary'])
            rel_type = row['relation_type']

            emb1 = category_embeddings_service.get_embedding(cat1_id)
            emb2 = category_embeddings_service.get_embedding(cat2_id)

            if emb1 is None or emb2 is None:
                logger.warning(f"Missing embeddings for categories {cat1_id} or {cat2_id}, skipping")
                continue

            features = self._create_features(emb1, emb2)
            X.append(features)
            y.append(is_comp)
            valid_pairs.append((cat1_id, cat2_id))
            relation_types.append(rel_type)

        if len(X) < 10:
            raise ValueError(
                f"Недостаточно данных для обучения: {len(X)} пар. "
                "Нужно минимум 10 пар с эмбеддингами."
            )

        X = np.array(X)
        y = np.array(y)

        logger.info(f"Обучение на {len(X)} парах:")
        logger.info(f"  Позитивные: {sum(y)} ({sum(y)/len(y)*100:.1f}%)")
        logger.info(f"  Негативные: {len(y)-sum(y)} ({(1-sum(y)/len(y))*100:.1f}%)")

        # Нормализация
        self.scaler = StandardScaler()
        X_scaled = self.scaler.fit_transform(X)

        # Split
        X_train, X_test, y_train, y_test, pairs_train, pairs_test, types_train, types_test = train_test_split(
            X_scaled, y, valid_pairs, relation_types, test_size=0.2, random_state=42, stratify=y
        )

        logger.info(f"\nTrain: {len(X_train)} пар")
        logger.info(f"Test:  {len(X_test)} пар")

        # Train
        self.model = LogisticRegression(
            max_iter=1000,
            class_weight='balanced',
            random_state=42,
            C=1.0,
        )
        self.model.fit(X_train, y_train)

        # Evaluate
        y_train_pred = self.model.predict(X_train)
        y_test_pred = self.model.predict(X_test)

        y_train_proba = self.model.predict_proba(X_train)[:, 1]
        y_test_proba = self.model.predict_proba(X_test)[:, 1]

        train_auc = roc_auc_score(y_train, y_train_proba)
        test_auc = roc_auc_score(y_test, y_test_proba)

        logger.info("\n" + "-" * 80)
        logger.info("МЕТРИКИ КАЧЕСТВА")
        logger.info("-" * 80)
        logger.info(f"Train AUC: {train_auc:.4f}")
        logger.info(f"Test AUC:  {test_auc:.4f}")

        logger.info("\nClassification Report (Test):")
        logger.info("\n" + classification_report(y_test, y_test_pred, target_names=['Not Complementary', 'Complementary']))

        # Save model
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(MODEL_PATH, 'wb') as f:
            pickle.dump(self.model, f)
        with open(SCALER_PATH, 'wb') as f:
            pickle.dump(self.scaler, f)

        logger.info(f"\n✓ Модель сохранена: {MODEL_PATH}")
        logger.info(f"✓ Скалер сохранён: {SCALER_PATH}")

        # Precompute matrix for all category pairs
        await self._compute_matrix(valid_pairs, relation_types)

        logger.info("\n" + "=" * 80)
        logger.info("ОБУЧЕНИЕ ЗАВЕРШЕНО")
        logger.info("=" * 80)

        return {
            "train_samples": len(X_train),
            "test_samples": len(X_test),
            "train_auc": float(train_auc),
            "test_auc": float(test_auc),
        }

    async def _compute_matrix(self, labeled_pairs: list[tuple[int, int]], relation_types: list[str]):
        """Предвычисляет матрицу комплементарности для всех пар категорий."""

        logger.info("\nПредвычисление матрицы комплементарности...")

        # Сначала добавляем размеченные пары
        for (cat1_id, cat2_id), rel_type in zip(labeled_pairs, relation_types):
            score = self.predict_score(cat1_id, cat2_id)

            # Симметричная матрица
            self.complementarity_matrix[(cat1_id, cat2_id)] = score
            self.complementarity_matrix[(cat2_id, cat1_id)] = score

            self.complementarity_type_map[(cat1_id, cat2_id)] = rel_type
            self.complementarity_type_map[(cat2_id, cat1_id)] = rel_type

        # Затем вычисляем для всех комбинаций категорий с эмбеддингами
        category_ids = list(category_embeddings_service.embeddings.keys())

        for i, cat1_id in enumerate(category_ids):
            for cat2_id in category_ids[i+1:]:
                if (cat1_id, cat2_id) not in self.complementarity_matrix:
                    score = self.predict_score(cat1_id, cat2_id)

                    self.complementarity_matrix[(cat1_id, cat2_id)] = score
                    self.complementarity_matrix[(cat2_id, cat1_id)] = score

                    # Тип определяем по сценариям
                    rel_type = self._infer_relation_type(cat1_id, cat2_id)
                    self.complementarity_type_map[(cat1_id, cat2_id)] = rel_type
                    self.complementarity_type_map[(cat2_id, cat1_id)] = rel_type

        # Save matrix
        with open(MATRIX_PATH, 'wb') as f:
            pickle.dump(self.complementarity_matrix, f)
        with open(TYPE_MAP_PATH, 'wb') as f:
            pickle.dump(self.complementarity_type_map, f)

        logger.info(f"✓ Матрица сохранена: {MATRIX_PATH}")
        logger.info(f"  Размер: {len(self.complementarity_matrix)} пар")

    def _infer_relation_type(self, cat1_id: int, cat2_id: int) -> str:
        """Определяет тип связи между категориями на основе сценариев."""

        # Проверяем, входят ли категории в один сценарий
        for scenario in scenarios_service.scenarios.values():
            cat1_group = None
            cat2_group = None

            for group in scenario.groups:
                if cat1_id in group.category_ids:
                    cat1_group = group.name
                if cat2_id in group.category_ids:
                    cat2_group = group.name

            if cat1_group and cat2_group:
                if cat1_group == cat2_group:
                    return "same_group"

                # Эвристики для определения типа
                if "инструмент" in cat2_group.lower() or "валик" in cat2_group.lower() or "шпател" in cat2_group.lower():
                    return "tool"
                elif "материал" in cat2_group.lower() or "смес" in cat2_group.lower():
                    return "material"
                else:
                    return "related"

        return "unrelated"

    def _load_models(self):
        """Загружает модель и матрицу из файлов."""

        if MODEL_PATH.exists():
            with open(MODEL_PATH, 'rb') as f:
                self.model = pickle.load(f)
            logger.info(f"✓ Загружена модель комплементарности: {MODEL_PATH}")

        if SCALER_PATH.exists():
            with open(SCALER_PATH, 'rb') as f:
                self.scaler = pickle.load(f)

        if MATRIX_PATH.exists():
            with open(MATRIX_PATH, 'rb') as f:
                self.complementarity_matrix = pickle.load(f)
            logger.info(f"✓ Загружена матрица: {len(self.complementarity_matrix)} пар")

        if TYPE_MAP_PATH.exists():
            with open(TYPE_MAP_PATH, 'rb') as f:
                self.complementarity_type_map = pickle.load(f)

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
    ) -> list[tuple[int, str, float, str]]:
        """
        Возвращает топ-K комплементарных категорий.

        Returns:
            List of (category_id, category_name, score, relation_type)
        """

        scores = []
        for (cat1, cat2), score in self.complementarity_matrix.items():
            if cat1 == category_id and score >= min_score:
                cat_name = category_embeddings_service.get_category_name(cat2) or "Unknown"
                rel_type = self.complementarity_type_map.get((cat1, cat2), "unknown")
                scores.append((cat2, cat_name, score, rel_type))

        scores.sort(key=lambda x: x[2], reverse=True)
        return scores[:top_k]

    def get_relation_type(self, cat1_id: int, cat2_id: int) -> str:
        """Возвращает тип связи между категориями."""
        return self.complementarity_type_map.get((cat1_id, cat2_id), "unknown")

    def get_model_info(self) -> dict:
        """Возвращает информацию о модели"""
        if not self.model:
            return {
                "status": "not_trained",
                "message": "Модель не обучена",
            }

        return {
            "status": "ready",
            "matrix_size": len(self.complementarity_matrix),
            "categories_count": len(set(k[0] for k in self.complementarity_matrix.keys())),
            "model_type": "LogisticRegression",
        }


# Singleton instance
complementarity_model = ComplementarityModel()
