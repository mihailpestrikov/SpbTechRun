"""
Тип 2: Рекомендации по сценарию для главной страницы.
GET /scenarios/{id}/recommendations → недостающие товары для завершения сценария
"""

import numpy as np
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.embeddings import cosine_similarity
from ..db import queries
from .scenarios import scenarios_service, Scenario


class ScenarioRecommender:
    async def get_recommendations(
        self,
        scenario_id: str,
        cart_product_ids: list[int],
        session: AsyncSession,
        limit_per_group: int = 3,
    ) -> dict:
        """
        Возвращает рекомендации для сценария с учётом корзины.

        Алгоритм:
        1. Определяем какие группы закрыты товарами из корзины
        2. Для незакрытых групп подбираем товары (ML-скоринг)
        3. Если всё закрыто — показываем альтернативы
        """
        scenario = scenarios_service.get_scenario(scenario_id)
        if not scenario:
            return {"error": "Scenario not found"}

        # Получаем информацию о товарах в корзине
        cart_products = await queries.get_products_by_ids(session, cart_product_ids)
        cart_category_ids = [p["category_id"] for p in cart_products.values()]

        # Определяем статус групп
        groups_status = self._analyze_groups(scenario, cart_products, cart_category_ids)

        # Для незакрытых групп подбираем рекомендации
        recommendations = []
        for missing_group in groups_status["missing"]:
            group_recs = await self._get_group_recommendations(
                scenario=scenario,
                group_name=missing_group["group_name"],
                category_ids=missing_group["category_ids"],
                cart_products=cart_products,
                session=session,
                limit=limit_per_group,
            )

            if group_recs:
                recommendations.append({
                    "group_name": missing_group["group_name"],
                    "is_required": missing_group["is_required"],
                    "products": group_recs,
                })

        # Если все группы закрыты — показываем альтернативы
        if not recommendations and groups_status["completed"]:
            alternatives = await self._get_alternatives(
                scenario=scenario,
                cart_products=cart_products,
                session=session,
                limit=5,
            )
            if alternatives:
                recommendations.append({
                    "group_name": "Альтернативы",
                    "is_required": False,
                    "products": alternatives,
                })

        # Считаем прогресс
        total_required = sum(1 for g in scenario.groups if g.is_required)
        completed_required = len([
            g for g in groups_status["completed"]
            if g["is_required"]
        ])

        return {
            "scenario": {
                "id": scenario.id,
                "name": scenario.name,
            },
            "progress": {
                "completed": completed_required,
                "total": total_required,
                "percentage": int(completed_required / total_required * 100) if total_required > 0 else 0,
            },
            "recommendations": recommendations,
            "completed_groups": groups_status["completed"],
            "all_scenarios": [
                {"id": s.id, "name": s.name}
                for s in scenarios_service.scenarios.values()
            ],
        }

    def _analyze_groups(
        self,
        scenario: Scenario,
        cart_products: dict[int, dict],
        cart_category_ids: list[int],
    ) -> dict:
        """Определяет какие группы закрыты, какие нет"""
        cart_ids = set(cart_products.keys())
        completed = []
        missing = []

        for group in sorted(scenario.groups, key=lambda g: g.sort_order):
            # Какие товары из корзины закрывают эту группу?
            products_in_group = [
                cart_products[pid] for pid in cart_ids
                if cart_products[pid]["category_id"] in group.category_ids
            ]

            if products_in_group:
                completed.append({
                    "group_name": group.name,
                    "is_required": group.is_required,
                    "status": "completed",
                    "cart_products": [
                        {"id": p["id"], "name": p["name"], "price": p["price"]}
                        for p in products_in_group
                    ],
                })
            else:
                missing.append({
                    "group_name": group.name,
                    "is_required": group.is_required,
                    "status": "missing",
                    "category_ids": group.category_ids,
                })

        return {"completed": completed, "missing": missing}

    async def _get_group_recommendations(
        self,
        scenario: Scenario,
        group_name: str,
        category_ids: list[int],
        cart_products: dict[int, dict],
        session: AsyncSession,
        limit: int = 3,
    ) -> list[dict]:
        """ML-подбор товаров для группы"""
        if not category_ids:
            return []

        cart_ids = list(cart_products.keys())

        # Все товары из категорий группы
        candidates = await queries.get_products_by_categories(
            session, category_ids, exclude_ids=cart_ids, limit=100
        )

        if not candidates:
            return []

        # Получаем эмбеддинги
        candidate_ids = [p["id"] for p in candidates]
        embeddings_map = await queries.get_embeddings_map(session, candidate_ids)

        # Эмбеддинги товаров в корзине
        cart_embeddings_map = await queries.get_embeddings_map(session, cart_ids)
        cart_embeddings = [
            np.array(e, dtype=np.float32)
            for e in cart_embeddings_map.values()
            if e is not None
        ]

        # Статистика фидбека
        scenario_stats = await queries.get_scenario_feedback_stats(
            session, scenario.id, group_name, candidate_ids
        )

        # Скорируем кандидатов
        scored = []
        for product in candidates:
            pid = product["id"]
            score = self._calculate_group_score(
                product=product,
                embedding=embeddings_map.get(pid),
                cart_embeddings=cart_embeddings,
                stats=scenario_stats.get(pid, {"positive": 0, "negative": 0}),
            )

            # Причина рекомендации
            stats = scenario_stats.get(pid, {"positive": 0, "negative": 0})
            total = stats["positive"] + stats["negative"]
            if total > 0:
                approval = int((stats["positive"] / total) * 100)
                reason = f"{approval}% пользователей одобрили"
            elif product.get("discount_price"):
                discount = int((1 - product["discount_price"] / product["price"]) * 100)
                reason = f"Скидка {discount}%"
            else:
                reason = "Подходит для сценария"

            scored.append({
                "id": product["id"],
                "name": product["name"],
                "price": product["price"],
                "picture": product["picture"],
                "category_name": product["category_name"],
                "discount_price": product.get("discount_price"),
                "score": round(score, 3),
                "reason": reason,
            })

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:limit]

    def _calculate_group_score(
        self,
        product: dict,
        embedding: Optional[list],
        cart_embeddings: list[np.ndarray],
        stats: dict,
    ) -> float:
        """Скор для товара в группе (формула из ML2.md)"""
        score = 0.5  # базовый

        # === СЕМАНТИЧЕСКАЯ БЛИЗОСТЬ к корзине ===
        if embedding and cart_embeddings:
            emb_vec = np.array(embedding, dtype=np.float32)
            max_sim = max(
                cosine_similarity(emb_vec, cart_emb)
                for cart_emb in cart_embeddings
            )
            score += max_sim * 0.3  # до +0.3

        # === ФИДБЕК ===
        total = stats["positive"] + stats["negative"]
        if total > 0:
            approval_rate = (stats["positive"] + 1) / (total + 2)
            score += (approval_rate - 0.5) * 0.5  # от -0.25 до +0.25

        # === СКИДКА ===
        if product.get("discount_price") and product.get("price"):
            discount_percent = (product["price"] - product["discount_price"]) / product["price"]
            score += discount_percent * 0.2  # до +0.2

        return min(max(score, 0), 1)

    async def _get_alternatives(
        self,
        scenario: Scenario,
        cart_products: dict[int, dict],
        session: AsyncSession,
        limit: int = 5,
    ) -> list[dict]:
        """Альтернативы когда все группы закрыты"""
        alternatives = []

        for product in cart_products.values():
            # Товары из той же категории, но другого бренда
            similar = await queries.get_products_by_categories(
                session,
                [product["category_id"]],
                exclude_ids=list(cart_products.keys()),
                limit=5,
            )

            for alt in similar:
                if alt.get("vendor") != product.get("vendor"):
                    price_diff = ""
                    if alt["price"] < product["price"]:
                        diff = int((1 - alt["price"] / product["price"]) * 100)
                        price_diff = f" (-{diff}%)"

                    alternatives.append({
                        "id": alt["id"],
                        "name": alt["name"],
                        "price": alt["price"],
                        "picture": alt["picture"],
                        "category_name": alt["category_name"],
                        "discount_price": alt.get("discount_price"),
                        "score": 0.7,
                        "reason": f"Альтернатива для {product['name'][:30]}...{price_diff}",
                    })

                if len(alternatives) >= limit:
                    break

            if len(alternatives) >= limit:
                break

        return alternatives[:limit]

    async def detect_and_recommend(
        self,
        cart_product_ids: list[int],
        session: AsyncSession,
    ) -> Optional[dict]:
        """
        Автоматически определяет сценарий по корзине и возвращает рекомендации.
        Используется на главной странице.
        """
        if not cart_product_ids:
            # Пустая корзина — показываем первый сценарий
            first_scenario = list(scenarios_service.scenarios.values())[0]
            return await self.get_recommendations(
                scenario_id=first_scenario.id,
                cart_product_ids=[],
                session=session,
            )

        # Получаем категории товаров в корзине
        cart_products = await queries.get_products_by_ids(session, cart_product_ids)
        cart_category_ids = [p["category_id"] for p in cart_products.values()]

        # Определяем приоритетный сценарий
        match = scenarios_service.detect_scenario_for_cart(cart_category_ids)

        if not match:
            # Не удалось определить — берём первый сценарий
            first_scenario = list(scenarios_service.scenarios.values())[0]
            return await self.get_recommendations(
                scenario_id=first_scenario.id,
                cart_product_ids=cart_product_ids,
                session=session,
            )

        return await self.get_recommendations(
            scenario_id=match["active"]["scenario_id"],
            cart_product_ids=cart_product_ids,
            session=session,
        )


scenario_recommender = ScenarioRecommender()
