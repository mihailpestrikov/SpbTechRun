"""
Feature Extractor для CatBoost Ranker.
Извлекает 30+ признаков для ранжирования товаров.
"""

import numpy as np
from typing import Optional, Dict, List
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.embeddings import cosine_similarity
from ..db import queries


class FeatureExtractor:
    """
    Извлекает признаки для пары (главный товар, кандидат).

    Группы признаков:
    1. Семантические (embeddings) - 6 признаков
    2. Статистика взаимодействий (feedback) - 8 признаков
    3. Ценовые - 7 признаков
    4. Категорийные - 5 признаков
    5. Co-purchase - 3 признака
    6. Популярность - 7 признаков (view_count, cart_add_count, order_count)
    7. Контекстные (корзина) - 3 признака

    Итого: 39 признаков
    """

    def __init__(self):
        self.feature_names = self._get_feature_names()

    def _get_feature_names(self) -> List[str]:
        """Возвращает список всех признаков в правильном порядке"""
        return [
            "embedding_cosine_similarity",
            "embedding_l2_distance",
            "embedding_dot_product",
            "embedding_euclidean_distance",
            "embedding_manhattan_distance",
            "embedding_has_valid",
            "pair_feedback_positive",
            "pair_feedback_negative",
            "pair_feedback_total",
            "pair_feedback_approval_rate",
            "scenario_feedback_positive",
            "scenario_feedback_negative",
            "scenario_feedback_total",
            "scenario_feedback_approval_rate",
            "candidate_price",
            "price_ratio",
            "price_diff",
            "price_diff_percent",
            "has_discount",
            "discount_percent",
            "discount_amount",
            "same_category",
            "same_root_category",
            "category_distance",
            "same_vendor",
            "different_vendor",
            "copurchase_count",
            "copurchase_log",
            "copurchase_exists",
            "has_image",
            "is_discounted",
            "price_bucket",
            "name_length",
            "view_count",
            "cart_add_count",
            "order_count",
            "cart_similarity_max",
            "cart_similarity_avg",
            "cart_products_count",
        ]

    async def extract_features(
        self,
        main_product: Dict,
        candidate_product: Dict,
        main_embedding: Optional[List[float]],
        candidate_embedding: Optional[List[float]],
        pair_feedback: Dict,
        scenario_feedback: Dict,
        copurchase_count: int,
        cart_products: Optional[List[Dict]] = None,
        session: Optional[AsyncSession] = None,
    ) -> Dict[str, float]:
        """
        Извлекает все признаки для пары товаров.

        Returns:
            Dict с 36 признаками
        """
        features = {}

        features.update(self._extract_semantic_features(
            main_embedding, candidate_embedding
        ))

        features.update(self._extract_feedback_features(
            pair_feedback, scenario_feedback
        ))

        features.update(self._extract_price_features(
            main_product, candidate_product
        ))

        features.update(await self._extract_category_features(
            main_product, candidate_product, session
        ))

        features.update(self._extract_copurchase_features(
            copurchase_count
        ))

        features.update(self._extract_popularity_features(
            candidate_product
        ))

        if cart_products and session:
            features.update(await self._extract_cart_context_features(
                candidate_product, cart_products, session
            ))
        else:
            features["cart_similarity_max"] = 0.0
            features["cart_similarity_avg"] = 0.0
            features["cart_products_count"] = 0

        return features

    def _extract_semantic_features(
        self,
        main_embedding: Optional[List[float]],
        candidate_embedding: Optional[List[float]],
    ) -> Dict[str, float]:
        """Признаки на основе эмбеддингов"""
        if not main_embedding or not candidate_embedding:
            return {
                "embedding_cosine_similarity": 0.5,
                "embedding_l2_distance": 1.0,
                "embedding_dot_product": 0.0,
                "embedding_euclidean_distance": 1.0,
                "embedding_manhattan_distance": 1.0,
                "embedding_has_valid": 0.0,
            }

        main_vec = np.array(main_embedding, dtype=np.float32)
        candidate_vec = np.array(candidate_embedding, dtype=np.float32)

        main_norm = main_vec / (np.linalg.norm(main_vec) + 1e-8)
        cand_norm = candidate_vec / (np.linalg.norm(candidate_vec) + 1e-8)

        cosine_sim = float(cosine_similarity(main_vec, candidate_vec))
        l2_dist = float(np.linalg.norm(main_norm - cand_norm))
        dot_prod = float(np.dot(main_norm, cand_norm))
        euclidean = float(np.linalg.norm(main_vec - candidate_vec))
        manhattan = float(np.sum(np.abs(main_vec - candidate_vec)))

        return {
            "embedding_cosine_similarity": cosine_sim,
            "embedding_l2_distance": l2_dist,
            "embedding_dot_product": dot_prod,
            "embedding_euclidean_distance": euclidean,
            "embedding_manhattan_distance": manhattan,
            "embedding_has_valid": 1.0,
        }

    def _extract_feedback_features(
        self,
        pair_feedback: Dict,
        scenario_feedback: Dict,
    ) -> Dict[str, float]:
        """Признаки на основе фидбека пользователей"""
        pair_positive = pair_feedback.get("positive", 0)
        pair_negative = pair_feedback.get("negative", 0)
        pair_total = pair_positive + pair_negative

        pair_approval = (pair_positive + 1) / (pair_total + 2)

        scenario_positive = scenario_feedback.get("positive", 0)
        scenario_negative = scenario_feedback.get("negative", 0)
        scenario_total = scenario_positive + scenario_negative

        scenario_approval = (scenario_positive + 1) / (scenario_total + 2)

        return {
            "pair_feedback_positive": float(pair_positive),
            "pair_feedback_negative": float(pair_negative),
            "pair_feedback_total": float(pair_total),
            "pair_feedback_approval_rate": pair_approval,
            "scenario_feedback_positive": float(scenario_positive),
            "scenario_feedback_negative": float(scenario_negative),
            "scenario_feedback_total": float(scenario_total),
            "scenario_feedback_approval_rate": scenario_approval,
        }

    def _extract_price_features(
        self,
        main_product: Dict,
        candidate_product: Dict,
    ) -> Dict[str, float]:
        """Ценовые признаки"""
        main_price = main_product.get("price", 0)
        cand_price = candidate_product.get("price", 0)
        cand_discount = candidate_product.get("discount_price")

        price_ratio = cand_price / max(main_price, 1)
        price_diff = cand_price - main_price
        price_diff_percent = (price_diff / max(main_price, 1)) * 100

        has_discount = 1.0 if cand_discount else 0.0
        discount_percent = 0.0
        discount_amount = 0.0

        if cand_discount and cand_price > 0:
            discount_percent = ((cand_price - cand_discount) / cand_price) * 100
            discount_amount = cand_price - cand_discount

        return {
            "candidate_price": float(cand_price),
            "price_ratio": price_ratio,
            "price_diff": price_diff,
            "price_diff_percent": price_diff_percent,
            "has_discount": has_discount,
            "discount_percent": discount_percent,
            "discount_amount": discount_amount,
        }

    async def _extract_category_features(
        self,
        main_product: Dict,
        candidate_product: Dict,
        session: Optional[AsyncSession],
    ) -> Dict[str, float]:
        """Категорийные признаки"""
        main_cat = main_product.get("category_id")
        cand_cat = candidate_product.get("category_id")

        same_category = 1.0 if main_cat == cand_cat else 0.0

        same_root = 0.0
        category_distance = 3.0

        if session:
            main_root = await queries.get_root_category_id(session, main_cat)
            cand_root = await queries.get_root_category_id(session, cand_cat)

            if main_root and cand_root:
                same_root = 1.0 if main_root == cand_root else 0.0
                category_distance = 0.0 if same_root else 2.0

        main_vendor = main_product.get("vendor", "")
        cand_vendor = candidate_product.get("vendor", "")
        same_vendor = 1.0 if main_vendor and cand_vendor and main_vendor == cand_vendor else 0.0

        return {
            "same_category": same_category,
            "same_root_category": same_root,
            "category_distance": category_distance,
            "same_vendor": same_vendor,
            "different_vendor": 1.0 - same_vendor,
        }

    def _extract_copurchase_features(
        self,
        copurchase_count: int,
    ) -> Dict[str, float]:
        """Признаки совместных покупок"""
        return {
            "copurchase_count": float(copurchase_count),
            "copurchase_log": np.log1p(copurchase_count),
            "copurchase_exists": 1.0 if copurchase_count > 0 else 0.0,
        }

    def _extract_popularity_features(
        self,
        candidate_product: Dict,
    ) -> Dict[str, float]:
        """Признаки популярности товара"""
        has_image = 1.0 if candidate_product.get("picture") else 0.0
        has_discount = 1.0 if candidate_product.get("discount_price") else 0.0

        price = candidate_product.get("price", 0)
        price_bucket = 0
        if price > 10000:
            price_bucket = 2
        elif price > 1000:
            price_bucket = 1

        view_count = candidate_product.get("view_count", 0)
        cart_add_count = candidate_product.get("cart_add_count", 0)
        order_count = candidate_product.get("order_count", 0)

        return {
            "has_image": has_image,
            "is_discounted": has_discount,
            "price_bucket": float(price_bucket),
            "name_length": float(len(candidate_product.get("name", ""))),
            "view_count": np.log1p(view_count),
            "cart_add_count": np.log1p(cart_add_count),
            "order_count": np.log1p(order_count),
        }

    async def _extract_cart_context_features(
        self,
        candidate_product: Dict,
        cart_products: List[Dict],
        session: AsyncSession,
    ) -> Dict[str, float]:
        """Контекстные признаки на основе корзины"""
        if not cart_products:
            return {
                "cart_similarity_max": 0.0,
                "cart_similarity_avg": 0.0,
                "cart_products_count": 0,
            }

        cart_ids = [p["id"] for p in cart_products]
        cart_embeddings_map = await queries.get_embeddings_map(session, cart_ids)

        cand_embedding = await queries.get_product_embedding(session, candidate_product["id"])

        if not cand_embedding or not cart_embeddings_map:
            return {
                "cart_similarity_max": 0.0,
                "cart_similarity_avg": 0.0,
                "cart_products_count": len(cart_products),
            }

        cand_vec = np.array(cand_embedding, dtype=np.float32)
        similarities = []

        for cart_emb in cart_embeddings_map.values():
            if cart_emb:
                cart_vec = np.array(cart_emb, dtype=np.float32)
                sim = cosine_similarity(cand_vec, cart_vec)
                similarities.append(sim)

        max_sim = max(similarities) if similarities else 0.0
        avg_sim = np.mean(similarities) if similarities else 0.0

        return {
            "cart_similarity_max": float(max_sim),
            "cart_similarity_avg": float(avg_sim),
            "cart_products_count": len(cart_products),
        }

    def features_to_array(self, features: Dict[str, float]) -> np.ndarray:
        """Конвертирует dict признаков в numpy array в правильном порядке"""
        return np.array([features.get(name, 0.0) for name in self.feature_names])


feature_extractor = FeatureExtractor()
