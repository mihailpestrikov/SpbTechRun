"""
CatBoost Ranker для ранжирования товарных рекомендаций.
"""

import os
import json
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from catboost import CatBoostRanker, Pool
from sqlalchemy.ext.asyncio import AsyncSession

from .feature_extractor import feature_extractor
from .training_data_generator import training_data_generator
from ..db import queries


class CatBoostRankerService:
    """
    Сервис для обучения и использования CatBoost ранкера.

    Возможности:
    - Обучение на исторических данных (фидбек + заказы)
    - Переранжирование списка кандидатов
    - Персистентность моделей с версионированием
    - Мониторинг качества
    """

    def __init__(self, models_dir: str = "models"):
        self.models_dir = Path(models_dir)
        self.models_dir.mkdir(parents=True, exist_ok=True)

        self.model: Optional[CatBoostRanker] = None
        self.model_version: Optional[str] = None
        self.model_metadata: Optional[Dict] = None

        self._load_latest_model()

    def _load_latest_model(self):
        """Загружает последнюю обученную модель"""
        model_files = list(self.models_dir.glob("catboost_ranker_*.cbm"))

        if not model_files:
            print("Нет обученных моделей. Используется формульный скоринг.")
            return

        latest_model = max(model_files, key=lambda p: p.stat().st_mtime)

        try:
            self.model = CatBoostRanker()
            self.model.load_model(str(latest_model))

            self.model_version = latest_model.stem.replace("catboost_ranker_", "")

            metadata_file = latest_model.parent / f"{latest_model.stem}_metadata.json"
            if metadata_file.exists():
                with open(metadata_file, "r") as f:
                    self.model_metadata = json.load(f)

            print(f"✓ Загружена модель: {latest_model.name}")
            print(f"  Версия: {self.model_version}")
            if self.model_metadata:
                print(f"  Обучена: {self.model_metadata.get('trained_at')}")
                print(f"  Примеров: {self.model_metadata.get('train_samples')}")

        except Exception as e:
            print(f"Ошибка загрузки модели {latest_model}: {e}")
            self.model = None

    async def train_model(
        self,
        session: AsyncSession,
        iterations: int = 500,
        learning_rate: float = 0.05,
        depth: int = 6,
        min_feedback_count: int = 5,
        negative_sampling_ratio: int = 3,
    ) -> Dict:
        """
        Обучает CatBoost ранкер на исторических данных.

        Args:
            session: DB сессия
            iterations: количество итераций boosting
            learning_rate: скорость обучения
            depth: глубина деревьев
            min_feedback_count: минимум фидбеков для включения примера
            negative_sampling_ratio: соотношение негативных к позитивным

        Returns:
            Dict с метриками обучения
        """
        print("\n" + "=" * 80)
        print("ОБУЧЕНИЕ CATBOOST RANKER")
        print("=" * 80)

        X_train, y_train, groups = await training_data_generator.generate_training_data(
            session=session,
            min_feedback_count=min_feedback_count,
            negative_sampling_ratio=negative_sampling_ratio,
        )

        if len(X_train) < 100:
            raise ValueError(
                f"Недостаточно данных для обучения: {len(X_train)} примеров. "
                "Нужно минимум 100. Соберите больше фидбека или заказов."
            )

        from sklearn.model_selection import train_test_split

        unique_groups = list(set(groups))
        train_groups, val_groups = train_test_split(
            unique_groups, test_size=0.2, random_state=42
        )

        train_mask = [g in train_groups for g in groups]
        val_mask = [g in val_groups for g in groups]

        X_train_split = X_train[train_mask].reset_index(drop=True)
        y_train_split = y_train[train_mask].reset_index(drop=True)
        groups_train_split = [groups[i] for i, m in enumerate(train_mask) if m]

        X_val = X_train[val_mask].reset_index(drop=True)
        y_val = y_train[val_mask].reset_index(drop=True)
        groups_val = [groups[i] for i, m in enumerate(val_mask) if m]

        # CatBoost требует чтобы данные были отсортированы по group_id
        train_order = np.argsort(groups_train_split)
        X_train_split = X_train_split.iloc[train_order].reset_index(drop=True)
        y_train_split = y_train_split.iloc[train_order].reset_index(drop=True)
        groups_train_split = [groups_train_split[i] for i in train_order]

        val_order = np.argsort(groups_val)
        X_val = X_val.iloc[val_order].reset_index(drop=True)
        y_val = y_val.iloc[val_order].reset_index(drop=True)
        groups_val = [groups_val[i] for i in val_order]

        print(f"\nTrain: {len(X_train_split)} примеров, {len(train_groups)} query")
        print(f"Val:   {len(X_val)} примеров, {len(val_groups)} query")

        train_pool = Pool(
            data=X_train_split,
            label=y_train_split,
            group_id=groups_train_split,
        )

        val_pool = Pool(
            data=X_val,
            label=y_val,
            group_id=groups_val,
        )

        print("\n" + "-" * 80)
        print("ЗАПУСК ОБУЧЕНИЯ")
        print("-" * 80)

        self.model = CatBoostRanker(
            iterations=iterations,
            learning_rate=learning_rate,
            depth=depth,
            loss_function="YetiRank",
            custom_metric=["NDCG:top=10", "PrecisionAt:top=5"],
            random_seed=42,
            verbose=50,
            use_best_model=True,
            eval_metric="NDCG:top=10",
        )

        self.model.fit(
            train_pool,
            eval_set=val_pool,
            plot=False,
        )

        print("\n" + "-" * 80)
        print("ОЦЕНКА КАЧЕСТВА")
        print("-" * 80)

        train_predictions = self.model.predict(train_pool)
        val_predictions = self.model.predict(val_pool)

        from sklearn.metrics import roc_auc_score, average_precision_score

        train_auc = roc_auc_score(y_train_split, train_predictions)
        val_auc = roc_auc_score(y_val, val_predictions)

        train_ap = average_precision_score(y_train_split, train_predictions)
        val_ap = average_precision_score(y_val, val_predictions)

        print(f"Train AUC: {train_auc:.4f}")
        print(f"Val AUC:   {val_auc:.4f}")
        print(f"Train AP:  {train_ap:.4f}")
        print(f"Val AP:    {val_ap:.4f}")

        print("\n" + "-" * 80)
        print("TOP-10 ВАЖНЫХ ПРИЗНАКОВ")
        print("-" * 80)

        feature_importance = self.model.get_feature_importance(data=train_pool)
        feature_names = X_train.columns

        importance_df = pd.DataFrame({
            "feature": feature_names,
            "importance": feature_importance,
        }).sort_values("importance", ascending=False)

        print(importance_df.head(10).to_string(index=False))

        self.model_version = datetime.now().strftime("%Y%m%d_%H%M%S")
        model_path = self.models_dir / f"catboost_ranker_{self.model_version}.cbm"

        self.model.save_model(str(model_path))

        self.model_metadata = {
            "version": self.model_version,
            "trained_at": datetime.now().isoformat(),
            "train_samples": len(X_train_split),
            "val_samples": len(X_val),
            "train_groups": len(train_groups),
            "val_groups": len(val_groups),
            "metrics": {
                "train_auc": float(train_auc),
                "val_auc": float(val_auc),
                "train_ap": float(train_ap),
                "val_ap": float(val_ap),
            },
            "hyperparameters": {
                "iterations": iterations,
                "learning_rate": learning_rate,
                "depth": depth,
                "loss_function": "YetiRank",
            },
            "top_features": importance_df.head(10).to_dict("records"),
        }

        metadata_path = self.models_dir / f"catboost_ranker_{self.model_version}_metadata.json"
        with open(metadata_path, "w") as f:
            json.dump(self.model_metadata, f, indent=2)

        print(f"\n✓ Модель сохранена: {model_path}")
        print(f"✓ Метаданные: {metadata_path}")

        print("\n" + "=" * 80)
        print("ОБУЧЕНИЕ ЗАВЕРШЕНО")
        print("=" * 80)

        return self.model_metadata

    async def rank_candidates(
        self,
        main_product: Dict,
        candidates: List[Dict],
        session: AsyncSession,
        cart_products: Optional[List[Dict]] = None,
    ) -> List[Dict]:
        """
        Переранжирует список кандидатов с помощью CatBoost модели.

        Args:
            main_product: главный товар
            candidates: список кандидатов для ранжирования
            session: DB сессия
            cart_products: товары в корзине (для контекстных признаков)

        Returns:
            Отсортированный список кандидатов с ML-скорами
        """
        if not self.model or not candidates:
            return candidates

        X = []
        valid_candidates = []

        main_id = main_product["id"]
        main_embedding = await queries.get_product_embedding(session, main_id)

        candidate_ids = [c["id"] for c in candidates]

        embeddings_map = await queries.get_embeddings_map(session, candidate_ids)
        pair_stats = await queries.get_pair_feedback_stats(session, main_id, candidate_ids)
        copurchase_stats = await queries.get_copurchase_stats(session, main_id, candidate_ids)

        for candidate in candidates:
            cand_id = candidate["id"]

            features = await feature_extractor.extract_features(
                main_product=main_product,
                candidate_product=candidate,
                main_embedding=main_embedding,
                candidate_embedding=embeddings_map.get(cand_id),
                pair_feedback=pair_stats.get(cand_id, {"positive": 0, "negative": 0}),
                scenario_feedback={"positive": 0, "negative": 0},
                copurchase_count=copurchase_stats.get(cand_id, 0),
                cart_products=cart_products,
                session=session,
            )

            if features:
                X.append(list(features.values()))
                valid_candidates.append(candidate)

        if not X:
            return candidates

        X_df = pd.DataFrame(X, columns=feature_extractor.feature_names)
        raw_scores = self.model.predict(X_df)

        # Нормализуем скоры в диапазон 0-1 с помощью min-max scaling
        min_score = float(np.min(raw_scores))
        max_score = float(np.max(raw_scores))
        score_range = max_score - min_score

        for candidate, raw_score in zip(valid_candidates, raw_scores):
            if score_range > 0:
                normalized_score = (raw_score - min_score) / score_range
            else:
                normalized_score = 0.5
            # Масштабируем в диапазон 0.5-1.0 чтобы все рекомендации выглядели релевантными
            candidate["ml_score"] = float(0.5 + normalized_score * 0.5)

        valid_candidates.sort(key=lambda x: x["ml_score"], reverse=True)

        return valid_candidates

    def get_model_info(self) -> Dict:
        """Возвращает информацию о текущей модели"""
        if not self.model:
            return {
                "status": "no_model",
                "message": "Модель не обучена. Используется формульный скоринг.",
            }

        return {
            "status": "ready",
            "version": self.model_version,
            "metadata": self.model_metadata,
            "feature_count": len(feature_extractor.feature_names),
            "features": feature_extractor.feature_names,
        }


catboost_ranker = CatBoostRankerService()
