import logging
import numpy as np
import faiss
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.embeddings import cosine_similarity
from ..db import queries
from .scenarios import scenarios_service
from ..ml.catboost_ranker import catboost_ranker

logger = logging.getLogger(__name__)


class ProductRecommender:
    """
    Тип 1: Рекомендации сопутствующих товаров на странице товара.
    """

    def __init__(self):
        self.index: Optional[faiss.IndexFlatIP] = None
        self.product_ids: list[int] = []
        self.product_id_to_idx: dict[int, int] = {}
        self.embeddings_matrix: Optional[np.ndarray] = None

    async def load_embeddings(self, session: AsyncSession):
        """Загружает эмбеддинги в FAISS индекс"""
        from sqlalchemy import text

        result = await session.execute(
            text("SELECT product_id, embedding FROM product_embeddings WHERE embedding IS NOT NULL")
        )
        rows = result.fetchall()

        if not rows:
            logger.warning("No embeddings found in database")
            return

        self.product_ids = []
        self.product_id_to_idx = {}
        embeddings = []

        for i, row in enumerate(rows):
            self.product_ids.append(row[0])
            self.product_id_to_idx[row[0]] = i
            embeddings.append(np.array(row[1], dtype=np.float32))

        self.embeddings_matrix = np.vstack(embeddings)
        faiss.normalize_L2(self.embeddings_matrix)

        self.index = faiss.IndexFlatIP(self.embeddings_matrix.shape[1])
        self.index.add(self.embeddings_matrix)

        logger.info(f"Loaded {len(self.product_ids)} embeddings into FAISS index")

    async def get_recommendations(
        self,
        product_id: int,
        session: AsyncSession,
        limit: int = 20,
        use_ml: bool = True,
    ) -> dict:
        """
        Возвращает рекомендации для товара.
        Алгоритм:
        1. Определяем сценарий товара по категории
        2. Получаем кандидатов из связанных групп сценария (топ-100)
        3. Если use_ml=True и модель обучена: переранжируем с помощью CatBoost
        4. Иначе: используем формульный скоринг (эмбеддинги + фидбек + скидки)
        5. Возвращаем топ-20
        """
        product = await queries.get_product_by_id(session, product_id)
        if not product:
            return {"product_id": product_id, "recommendations": [], "error": "Product not found"}

        scenario = scenarios_service.detect_scenario_for_product(product["category_id"])
        detected_scenario = None

        if scenario:
            detected_scenario = {"id": scenario.id, "name": scenario.name}
            candidate_limit = 100 if use_ml else limit
            recommendations = await self._get_scenario_based_recommendations(
                product, scenario, session, candidate_limit
            )
        else:
            candidate_limit = 100 if use_ml else limit
            recommendations = await self._get_semantic_recommendations(
                product, session, candidate_limit
            )

        ranking_method = "formula"
        if use_ml and catboost_ranker.model and recommendations:
            try:
                candidates = [rec["product"] for rec in recommendations]
                ranked_candidates = await catboost_ranker.rank_candidates(
                    main_product=product,
                    candidates=candidates,
                    session=session,
                )

                for i, rec in enumerate(recommendations):
                    for ranked in ranked_candidates:
                        if ranked["id"] == rec["product"]["id"]:
                            rec["ml_score"] = ranked.get("ml_score", rec["score"])
                            rec["score"] = ranked.get("ml_score", rec["score"])
                            break

                recommendations.sort(key=lambda x: x["score"], reverse=True)
                ranking_method = "catboost"

            except Exception as e:
                logger.warning(f"ML ranking failed, fallback to formula: {e}")

        recommendations = recommendations[:limit]

        for i, item in enumerate(recommendations):
            item["rank"] = i + 1

        return {
            "product_id": product_id,
            "product_name": product["name"],
            "detected_scenario": detected_scenario,
            "recommendations": recommendations,
            "total_count": len(recommendations),
            "ranking_method": ranking_method,
        }

    async def _get_scenario_based_recommendations(
        self,
        product: dict,
        scenario,
        session: AsyncSession,
        limit: int,
    ) -> list[dict]:
        """Рекомендации на основе групп сценария"""
        product_id = product["id"]
        product_category = product["category_id"]

        main_embedding = await queries.get_product_embedding(session, product_id)

        all_candidates = []

        for group in scenario.groups:
            if product_category in group.category_ids:
                continue

            if not group.category_ids:
                continue

            group_products = await queries.get_products_by_categories(
                session,
                group.category_ids,
                exclude_ids=[product_id],
                limit=50,
            )

            if not group_products:
                continue

            candidate_ids = [p["id"] for p in group_products]
            embeddings_map = await queries.get_embeddings_map(session, candidate_ids)

            pair_stats = await queries.get_pair_feedback_stats(session, product_id, candidate_ids)
            scenario_stats = await queries.get_scenario_feedback_stats(
                session, scenario.id, group.name, candidate_ids
            )

            for candidate in group_products:
                cid = candidate["id"]
                score = self._calculate_score(
                    main_embedding=main_embedding,
                    candidate_embedding=embeddings_map.get(cid),
                    pair_stats=pair_stats.get(cid, {"positive": 0, "negative": 0}),
                    scenario_stats=scenario_stats.get(cid, {"positive": 0, "negative": 0}),
                    discount_price=candidate.get("discount_price"),
                    price=candidate.get("price"),
                )

                match_reasons = self._build_match_reasons(
                    candidate=candidate,
                    pair_stats=pair_stats.get(cid),
                    scenario_stats=scenario_stats.get(cid),
                    main_embedding=main_embedding,
                    candidate_embedding=embeddings_map.get(cid),
                )

                all_candidates.append({
                    "product": {
                        "id": candidate["id"],
                        "name": candidate["name"],
                        "price": candidate["price"],
                        "picture": candidate["picture"],
                        "category_name": candidate["category_name"],
                        "discount_price": candidate.get("discount_price"),
                    },
                    "score": round(score, 3),
                    "group_name": group.name,
                    "match_reasons": match_reasons,
                })

        all_candidates.sort(key=lambda x: x["score"], reverse=True)

        for i, item in enumerate(all_candidates[:limit]):
            item["rank"] = i + 1

        return all_candidates[:limit]

    async def _get_semantic_recommendations(
        self,
        product: dict,
        session: AsyncSession,
        limit: int,
    ) -> list[dict]:
        """
        Гибридные рекомендации: эмбеддинги + co-purchase + категорийный penalty.

        Формула скора:
        - base: semantic_similarity (0-1)
        - boost: co-purchase (+0.3 если покупали вместе)
        - penalty: другая root-категория (-0.15)
        """
        product_id = product["id"]

        if self.index is None or product_id not in self.product_id_to_idx:
            return []

        main_root_category = await queries.get_root_category_id(session, product["category_id"])

        idx = self.product_id_to_idx[product_id]
        query_vec = self.embeddings_matrix[idx:idx+1]

        k = min(500, len(self.product_ids))
        scores, indices = self.index.search(query_vec, k)

        candidate_ids = []
        semantic_scores = {}
        for i, score in zip(indices[0], scores[0]):
            cid = self.product_ids[i]
            if cid != product_id:
                candidate_ids.append(cid)
                semantic_scores[cid] = float(score)

        products_map = await queries.get_products_by_ids(session, candidate_ids)

        candidate_category_ids = list(set(p["category_id"] for p in products_map.values()))
        root_categories_map = await queries.get_root_categories_map(session, candidate_category_ids)

        copurchase_stats = await queries.get_copurchase_stats(session, product_id, candidate_ids)

        scored_candidates = []
        for cid, cproduct in products_map.items():
            if cproduct["category_id"] == product["category_id"]:
                continue

            base_score = semantic_scores.get(cid, 0.5)

            copurchase_count = copurchase_stats.get(cid, 0)
            copurchase_boost = min(copurchase_count * 0.15, 0.3)

            candidate_root = root_categories_map.get(cproduct["category_id"])
            category_penalty = 0
            if main_root_category and candidate_root and candidate_root != main_root_category:
                category_penalty = 0.15

            final_score = base_score + copurchase_boost - category_penalty

            match_reasons = []
            if copurchase_count > 0:
                match_reasons.append({
                    "type": "copurchase",
                    "text": f"Покупают вместе: {copurchase_count}x",
                })
            match_reasons.append({
                "type": "semantic",
                "text": f"Схожесть: {base_score:.0%}",
            })
            if category_penalty > 0:
                match_reasons.append({
                    "type": "category_cross",
                    "text": "Из смежной категории",
                })

            scored_candidates.append({
                "product": {
                    "id": cproduct["id"],
                    "name": cproduct["name"],
                    "price": cproduct["price"],
                    "picture": cproduct["picture"],
                    "category_name": cproduct["category_name"],
                    "discount_price": cproduct.get("discount_price"),
                },
                "score": round(final_score, 3),
                "group_name": "Рекомендуем к покупке" if copurchase_count > 0 else "Похожие товары",
                "match_reasons": match_reasons,
            })

        scored_candidates.sort(key=lambda x: x["score"], reverse=True)
        for i, item in enumerate(scored_candidates[:limit]):
            item["rank"] = i + 1

        return scored_candidates[:limit]

    def _calculate_score(
        self,
        main_embedding: Optional[list],
        candidate_embedding: Optional[list],
        pair_stats: dict,
        scenario_stats: dict,
        discount_price: Optional[float],
        price: Optional[float],
    ) -> float:
        """Рассчитывает итоговый скор для кандидата."""
        score = 0.5

        if main_embedding and candidate_embedding:
            main_vec = np.array(main_embedding, dtype=np.float32)
            cand_vec = np.array(candidate_embedding, dtype=np.float32)
            similarity = cosine_similarity(main_vec, cand_vec)
            score += similarity * 0.3

        pair_total = pair_stats["positive"] + pair_stats["negative"]
        if pair_total > 0:
            approval_rate = (pair_stats["positive"] + 1) / (pair_total + 2)
            score += (approval_rate - 0.5) * 0.4

        scenario_total = scenario_stats["positive"] + scenario_stats["negative"]
        if scenario_total > 0:
            approval_rate = (scenario_stats["positive"] + 1) / (scenario_total + 2)
            score += (approval_rate - 0.5) * 0.2

        if discount_price and price and price > 0:
            discount_percent = (price - discount_price) / price
            score += discount_percent * 0.1

        return min(max(score, 0), 1)

    def _build_match_reasons(
        self,
        candidate: dict,
        pair_stats: Optional[dict],
        scenario_stats: Optional[dict],
        main_embedding: Optional[list],
        candidate_embedding: Optional[list],
    ) -> list[dict]:
        """Формирует причины почему товар рекомендован"""
        reasons = []

        if candidate.get("category_name"):
            reasons.append({
                "type": "category",
                "text": f"Категория: {candidate['category_name']}",
            })

        if pair_stats:
            total = pair_stats["positive"] + pair_stats["negative"]
            if total > 0:
                approval = int((pair_stats["positive"] / total) * 100)
                reasons.append({
                    "type": "feedback",
                    "text": f"{approval}% пользователей одобрили",
                })

        if main_embedding and candidate_embedding:
            main_vec = np.array(main_embedding, dtype=np.float32)
            cand_vec = np.array(candidate_embedding, dtype=np.float32)
            similarity = cosine_similarity(main_vec, cand_vec)
            if similarity > 0.5:
                reasons.append({
                    "type": "semantic",
                    "text": f"Схожесть: {similarity:.0%}",
                })

        if candidate.get("discount_price") and candidate.get("price"):
            discount = int((1 - candidate["discount_price"] / candidate["price"]) * 100)
            if discount > 0:
                reasons.append({
                    "type": "discount",
                    "text": f"Скидка {discount}%",
                })

        return reasons


product_recommender = ProductRecommender()
