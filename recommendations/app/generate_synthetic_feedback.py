"""
Скрипт генерации синтетического фидбека для холодного старта CatBoost.
Создаёт обучающие данные на основе:
1. Семантической близости товаров (эмбеддинги)
2. Товаров из одной категории

Запуск: python -m app.generate_synthetic_feedback
"""

import asyncio
import logging
import random
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from .core.config import settings
from .core.embeddings import cosine_similarity
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = f"postgresql+asyncpg://{settings.postgres_user}:{settings.postgres_password}@{settings.postgres_host}:{settings.postgres_port}/{settings.postgres_db}"


async def generate_synthetic_feedback(
    count: int = 500,
    positive_ratio: float = 0.7,
):
    """
    Генерирует синтетический фидбек для обучения CatBoost.

    Args:
        count: количество пар фидбека для генерации
        positive_ratio: доля позитивного фидбека (0.7 = 70% положительных)
    """
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session_factory() as session:
        # Получаем товары с эмбеддингами
        logger.info("Загрузка товаров с эмбеддингами...")
        result = await session.execute(
            text("""
                SELECT p.id, p.category_id, pe.embedding
                FROM products p
                JOIN product_embeddings pe ON p.id = pe.product_id
                WHERE pe.embedding IS NOT NULL AND p.available = true
                LIMIT 5000
            """)
        )
        products = [(row[0], row[1], row[2]) for row in result.fetchall()]
        logger.info(f"Загружено {len(products)} товаров")

        if len(products) < 100:
            logger.error("Недостаточно товаров с эмбеддингами. Сначала сгенерируйте эмбеддинги.")
            return

        # Группируем по категориям
        category_products = {}
        for pid, cat_id, emb in products:
            if cat_id not in category_products:
                category_products[cat_id] = []
            category_products[cat_id].append((pid, emb))

        positive_count = int(count * positive_ratio)
        negative_count = count - positive_count

        logger.info(f"Генерация {positive_count} позитивных и {negative_count} негативных примеров...")

        positive_pairs = []
        negative_pairs = []

        # Генерируем позитивный фидбек для похожих товаров
        logger.info("Генерация позитивных пар...")
        for cat_id, cat_products in category_products.items():
            if len(cat_products) < 2:
                continue

            for i in range(min(len(cat_products) - 1, positive_count // len(category_products) + 1)):
                if len(positive_pairs) >= positive_count:
                    break

                idx1, idx2 = random.sample(range(len(cat_products)), 2)
                pid1, emb1 = cat_products[idx1]
                pid2, emb2 = cat_products[idx2]

                if emb1 and emb2:
                    sim = cosine_similarity(
                        np.array(emb1, dtype=np.float32),
                        np.array(emb2, dtype=np.float32)
                    )
                    if sim > 0.3:
                        positive_pairs.append({
                            "main_id": pid1,
                            "rec_id": pid2,
                            "pos": random.randint(3, 15)
                        })

            if len(positive_pairs) >= positive_count:
                break

        logger.info(f"Сгенерировано {len(positive_pairs)} позитивных пар")

        # Генерируем негативный фидбек для товаров из разных категорий
        logger.info("Генерация негативных пар...")
        categories_list = list(category_products.keys())
        used_pairs = set()

        while len(negative_pairs) < negative_count and len(categories_list) >= 2:
            cat1, cat2 = random.sample(categories_list, 2)

            if not category_products[cat1] or not category_products[cat2]:
                continue

            pid1, _ = random.choice(category_products[cat1])
            pid2, _ = random.choice(category_products[cat2])

            # Избегаем дубликатов
            pair_key = (pid1, pid2)
            if pair_key in used_pairs or pid1 == pid2:
                continue
            used_pairs.add(pair_key)

            negative_pairs.append({
                "main_id": pid1,
                "rec_id": pid2,
                "neg": random.randint(2, 8)
            })

        logger.info(f"Сгенерировано {len(negative_pairs)} негативных пар")

        # Batch insert позитивных
        logger.info("Сохранение в БД...")
        for pair in positive_pairs:
            await session.execute(
                text("""
                    INSERT INTO pair_feedback_stats
                        (main_product_id, recommended_product_id, positive_count, negative_count)
                    VALUES (:main_id, :rec_id, :pos, 0)
                    ON CONFLICT (main_product_id, recommended_product_id)
                    DO UPDATE SET positive_count = pair_feedback_stats.positive_count + :pos,
                                  updated_at = NOW()
                """),
                pair
            )

        for pair in negative_pairs:
            await session.execute(
                text("""
                    INSERT INTO pair_feedback_stats
                        (main_product_id, recommended_product_id, positive_count, negative_count)
                    VALUES (:main_id, :rec_id, 0, :neg)
                    ON CONFLICT (main_product_id, recommended_product_id)
                    DO UPDATE SET negative_count = pair_feedback_stats.negative_count + :neg,
                                  updated_at = NOW()
                """),
                pair
            )

        await session.commit()

        positive_generated = len(positive_pairs)
        negative_generated = len(negative_pairs)

        logger.info("=" * 60)
        logger.info("ГЕНЕРАЦИЯ СИНТЕТИЧЕСКОГО ФИДБЕКА ЗАВЕРШЕНА")
        logger.info("=" * 60)
        logger.info(f"Позитивных: {positive_generated}")
        logger.info(f"Негативных: {negative_generated}")
        logger.info(f"Всего: {positive_generated + negative_generated}")
        logger.info("")
        logger.info("Теперь можно обучить CatBoost:")
        logger.info("  curl -X POST 'http://localhost:8000/ml/train'")


if __name__ == "__main__":
    asyncio.run(generate_synthetic_feedback())
