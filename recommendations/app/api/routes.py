from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional

from ..db import get_session, queries
from ..services.scenarios import scenarios_service
from ..services.product_recommender import product_recommender
from ..services.scenario_recommender import scenario_recommender
from ..ml.catboost_ranker import catboost_ranker
from .schemas import (
    ProductRecommendationsResponse,
    ScenarioResponse,
    ScenarioDetailsResponse,
    ScenarioRecommendationsResponse,
    FeedbackRequest,
    FeedbackResponse,
    StatsResponse,
)

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


# ==== ТИП 1: Рекомендации на странице товара ====

@router.get("/recommendations/{product_id}")
async def get_product_recommendations(
    product_id: int,
    limit: int = Query(default=20, le=50),
    session: AsyncSession = Depends(get_session),
):
    """
    Возвращает 20 сопутствующих товаров для конкретного товара.
    Используется на странице товара.
    """
    result = await product_recommender.get_recommendations(
        product_id=product_id,
        session=session,
        limit=limit,
    )

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return result


# ==== ТИП 2: Рекомендации по сценариям ====

@router.get("/scenarios", response_model=list[ScenarioResponse])
async def list_scenarios():
    """Список всех сценариев."""
    return scenarios_service.get_all_scenarios()


@router.get("/scenarios/{scenario_id}", response_model=ScenarioDetailsResponse)
async def get_scenario(scenario_id: str):
    """Детали сценария с группами категорий."""
    details = scenarios_service.get_scenario_details(scenario_id)
    if not details:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return details


@router.get("/scenarios/{scenario_id}/recommendations")
async def get_scenario_recommendations(
    scenario_id: str,
    cart_product_ids: str = Query(default="", description="Comma-separated product IDs in cart"),
    limit_per_group: int = Query(default=6, le=10),
    session: AsyncSession = Depends(get_session),
):
    """
    Рекомендации для сценария с учётом корзины.
    Возвращает недостающие товары для завершения сценария.
    """
    # Парсим ID товаров
    cart_ids = []
    if cart_product_ids:
        try:
            cart_ids = [int(x.strip()) for x in cart_product_ids.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid cart_product_ids format")

    result = await scenario_recommender.get_recommendations(
        scenario_id=scenario_id,
        cart_product_ids=cart_ids,
        session=session,
        limit_per_group=limit_per_group,
    )

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return result


@router.get("/recommendations/scenario/auto")
async def get_auto_scenario_recommendations(
    cart_product_ids: str = Query(default="", description="Comma-separated product IDs in cart"),
    session: AsyncSession = Depends(get_session),
):
    """
    Автоматически определяет сценарий по корзине и возвращает рекомендации.
    Используется на главной странице.
    """
    cart_ids = []
    if cart_product_ids:
        try:
            cart_ids = [int(x.strip()) for x in cart_product_ids.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid cart_product_ids format")

    result = await scenario_recommender.detect_and_recommend(
        cart_product_ids=cart_ids,
        session=session,
    )

    return result


# ==== Фидбек ====

@router.post("/feedback", response_model=FeedbackResponse)
async def post_feedback(
    request: FeedbackRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Записывает фидбек на рекомендацию.
    Поддерживает оба типа:
    - Тип 1 (product_page): main_product_id + recommended_product_id
    - Тип 2 (scenario): scenario_id + group_name + recommended_product_id
    """
    if request.feedback not in ("positive", "negative"):
        raise HTTPException(status_code=400, detail="Feedback must be 'positive' or 'negative'")

    if request.context == "scenario" and request.scenario_id and request.group_name:
        # Тип 2: Фидбек на сценарий
        await queries.record_scenario_feedback(
            session=session,
            scenario_id=request.scenario_id,
            group_name=request.group_name,
            product_id=request.recommended_product_id,
            feedback_type=request.feedback,
            user_id=request.user_id,
        )
    elif request.main_product_id:
        # Тип 1: Фидбек на пару товаров
        await queries.record_pair_feedback(
            session=session,
            main_product_id=request.main_product_id,
            recommended_product_id=request.recommended_product_id,
            feedback_type=request.feedback,
            user_id=request.user_id,
            context=request.context or "product_page",
        )
    else:
        raise HTTPException(
            status_code=400,
            detail="Either main_product_id or (scenario_id + group_name) must be provided"
        )

    return FeedbackResponse(success=True, message="Feedback recorded")


# ==== Статистика ====

@router.get("/stats", response_model=StatsResponse)
async def get_stats(session: AsyncSession = Depends(get_session)):
    """Статистика для аналитики."""
    result = await session.execute(
        text("SELECT COUNT(*) FROM product_embeddings WHERE embedding IS NOT NULL")
    )
    embeddings_count = result.scalar() or 0

    result = await session.execute(
        text("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN feedback_type = 'positive' THEN 1 ELSE 0 END) as positive,
                SUM(CASE WHEN feedback_type = 'negative' THEN 1 ELSE 0 END) as negative
            FROM (
                SELECT feedback_type FROM product_pair_feedback
                UNION ALL
                SELECT feedback_type FROM scenario_feedback
            ) combined
        """)
    )
    row = result.fetchone()
    total_feedback = row[0] or 0 if row else 0
    positive_feedback = row[1] or 0 if row else 0
    negative_feedback = row[2] or 0 if row else 0

    return StatsResponse(
        embeddings_count=embeddings_count,
        faiss_index_size=len(product_recommender.product_ids),
        total_feedback=total_feedback,
        positive_feedback=positive_feedback,
        negative_feedback=negative_feedback,
        scenarios_count=len(scenarios_service.scenarios),
    )


# ==== ML: CatBoost Ranker ====

@router.post("/ml/train")
async def train_catboost_model(
    iterations: int = Query(default=500, ge=100, le=2000),
    learning_rate: float = Query(default=0.05, ge=0.001, le=0.5),
    depth: int = Query(default=6, ge=3, le=10),
    min_feedback_count: int = Query(default=5, ge=1, le=20),
    session: AsyncSession = Depends(get_session),
):
    """
    Обучает CatBoost ранкер на исторических данных.

    Требует:
    - Минимум 100 примеров с фидбеком или заказами
    - Занимает 1-5 минут в зависимости от размера данных

    Параметры:
    - iterations: количество итераций boosting (100-2000)
    - learning_rate: скорость обучения (0.001-0.5)
    - depth: глубина деревьев (3-10)
    - min_feedback_count: минимум фидбеков для включения пары (1-20)
    """
    try:
        metadata = await catboost_ranker.train_model(
            session=session,
            iterations=iterations,
            learning_rate=learning_rate,
            depth=depth,
            min_feedback_count=min_feedback_count,
        )

        return {
            "success": True,
            "message": "Model trained successfully",
            "metadata": metadata,
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Training failed: {str(e)}"
        )


@router.get("/ml/model-info")
async def get_model_info():
    """
    Возвращает информацию о текущей CatBoost модели.

    Включает:
    - Статус модели (обучена / не обучена)
    - Версия модели
    - Метрики качества
    - Топ важных признаков
    """
    return catboost_ranker.get_model_info()


@router.get("/recommendations/{product_id}/with-ml")
async def get_product_recommendations_with_ml(
    product_id: int,
    limit: int = Query(default=20, le=50),
    use_ml: bool = Query(default=True),
    session: AsyncSession = Depends(get_session),
):
    """
    Рекомендации с явным контролем ML-ранжирования.

    Параметры:
    - use_ml: использовать CatBoost (True) или формульный скоринг (False)

    Возвращает те же рекомендации, но с индикатором метода ранжирования.
    """
    result = await product_recommender.get_recommendations(
        product_id=product_id,
        session=session,
        limit=limit,
        use_ml=use_ml,
    )

    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])

    return result
