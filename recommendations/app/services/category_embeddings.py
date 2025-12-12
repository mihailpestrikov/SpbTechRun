"""
Вычисление эмбеддингов категорий как среднее эмбеддингов товаров.
"""

import logging
import numpy as np
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class CategoryEmbeddingsService:
    """
    Сервис для работы с эмбеддингами категорий.

    Эмбеддинг категории = среднее эмбеддингов всех товаров в категории.
    Используется для:
    - Определения семантической близости категорий
    - Обучения модели комплементарности
    """

    def __init__(self):
        self.embeddings: dict[int, np.ndarray] = {}  # category_id -> embedding
        self.category_names: dict[int, str] = {}  # category_id -> name
        self.category_product_counts: dict[int, int] = {}  # category_id -> count

    async def compute_embeddings(self, session: AsyncSession):
        """Вычисляет эмбеддинги категорий как среднее эмбеддингов товаров."""

        logger.info("Computing category embeddings...")

        # Получаем все категории с товарами и их эмбеддингами
        result = await session.execute(text("""
            SELECT
                c.id,
                c.name,
                ARRAY_AGG(pe.embedding) as embeddings
            FROM categories c
            JOIN products p ON p.category_id = c.id
            JOIN product_embeddings pe ON pe.product_id = p.id
            WHERE pe.embedding IS NOT NULL
            GROUP BY c.id, c.name
        """))

        rows = result.fetchall()

        if not rows:
            logger.warning("No category embeddings computed - no products with embeddings found")
            return

        for row in rows:
            category_id, name, embeddings_list = row

            if embeddings_list:
                # Вычисляем среднее эмбеддингов товаров категории
                embeddings_array = np.array(embeddings_list, dtype=np.float32)
                avg_embedding = np.mean(embeddings_array, axis=0)

                self.embeddings[category_id] = avg_embedding
                self.category_names[category_id] = name
                self.category_product_counts[category_id] = len(embeddings_list)

        logger.info(f"✓ Computed embeddings for {len(self.embeddings)} categories")
        logger.info(f"  Total products with embeddings: {sum(self.category_product_counts.values())}")

    def get_embedding(self, category_id: int) -> np.ndarray | None:
        """Возвращает эмбеддинг категории"""
        return self.embeddings.get(category_id)

    def get_all_embeddings(self) -> dict[int, np.ndarray]:
        """Возвращает все эмбеддинги категорий"""
        return self.embeddings

    def get_category_name(self, category_id: int) -> str | None:
        """Возвращает название категории"""
        return self.category_names.get(category_id)

    def similarity(self, cat1_id: int, cat2_id: int) -> float:
        """
        Вычисляет косинусное сходство между двумя категориями.

        Returns:
            float: значение от -1 до 1, где 1 = идентичные категории
        """
        emb1 = self.embeddings.get(cat1_id)
        emb2 = self.embeddings.get(cat2_id)

        if emb1 is None or emb2 is None:
            return 0.0

        # Нормализуем и вычисляем косинусное сходство
        norm1 = np.linalg.norm(emb1)
        norm2 = np.linalg.norm(emb2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return float(np.dot(emb1, emb2) / (norm1 * norm2))

    def get_most_similar_categories(
        self,
        category_id: int,
        top_k: int = 10,
        min_similarity: float = 0.5
    ) -> list[tuple[int, str, float]]:
        """
        Возвращает топ-K наиболее похожих категорий.

        Returns:
            List of (category_id, category_name, similarity_score)
        """
        emb = self.embeddings.get(category_id)
        if emb is None:
            return []

        similarities = []
        for other_id, other_emb in self.embeddings.items():
            if other_id == category_id:
                continue

            sim = self.similarity(category_id, other_id)
            if sim >= min_similarity:
                similarities.append((
                    other_id,
                    self.category_names.get(other_id, "Unknown"),
                    sim
                ))

        similarities.sort(key=lambda x: x[2], reverse=True)
        return similarities[:top_k]

    def get_stats(self) -> dict:
        """Возвращает статистику по эмбеддингам категорий"""
        if not self.embeddings:
            return {
                "total_categories": 0,
                "total_products": 0,
                "avg_products_per_category": 0,
            }

        return {
            "total_categories": len(self.embeddings),
            "total_products": sum(self.category_product_counts.values()),
            "avg_products_per_category": np.mean(list(self.category_product_counts.values())),
            "min_products_per_category": min(self.category_product_counts.values()),
            "max_products_per_category": max(self.category_product_counts.values()),
        }


# Singleton instance
category_embeddings_service = CategoryEmbeddingsService()
