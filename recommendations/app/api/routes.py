from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Optional

from ..db import get_session, queries
from ..services.scenarios import scenarios_service
from ..services.product_recommender import product_recommender
from ..services.scenario_recommender import scenario_recommender
from ..services.category_embeddings import category_embeddings_service
from ..services.complementarity_model import complementarity_model
from ..ml.catboost_ranker import catboost_ranker
from .schemas import (
    ProductRecommendationsResponse,
    ScenarioResponse,
    ScenarioDetailsResponse,
    ScenarioRecommendationsResponse,
    FeedbackRequest,
    FeedbackResponse,
    StatsResponse,
    RecommendationEventRequest,
    RecommendationEventResponse,
)

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


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
    limit_per_group: int = Query(default=10, le=20),
    session: AsyncSession = Depends(get_session),
):
    """
    Рекомендации для сценария с учётом корзины.
    Возвращает недостающие товары для завершения сценария.
    """
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
        await queries.record_scenario_feedback(
            session=session,
            scenario_id=request.scenario_id,
            group_name=request.group_name,
            product_id=request.recommended_product_id,
            feedback_type=request.feedback,
            user_id=request.user_id,
        )
    elif request.main_product_id:
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



@router.post("/events", response_model=RecommendationEventResponse)
async def log_recommendation_event(
    request: RecommendationEventRequest,
    session: AsyncSession = Depends(get_session),
):
    """
    Логирует событие взаимодействия с рекомендацией.

    Типы событий:
    - impression: рекомендация показана пользователю
    - click: пользователь кликнул на рекомендацию
    - add_to_cart: пользователь добавил рекомендованный товар в корзину

    """
    if request.event_type not in ("impression", "click", "add_to_cart"):
        raise HTTPException(
            status_code=400,
            detail="event_type must be 'impression', 'click', or 'add_to_cart'"
        )

    if not request.user_id and not request.session_id:
        raise HTTPException(
            status_code=400,
            detail="Either user_id or session_id must be provided"
        )

    await session.execute(
        text("""
            INSERT INTO recommendation_events
                (user_id, session_id, event_type, main_product_id, recommended_product_id,
                 recommendation_context, recommendation_rank)
            VALUES (:user_id, :session_id, :event_type, :main_product_id, :recommended_product_id,
                    :context, :rank)
        """),
        {
            "user_id": request.user_id,
            "session_id": request.session_id,
            "event_type": request.event_type,
            "main_product_id": request.main_product_id,
            "recommended_product_id": request.recommended_product_id,
            "context": request.recommendation_context,
            "rank": request.recommendation_rank,
        }
    )
    await session.commit()

    return RecommendationEventResponse(success=True, events_logged=1)


@router.post("/events/batch", response_model=RecommendationEventResponse)
async def log_recommendation_events_batch(
    events: list[RecommendationEventRequest],
    session: AsyncSession = Depends(get_session),
):
    """
    Батчевое логирование событий
    """
    if not events:
        return RecommendationEventResponse(success=True, events_logged=0)

    for event in events:
        if event.event_type not in ("impression", "click", "add_to_cart"):
            continue
        if not event.user_id and not event.session_id:
            continue

        await session.execute(
            text("""
                INSERT INTO recommendation_events
                    (user_id, session_id, event_type, main_product_id, recommended_product_id,
                     recommendation_context, recommendation_rank)
                VALUES (:user_id, :session_id, :event_type, :main_product_id, :recommended_product_id,
                        :context, :rank)
            """),
            {
                "user_id": event.user_id,
                "session_id": event.session_id,
                "event_type": event.event_type,
                "main_product_id": event.main_product_id,
                "recommended_product_id": event.recommended_product_id,
                "context": event.recommendation_context,
                "rank": event.recommendation_rank,
            }
        )

    await session.commit()

    return RecommendationEventResponse(success=True, events_logged=len(events))



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
    total_feedback = (row[0] or 0) if row else 0
    positive_feedback = (row[1] or 0) if row else 0
    negative_feedback = (row[2] or 0) if row else 0

    return StatsResponse(
        embeddings_count=embeddings_count,
        faiss_index_size=len(product_recommender.product_ids),
        total_feedback=total_feedback,
        positive_feedback=positive_feedback,
        negative_feedback=negative_feedback,
        scenarios_count=len(scenarios_service.scenarios),
    )



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
        import traceback
        print(f"Training error: {type(e).__name__}: {e}")
        traceback.print_exc()
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


@router.get("/complementary-categories/{category_id}")
async def get_complementary_categories(
    category_id: int,
    top_k: int = Query(default=10, le=50),
    min_score: float = Query(default=0.5, ge=0.0, le=1.0),
):
    """
    Возвращает топ-K комплементарных категорий для заданной категории.

    Параметры:
    - category_id: ID категории
    - top_k: количество результатов (max 50)
    - min_score: минимальный скор комплементарности (0-1)

    Возвращает:
    - category_id: ID исходной категории
    - category_name: название исходной категории
    - complementary: список комплементарных категорий с скорами и типами связи
    """
    category_name = category_embeddings_service.get_category_name(category_id)

    if not category_name:
        raise HTTPException(
            status_code=404,
            detail=f"Category {category_id} not found or has no embeddings"
        )

    complementary = complementarity_model.get_complementary_categories(
        category_id=category_id,
        top_k=top_k,
        min_score=min_score
    )

    return {
        "category_id": category_id,
        "category_name": category_name,
        "complementary": [
            {
                "category_id": cat_id,
                "name": cat_name,
                "score": round(score, 3),
                "relation_type": rel_type
            }
            for cat_id, cat_name, score, rel_type in complementary
        ]
    }


@router.get("/complementarity/model-info")
async def get_complementarity_model_info():
    """
    Возвращает информацию о модели комплементарности.

    Включает:
    - Статус модели (обучена / не обучена)
    - Размер предвычисленной матрицы
    - Количество категорий с эмбеддингами
    """
    model_info = complementarity_model.get_model_info()
    embeddings_info = category_embeddings_service.get_stats()

    return {
        **model_info,
        "category_embeddings": embeddings_info,
    }
