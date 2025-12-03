from pydantic import BaseModel
from typing import Optional


class ProductResponse(BaseModel):
    id: int
    name: str
    price: float
    picture: Optional[str] = None
    category_name: Optional[str] = None
    discount_price: Optional[float] = None


class MatchReason(BaseModel):
    type: str  # category, feedback, semantic, discount
    text: str


class RecommendationItem(BaseModel):
    product: ProductResponse
    score: float
    rank: Optional[int] = None
    group_name: Optional[str] = None
    match_reasons: list[MatchReason] = []


class ScenarioInfo(BaseModel):
    id: str
    name: str


class ProductRecommendationsResponse(BaseModel):
    """Ответ GET /recommendations/{product_id}"""
    product_id: int
    product_name: str
    detected_scenario: Optional[ScenarioInfo] = None
    recommendations: list[RecommendationItem]
    total_count: int


class ScenarioResponse(BaseModel):
    """Краткая информация о сценарии"""
    id: str
    name: str
    description: str
    image: Optional[str] = None
    groups_count: int
    required_groups: int


class ScenarioGroupResponse(BaseModel):
    name: str
    category_ids: list[int]
    is_required: bool
    sort_order: int


class ScenarioDetailsResponse(BaseModel):
    """Детальная информация о сценарии"""
    id: str
    name: str
    description: str
    image: Optional[str] = None
    groups: list[ScenarioGroupResponse]


class ProgressInfo(BaseModel):
    completed: int
    total: int
    percentage: int


class CartProduct(BaseModel):
    id: int
    name: str
    price: float


class CompletedGroup(BaseModel):
    group_name: str
    is_required: bool
    status: str
    cart_products: list[CartProduct]


class GroupProduct(BaseModel):
    id: int
    name: str
    price: float
    picture: Optional[str] = None
    category_name: Optional[str] = None
    discount_price: Optional[float] = None
    score: float
    reason: str


class GroupRecommendation(BaseModel):
    group_name: str
    is_required: bool
    products: list[GroupProduct]


class ScenarioRecommendationsResponse(BaseModel):
    """Ответ GET /scenarios/{id}/recommendations"""
    scenario: ScenarioInfo
    progress: ProgressInfo
    recommendations: list[GroupRecommendation]
    completed_groups: list[CompletedGroup]
    all_scenarios: list[ScenarioInfo]


class FeedbackRequest(BaseModel):
    """Запрос на отправку фидбека"""
    main_product_id: Optional[int] = None  # Для Тип 1
    recommended_product_id: int
    feedback: str  # positive / negative
    context: Optional[str] = "product_page"  # product_page, scenario
    scenario_id: Optional[str] = None  # Для Тип 2
    group_name: Optional[str] = None  # Для Тип 2
    user_id: Optional[int] = None


class FeedbackResponse(BaseModel):
    success: bool
    message: str


class StatsResponse(BaseModel):
    embeddings_count: int
    faiss_index_size: int
    total_feedback: int
    positive_feedback: int
    negative_feedback: int
    scenarios_count: int
