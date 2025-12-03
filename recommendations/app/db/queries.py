from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional


async def get_product_by_id(session: AsyncSession, product_id: int) -> Optional[dict]:
    result = await session.execute(
        text("""
            SELECT p.id, p.name, p.category_id, p.vendor, p.price, p.picture, p.description,
                   c.name as category_name,
                   pr.discount_price
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN promos pr ON p.id = pr.product_id
                AND pr.start_date <= CURRENT_DATE
                AND pr.end_date >= CURRENT_DATE
            WHERE p.id = :id
        """),
        {"id": product_id}
    )
    row = result.fetchone()
    if not row:
        return None
    return {
        "id": row[0],
        "name": row[1],
        "category_id": row[2],
        "vendor": row[3],
        "price": float(row[4]) if row[4] else 0,
        "picture": row[5],
        "description": row[6],
        "category_name": row[7],
        "discount_price": float(row[8]) if row[8] else None,
    }


async def get_products_by_ids(session: AsyncSession, product_ids: list[int]) -> dict[int, dict]:
    if not product_ids:
        return {}
    result = await session.execute(
        text("""
            SELECT p.id, p.name, p.category_id, p.vendor, p.price, p.picture,
                   c.name as category_name,
                   pr.discount_price
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN promos pr ON p.id = pr.product_id
                AND pr.start_date <= CURRENT_DATE
                AND pr.end_date >= CURRENT_DATE
            WHERE p.id = ANY(:ids)
        """),
        {"ids": product_ids}
    )
    products = {}
    for row in result.fetchall():
        products[row[0]] = {
            "id": row[0],
            "name": row[1],
            "category_id": row[2],
            "vendor": row[3],
            "price": float(row[4]) if row[4] else 0,
            "picture": row[5],
            "category_name": row[6],
            "discount_price": float(row[7]) if row[7] else None,
        }
    return products


async def get_products_by_categories(
    session: AsyncSession,
    category_ids: list[int],
    exclude_ids: list[int] = None,
    limit: int = 100,
) -> list[dict]:
    exclude = exclude_ids or []
    result = await session.execute(
        text("""
            SELECT p.id, p.name, p.category_id, p.vendor, p.price, p.picture,
                   c.name as category_name,
                   pr.discount_price
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN promos pr ON p.id = pr.product_id
                AND pr.start_date <= CURRENT_DATE
                AND pr.end_date >= CURRENT_DATE
            WHERE p.category_id = ANY(:cat_ids)
              AND p.id != ALL(:exclude)
              AND p.available = true
            ORDER BY p.id
            LIMIT :limit
        """),
        {"cat_ids": category_ids, "exclude": exclude, "limit": limit}
    )
    return [
        {
            "id": row[0],
            "name": row[1],
            "category_id": row[2],
            "vendor": row[3],
            "price": float(row[4]) if row[4] else 0,
            "picture": row[5],
            "category_name": row[6],
            "discount_price": float(row[7]) if row[7] else None,
        }
        for row in result.fetchall()
    ]


async def get_category_ids_by_pattern(session: AsyncSession, pattern: str) -> list[int]:
    result = await session.execute(
        text("""
            SELECT id FROM categories
            WHERE LOWER(name) LIKE LOWER(:pattern)
        """),
        {"pattern": f"%{pattern}%"}
    )
    return [row[0] for row in result.fetchall()]


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


async def get_root_category_id(session: AsyncSession, category_id: int) -> Optional[int]:
    """Возвращает ID корневой категории (parent_id IS NULL)"""
    result = await session.execute(
        text("""
            WITH RECURSIVE cat_path AS (
                SELECT id, parent_id
                FROM categories
                WHERE id = :cat_id
                UNION ALL
                SELECT c.id, c.parent_id
                FROM categories c
                JOIN cat_path cp ON c.id = cp.parent_id
            )
            SELECT id FROM cat_path WHERE parent_id IS NULL
        """),
        {"cat_id": category_id}
    )
    row = result.fetchone()
    return row[0] if row else None


async def get_root_categories_map(session: AsyncSession, category_ids: list[int]) -> dict[int, int]:
    """Возвращает маппинг category_id -> root_category_id для списка категорий"""
    if not category_ids:
        return {}
    result = await session.execute(
        text("""
            WITH RECURSIVE cat_path AS (
                SELECT id as original_id, id, parent_id
                FROM categories
                WHERE id = ANY(:cat_ids)
                UNION ALL
                SELECT cp.original_id, c.id, c.parent_id
                FROM categories c
                JOIN cat_path cp ON c.id = cp.parent_id
            )
            SELECT original_id, id as root_id FROM cat_path WHERE parent_id IS NULL
        """),
        {"cat_ids": category_ids}
    )
    return {row[0]: row[1] for row in result.fetchall()}


async def get_product_embedding(session: AsyncSession, product_id: int) -> Optional[list[float]]:
    result = await session.execute(
        text("SELECT embedding FROM product_embeddings WHERE product_id = :id"),
        {"id": product_id}
    )
    row = result.fetchone()
    return row[0] if row else None


async def get_embeddings_map(session: AsyncSession, product_ids: list[int]) -> dict[int, list[float]]:
    if not product_ids:
        return {}
    result = await session.execute(
        text("SELECT product_id, embedding FROM product_embeddings WHERE product_id = ANY(:ids)"),
        {"ids": product_ids}
    )
    return {row[0]: row[1] for row in result.fetchall()}


async def get_pair_feedback_stats(
    session: AsyncSession,
    main_product_id: int,
    recommended_ids: list[int],
) -> dict[int, dict]:
    if not recommended_ids:
        return {}
    result = await session.execute(
        text("""
            SELECT recommended_product_id, positive_count, negative_count
            FROM pair_feedback_stats
            WHERE main_product_id = :main_id
              AND recommended_product_id = ANY(:rec_ids)
        """),
        {"main_id": main_product_id, "rec_ids": recommended_ids}
    )
    return {
        row[0]: {"positive": row[1], "negative": row[2]}
        for row in result.fetchall()
    }


async def get_scenario_feedback_stats(
    session: AsyncSession,
    scenario_id: str,
    group_name: str,
    product_ids: list[int],
) -> dict[int, dict]:
    if not product_ids:
        return {}
    result = await session.execute(
        text("""
            SELECT product_id, positive_count, negative_count
            FROM scenario_feedback_stats
            WHERE scenario_id = :scenario_id
              AND group_name = :group_name
              AND product_id = ANY(:product_ids)
        """),
        {"scenario_id": scenario_id, "group_name": group_name, "product_ids": product_ids}
    )
    return {
        row[0]: {"positive": row[1], "negative": row[2]}
        for row in result.fetchall()
    }


async def record_pair_feedback(
    session: AsyncSession,
    main_product_id: int,
    recommended_product_id: int,
    feedback_type: str,
    user_id: int = None,
    context: str = "product_page",
):
    await session.execute(
        text("""
            INSERT INTO product_pair_feedback
                (user_id, main_product_id, recommended_product_id, feedback_type, context)
            VALUES (:user_id, :main_id, :rec_id, :feedback, :context)
        """),
        {
            "user_id": user_id,
            "main_id": main_product_id,
            "rec_id": recommended_product_id,
            "feedback": feedback_type,
            "context": context,
        }
    )

    if feedback_type == "positive":
        await session.execute(
            text("""
                INSERT INTO pair_feedback_stats (main_product_id, recommended_product_id, positive_count, negative_count)
                VALUES (:main_id, :rec_id, 1, 0)
                ON CONFLICT (main_product_id, recommended_product_id)
                DO UPDATE SET positive_count = pair_feedback_stats.positive_count + 1,
                              updated_at = NOW()
            """),
            {"main_id": main_product_id, "rec_id": recommended_product_id}
        )
    else:
        await session.execute(
            text("""
                INSERT INTO pair_feedback_stats (main_product_id, recommended_product_id, positive_count, negative_count)
                VALUES (:main_id, :rec_id, 0, 1)
                ON CONFLICT (main_product_id, recommended_product_id)
                DO UPDATE SET negative_count = pair_feedback_stats.negative_count + 1,
                              updated_at = NOW()
            """),
            {"main_id": main_product_id, "rec_id": recommended_product_id}
        )

    await session.commit()


async def get_copurchase_stats(
    session: AsyncSession,
    product_id: int,
    candidate_ids: list[int],
) -> dict[int, int]:
    """Возвращает статистику совместных покупок для пар товаров"""
    if not candidate_ids:
        return {}
    result = await session.execute(
        text("""
            SELECT product_id_2, copurchase_count
            FROM copurchase_stats
            WHERE product_id_1 = :product_id
              AND product_id_2 = ANY(:candidate_ids)
            UNION
            SELECT product_id_1, copurchase_count
            FROM copurchase_stats
            WHERE product_id_2 = :product_id
              AND product_id_1 = ANY(:candidate_ids)
        """),
        {"product_id": product_id, "candidate_ids": candidate_ids}
    )
    return {row[0]: row[1] for row in result.fetchall()}


async def record_scenario_feedback(
    session: AsyncSession,
    scenario_id: str,
    group_name: str,
    product_id: int,
    feedback_type: str,
    user_id: int = None,
):
    await session.execute(
        text("""
            INSERT INTO scenario_feedback
                (user_id, scenario_id, group_name, product_id, feedback_type)
            VALUES (:user_id, :scenario_id, :group_name, :product_id, :feedback)
        """),
        {
            "user_id": user_id,
            "scenario_id": scenario_id,
            "group_name": group_name,
            "product_id": product_id,
            "feedback": feedback_type,
        }
    )

    if feedback_type == "positive":
        await session.execute(
            text("""
                INSERT INTO scenario_feedback_stats
                    (scenario_id, group_name, product_id, positive_count, negative_count)
                VALUES (:scenario_id, :group_name, :product_id, 1, 0)
                ON CONFLICT (scenario_id, group_name, product_id)
                DO UPDATE SET positive_count = scenario_feedback_stats.positive_count + 1,
                              updated_at = NOW()
            """),
            {"scenario_id": scenario_id, "group_name": group_name, "product_id": product_id}
        )
    else:
        await session.execute(
            text("""
                INSERT INTO scenario_feedback_stats
                    (scenario_id, group_name, product_id, positive_count, negative_count)
                VALUES (:scenario_id, :group_name, :product_id, 0, 1)
                ON CONFLICT (scenario_id, group_name, product_id)
                DO UPDATE SET negative_count = scenario_feedback_stats.negative_count + 1,
                              updated_at = NOW()
            """),
            {"scenario_id": scenario_id, "group_name": group_name, "product_id": product_id}
        )

    await session.commit()
