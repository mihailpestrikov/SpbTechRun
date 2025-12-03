"""
Скрипт генерации эмбеддингов для всех товаров.
Запуск: python -m app.generate_embeddings
"""

import asyncio
import json
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from .core.config import settings
from .core.embeddings import OllamaEmbeddings, build_product_text
from .db.models import Base

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = f"postgresql+asyncpg://{settings.postgres_user}:{settings.postgres_password}@{settings.postgres_host}:{settings.postgres_port}/{settings.postgres_db}"


async def get_category_path(session: AsyncSession, category_id: int) -> str:
    result = await session.execute(
        text("""
            WITH RECURSIVE cat_path AS (
                SELECT id, name, parent_id, name::text as path
                FROM categories
                WHERE id = :cat_id
                UNION ALL
                SELECT c.id, c.name, c.parent_id, c.name || ' > ' || cp.path
                FROM categories c
                JOIN cat_path cp ON c.id = cp.parent_id
            )
            SELECT path FROM cat_path WHERE parent_id IS NULL
        """),
        {"cat_id": category_id}
    )
    row = result.fetchone()
    return row[0] if row else ""


async def generate_all_embeddings(batch_size: int = 100):
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    ollama = OllamaEmbeddings()

    async with async_session_factory() as session:
        result = await session.execute(text("SELECT COUNT(*) FROM products"))
        total_products = result.scalar()
        logger.info(f"Total products: {total_products}")

        result = await session.execute(
            text("SELECT COUNT(*) FROM product_embeddings WHERE embedding IS NOT NULL")
        )
        existing_embeddings = result.scalar()
        logger.info(f"Existing embeddings: {existing_embeddings}")

        processed = 0
        errors = 0

        while True:
            result = await session.execute(
                text("""
                    SELECT p.id, p.name, p.category_id, p.vendor, p.description, p.params
                    FROM products p
                    LEFT JOIN product_embeddings pe ON p.id = pe.product_id
                    WHERE pe.product_id IS NULL
                    ORDER BY p.id
                    LIMIT :limit
                """),
                {"limit": batch_size}
            )
            products = result.fetchall()

            if not products:
                break

            for product in products:
                product_id, name, category_id, vendor, description, params = product
                category_path = await get_category_path(session, category_id) if category_id else ""

                params_dict = None
                if params:
                    try:
                        params_dict = json.loads(params) if isinstance(params, str) else params
                    except (json.JSONDecodeError, TypeError):
                        pass

                text_repr = build_product_text(
                    name=name,
                    category_path=category_path,
                    vendor=vendor,
                    description=description,
                    params=params_dict,
                )

                embedding = await ollama.generate(text_repr)

                if embedding:
                    await session.execute(
                        text("""
                            INSERT INTO product_embeddings (product_id, embedding, text_representation, created_at)
                            VALUES (:product_id, :embedding, :text_repr, NOW())
                            ON CONFLICT (product_id) DO UPDATE
                            SET embedding = :embedding, text_representation = :text_repr, created_at = NOW()
                        """),
                        {"product_id": product_id, "embedding": embedding, "text_repr": text_repr}
                    )
                    processed += 1
                else:
                    errors += 1

                if processed % 10 == 0:
                    await session.commit()
                    logger.info(f"Processed: {processed}, Errors: {errors}")

            await session.commit()

        logger.info(f"Done! Processed: {processed}, Errors: {errors}")


if __name__ == "__main__":
    asyncio.run(generate_all_embeddings())
