#!/usr/bin/env python3
"""
Расчет статистики совместных покупок из order_items.
Запуск: docker exec spbtechrun-recommendations-1 python -m app.update_copurchase
"""

import asyncio
from sqlalchemy import text
from itertools import combinations

from .db.database import async_session, init_db


async def update_copurchase_stats():
    """Пересчитывает статистику co-purchase из order_items"""
    await init_db()

    async with async_session() as session:
        # Создаем таблицу если не существует
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS copurchase_stats (
                product_id_1 INTEGER NOT NULL,
                product_id_2 INTEGER NOT NULL,
                copurchase_count INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (product_id_1, product_id_2)
            )
        """))
        await session.commit()

        # Получаем все заказы с товарами
        result = await session.execute(text("""
            SELECT order_id, ARRAY_AGG(product_id) as product_ids
            FROM order_items
            GROUP BY order_id
            HAVING COUNT(*) >= 2
        """))
        orders = result.fetchall()

        print(f"Found {len(orders)} orders with 2+ items")

        # Считаем пары
        pair_counts = {}
        for order_id, product_ids in orders:
            # Генерируем все пары товаров в заказе
            for p1, p2 in combinations(sorted(set(product_ids)), 2):
                key = (min(p1, p2), max(p1, p2))
                pair_counts[key] = pair_counts.get(key, 0) + 1

        print(f"Found {len(pair_counts)} unique product pairs")

        # Очищаем старую статистику
        await session.execute(text("TRUNCATE copurchase_stats"))

        # Вставляем новую
        for (p1, p2), count in pair_counts.items():
            await session.execute(
                text("""
                    INSERT INTO copurchase_stats (product_id_1, product_id_2, copurchase_count)
                    VALUES (:p1, :p2, :count)
                """),
                {"p1": p1, "p2": p2, "count": count}
            )

        await session.commit()
        print(f"Updated copurchase_stats with {len(pair_counts)} pairs")

        # Показываем топ пар
        result = await session.execute(text("""
            SELECT cs.product_id_1, p1.name, cs.product_id_2, p2.name, cs.copurchase_count
            FROM copurchase_stats cs
            JOIN products p1 ON cs.product_id_1 = p1.id
            JOIN products p2 ON cs.product_id_2 = p2.id
            ORDER BY cs.copurchase_count DESC
            LIMIT 10
        """))
        print("\nTop 10 co-purchased pairs:")
        for row in result.fetchall():
            print(f"  {row[4]}x: {row[1][:40]} + {row[3][:40]}")


if __name__ == "__main__":
    asyncio.run(update_copurchase_stats())
