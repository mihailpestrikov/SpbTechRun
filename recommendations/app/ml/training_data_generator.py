"""
Training Data Generator для CatBoost Ranker.
Генерирует обучающие примеры из фидбека и реальных заказов.
"""

import numpy as np
import pandas as pd
from typing import List, Dict, Tuple, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from .feature_extractor import feature_extractor
from ..db import queries


class TrainingDataGenerator:
    """
    Генерирует обучающие данные для CatBoost из:
    1. Позитивных примеров: фидбек положительный + реальные покупки
    2. Негативных примеров: фидбек отрицательный + случайные товары
    """

    async def generate_training_data(
        self,
        session: AsyncSession,
        min_feedback_count: int = 5,
        negative_sampling_ratio: int = 3,
    ) -> Tuple[pd.DataFrame, pd.Series, List[int]]:
        """
        Генерирует обучающие данные.

        Args:
            session: DB сессия
            min_feedback_count: минимум фидбеков для включения пары
            negative_sampling_ratio: сколько негативных примеров на 1 позитивный

        Returns:
            (X_train, y_train, group_ids) для CatBoostRanker
        """
        print("=" * 80)
        print("ГЕНЕРАЦИЯ ОБУЧАЮЩИХ ДАННЫХ ДЛЯ CATBOOST RANKER")
        print("=" * 80)

        # ===== ШАГ 1: Позитивные примеры из фидбека =====
        print("\n[1/5] Извлечение позитивных примеров из фидбека...")
        positive_samples = await self._get_positive_samples_from_feedback(
            session, min_feedback_count
        )
        print(f"  ✓ Найдено {len(positive_samples)} позитивных примеров из фидбека")

        # ===== ШАГ 2: Позитивные примеры из реальных заказов =====
        print("\n[2/5] Извлечение позитивных примеров из заказов...")
        order_samples = await self._get_positive_samples_from_orders(session)
        print(f"  ✓ Найдено {len(order_samples)} позитивных примеров из заказов")

        # Объединяем позитивные примеры
        all_positive = positive_samples + order_samples
        print(f"  ✓ Всего позитивных примеров: {len(all_positive)}")

        # ===== ШАГ 3: Негативные примеры =====
        print("\n[3/5] Генерация негативных примеров...")
        negative_samples = await self._get_negative_samples_from_feedback(session)

        # Добавляем hard negatives (случайные товары)
        hard_negatives = await self._generate_hard_negatives(
            session,
            all_positive,
            ratio=negative_sampling_ratio
        )

        all_negative = negative_samples + hard_negatives
        print(f"  ✓ Негативных из фидбека: {len(negative_samples)}")
        print(f"  ✓ Hard negatives: {len(hard_negatives)}")
        print(f"  ✓ Всего негативных примеров: {len(all_negative)}")

        # ===== ШАГ 4: Извлечение признаков =====
        print("\n[4/5] Извлечение признаков для всех примеров...")

        # Позитивные
        X_positive = []
        y_positive = []
        groups_positive = []

        for i, sample in enumerate(all_positive):
            features = await self._extract_features_for_sample(session, sample)
            if features:
                X_positive.append(features)
                y_positive.append(1)  # релевантен
                groups_positive.append(sample["main_product_id"])

        print(f"  ✓ Признаки извлечены для {len(X_positive)}/{len(all_positive)} позитивных")

        # Негативные
        X_negative = []
        y_negative = []
        groups_negative = []

        for sample in all_negative:
            features = await self._extract_features_for_sample(session, sample)
            if features:
                X_negative.append(features)
                y_negative.append(0)  # не релевантен
                groups_negative.append(sample["main_product_id"])

        print(f"  ✓ Признаки извлечены для {len(X_negative)}/{len(all_negative)} негативных")

        # ===== ШАГ 5: Формирование датасета =====
        print("\n[5/5] Формирование финального датасета...")

        X = X_positive + X_negative
        y = y_positive + y_negative
        groups = groups_positive + groups_negative

        # Конвертируем в pandas
        feature_names = feature_extractor.feature_names
        X_df = pd.DataFrame(X, columns=feature_names)
        y_series = pd.Series(y)

        print(f"  ✓ Размер датасета: {len(X_df)} примеров")
        print(f"  ✓ Позитивных: {sum(y)} ({sum(y)/len(y)*100:.1f}%)")
        print(f"  ✓ Негативных: {len(y) - sum(y)} ({(len(y)-sum(y))/len(y)*100:.1f}%)")
        print(f"  ✓ Уникальных query (main_product_id): {len(set(groups))}")
        print(f"  ✓ Признаков: {len(feature_names)}")

        print("\n" + "=" * 80)
        print("ГЕНЕРАЦИЯ ЗАВЕРШЕНА")
        print("=" * 80)

        return X_df, y_series, groups

    async def _get_positive_samples_from_feedback(
        self,
        session: AsyncSession,
        min_count: int = 5,
    ) -> List[Dict]:
        """Извлекает пары товаров с позитивным фидбеком"""
        query = text("""
            SELECT
                main_product_id,
                recommended_product_id,
                positive_count,
                negative_count
            FROM pair_feedback_stats
            WHERE positive_count >= :min_count
            ORDER BY positive_count DESC
        """)

        result = await session.execute(query, {"min_count": min_count})
        rows = result.fetchall()

        return [
            {
                "main_product_id": row[0],
                "candidate_product_id": row[1],
                "weight": row[2],  # можно использовать для weighted training
            }
            for row in rows
        ]

    async def _get_negative_samples_from_feedback(
        self,
        session: AsyncSession,
    ) -> List[Dict]:
        """Извлекает пары с негативным фидбеком"""
        query = text("""
            SELECT
                main_product_id,
                recommended_product_id,
                negative_count
            FROM pair_feedback_stats
            WHERE negative_count > positive_count
            ORDER BY negative_count DESC
        """)

        result = await session.execute(query)
        rows = result.fetchall()

        return [
            {
                "main_product_id": row[0],
                "candidate_product_id": row[1],
            }
            for row in rows
        ]

    async def _get_positive_samples_from_orders(
        self,
        session: AsyncSession,
    ) -> List[Dict]:
        """
        Извлекает пары товаров из реальных заказов.
        Если в одном заказе купили товары A и B - это сильный позитивный сигнал.
        """
        query = text("""
            SELECT DISTINCT
                oi1.product_id as main_product_id,
                oi2.product_id as candidate_product_id,
                COUNT(*) as copurchase_count
            FROM order_items oi1
            JOIN order_items oi2
                ON oi1.order_id = oi2.order_id
                AND oi1.product_id < oi2.product_id
            GROUP BY oi1.product_id, oi2.product_id
            HAVING COUNT(*) >= 2
            ORDER BY copurchase_count DESC
            LIMIT 10000
        """)

        result = await session.execute(query)
        rows = result.fetchall()

        samples = []
        for row in rows:
            # Создаем две пары: A->B и B->A
            samples.append({
                "main_product_id": row[0],
                "candidate_product_id": row[1],
                "weight": row[2],
            })
            samples.append({
                "main_product_id": row[1],
                "candidate_product_id": row[0],
                "weight": row[2],
            })

        return samples

    async def _generate_hard_negatives(
        self,
        session: AsyncSession,
        positive_samples: List[Dict],
        ratio: int = 3,
    ) -> List[Dict]:
        """
        Генерирует hard negatives: случайные товары для каждого main_product.
        Hard negatives важны для обучения различать релевантное от нерелевантного.
        """
        if not positive_samples:
            return []

        # Получаем все main_product_id
        main_product_ids = list(set(s["main_product_id"] for s in positive_samples))

        # Получаем все candidate_product_id (чтобы не генерировать позитивные как негативные)
        positive_pairs = set(
            (s["main_product_id"], s["candidate_product_id"])
            for s in positive_samples
        )

        # Берем случайные товары из каталога
        query = text("""
            SELECT id
            FROM products
            WHERE available = true
            ORDER BY RANDOM()
            LIMIT :limit
        """)

        result = await session.execute(query, {"limit": len(main_product_ids) * ratio * 2})
        random_products = [row[0] for row in result.fetchall()]

        # Генерируем негативные примеры
        negatives = []
        random_idx = 0

        for main_id in main_product_ids:
            added = 0
            while added < ratio and random_idx < len(random_products):
                candidate_id = random_products[random_idx]
                random_idx += 1

                # Проверяем что это не позитивная пара
                if (main_id, candidate_id) not in positive_pairs and main_id != candidate_id:
                    negatives.append({
                        "main_product_id": main_id,
                        "candidate_product_id": candidate_id,
                    })
                    added += 1

        return negatives

    async def _extract_features_for_sample(
        self,
        session: AsyncSession,
        sample: Dict,
    ) -> Optional[Dict[str, float]]:
        """Извлекает признаки для одного обучающего примера"""
        try:
            main_id = sample["main_product_id"]
            cand_id = sample["candidate_product_id"]

            # Получаем информацию о товарах
            main_product = await queries.get_product_by_id(session, main_id)
            candidate_product = await queries.get_product_by_id(session, cand_id)

            if not main_product or not candidate_product:
                return None

            # Эмбеддинги
            main_embedding = await queries.get_product_embedding(session, main_id)
            cand_embedding = await queries.get_product_embedding(session, cand_id)

            # Фидбек
            pair_stats = await queries.get_pair_feedback_stats(session, main_id, [cand_id])
            pair_feedback = pair_stats.get(cand_id, {"positive": 0, "negative": 0})

            # Пока не используем scenario_feedback в обучении (можно добавить позже)
            scenario_feedback = {"positive": 0, "negative": 0}

            # Co-purchase
            copurchase_stats = await queries.get_copurchase_stats(session, main_id, [cand_id])
            copurchase_count = copurchase_stats.get(cand_id, 0)

            # Извлекаем признаки
            features = await feature_extractor.extract_features(
                main_product=main_product,
                candidate_product=candidate_product,
                main_embedding=main_embedding,
                candidate_embedding=cand_embedding,
                pair_feedback=pair_feedback,
                scenario_feedback=scenario_feedback,
                copurchase_count=copurchase_count,
                cart_products=None,  # для обучения не используем контекст корзины
                session=session,
            )

            return features

        except Exception as e:
            print(f"  Ошибка при извлечении признаков для {sample}: {e}")
            return None


training_data_generator = TrainingDataGenerator()
