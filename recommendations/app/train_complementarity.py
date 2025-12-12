#!/usr/bin/env python3
"""
Обучение модели комплементарности категорий.

Использование:
    docker exec spbtechrun-recommendations-1 python -m app.train_complementarity

Или локально:
    python -m app.train_complementarity
"""

import asyncio
import logging
from pathlib import Path

from .db.database import async_session, init_db
from .services.category_embeddings import category_embeddings_service
from .services.complementarity_model import complementarity_model

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

DATASET_PATH = Path(__file__).parent.parent / "data" / "complementary_categories.csv"


async def main():
    """
    Основной процесс обучения модели комплементарности.

    Шаги:
    1. Инициализация БД
    2. Вычисление эмбеддингов категорий
    3. Обучение LogisticRegression модели на размеченных парах
    4. Предвычисление матрицы комплементарности для всех пар
    5. Сохранение модели, скалера и матрицы
    """
    logger.info("=" * 80)
    logger.info("ОБУЧЕНИЕ МОДЕЛИ КОМПЛЕМЕНТАРНОСТИ КАТЕГОРИЙ")
    logger.info("=" * 80)

    # Проверяем наличие датасета
    if not DATASET_PATH.exists():
        logger.error(f"Датасет не найден: {DATASET_PATH}")
        logger.error("Создайте файл data/complementary_categories.csv")
        return

    # Инициализация БД
    await init_db()

    async with async_session() as session:
        # Шаг 1: Вычисляем эмбеддинги категорий
        logger.info("\nШаг 1/2: Вычисление эмбеддингов категорий...")
        await category_embeddings_service.compute_embeddings(session)

        stats = category_embeddings_service.get_stats()
        logger.info(f"Статистика эмбеддингов категорий:")
        logger.info(f"  Категорий: {stats['total_categories']}")
        logger.info(f"  Товаров: {stats['total_products']}")
        logger.info(f"  Среднее товаров/категория: {stats['avg_products_per_category']:.1f}")

        if stats['total_categories'] == 0:
            logger.error("Нет эмбеддингов категорий!")
            logger.error("Убедитесь что в БД есть товары с эмбеддингами")
            return

        # Шаг 2: Обучаем модель комплементарности
        logger.info("\nШаг 2/2: Обучение модели комплементарности...")
        result = await complementarity_model.train(str(DATASET_PATH), session)

        logger.info("\n" + "=" * 80)
        logger.info("ОБУЧЕНИЕ ЗАВЕРШЕНО УСПЕШНО")
        logger.info("=" * 80)
        logger.info(f"Train samples: {result['train_samples']}")
        logger.info(f"Test samples:  {result['test_samples']}")
        logger.info(f"Train AUC:     {result['train_auc']:.4f}")
        logger.info(f"Test AUC:      {result['test_auc']:.4f}")

        # Примеры комплементарных категорий
        logger.info("\n" + "-" * 80)
        logger.info("ПРИМЕРЫ КОМПЛЕМЕНТАРНЫХ КАТЕГОРИЙ")
        logger.info("-" * 80)

        # Для категории "Смеси для выравнивания полов" (25185)
        floor_category_id = 25185
        complementary = complementarity_model.get_complementary_categories(
            floor_category_id, top_k=5, min_score=0.5
        )

        if complementary:
            floor_name = category_embeddings_service.get_category_name(floor_category_id)
            logger.info(f"\nДля категории '{floor_name}' (ID={floor_category_id}):")
            for cat_id, cat_name, score, rel_type in complementary:
                logger.info(f"  {cat_name} (ID={cat_id}): {score:.3f} ({rel_type})")

        # Для категории "Штукатурка" (25178)
        plaster_category_id = 25178
        complementary = complementarity_model.get_complementary_categories(
            plaster_category_id, top_k=5, min_score=0.5
        )

        if complementary:
            plaster_name = category_embeddings_service.get_category_name(plaster_category_id)
            logger.info(f"\nДля категории '{plaster_name}' (ID={plaster_category_id}):")
            for cat_id, cat_name, score, rel_type in complementary:
                logger.info(f"  {cat_name} (ID={cat_id}): {score:.3f} ({rel_type})")

        logger.info("\n" + "=" * 80)
        logger.info("ГОТОВО!")
        logger.info("=" * 80)
        logger.info("\nСледующие шаги:")
        logger.info("1. Переобучите CatBoost модель: curl -X POST http://localhost:8000/ml/train")
        logger.info("2. Перезапустите сервис: docker-compose restart recommendations")
        logger.info("3. Проверьте рекомендации с новыми признаками комплементарности")


if __name__ == "__main__":
    asyncio.run(main())
