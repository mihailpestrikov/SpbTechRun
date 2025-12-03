from sqlalchemy import Column, Integer, String, Float, Text, TIMESTAMP, Index, Boolean
from sqlalchemy.dialects.postgresql import ARRAY
from datetime import datetime

from .database import Base


class ProductEmbedding(Base):
    """Эмбеддинги товаров для семантического поиска"""
    __tablename__ = "product_embeddings"

    product_id = Column(Integer, primary_key=True)
    embedding = Column(ARRAY(Float), nullable=False)
    text_representation = Column(Text)
    created_at = Column(TIMESTAMP, default=datetime.utcnow)


class ScenarioFeedback(Base):
    """Сырой фидбек на рекомендации в сценариях (Тип 2)"""
    __tablename__ = "scenario_feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True)
    scenario_id = Column(String(50), nullable=False)
    group_name = Column(String(100), nullable=False)
    product_id = Column(Integer, nullable=False)
    feedback_type = Column(String(20), nullable=False)  # positive / negative
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_scenario_feedback_scenario", "scenario_id"),
        Index("idx_scenario_feedback_product", "product_id"),
    )


class ScenarioFeedbackStats(Base):
    """Агрегированная статистика фидбека для товаров в сценариях"""
    __tablename__ = "scenario_feedback_stats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    scenario_id = Column(String(50), nullable=False)
    group_name = Column(String(100), nullable=False)
    product_id = Column(Integer, nullable=False)
    positive_count = Column(Integer, default=0)
    negative_count = Column(Integer, default=0)
    updated_at = Column(TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_scenario_stats_unique", "scenario_id", "group_name", "product_id", unique=True),
    )


class PairFeedback(Base):
    """Сырой фидбек на пары товаров (Тип 1 - страница товара)"""
    __tablename__ = "product_pair_feedback"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True)
    main_product_id = Column(Integer, nullable=False)
    recommended_product_id = Column(Integer, nullable=False)
    feedback_type = Column(String(20), nullable=False)  # positive / negative
    context = Column(String(50), default="product_page")  # product_page / scenario / cart
    created_at = Column(TIMESTAMP, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_pair_feedback_main", "main_product_id"),
        Index("idx_pair_feedback_pair", "main_product_id", "recommended_product_id"),
    )


class PairFeedbackStats(Base):
    """Агрегированная статистика фидбека для пар товаров"""
    __tablename__ = "pair_feedback_stats"

    main_product_id = Column(Integer, primary_key=True)
    recommended_product_id = Column(Integer, primary_key=True)
    positive_count = Column(Integer, default=0)
    negative_count = Column(Integer, default=0)
    updated_at = Column(TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow)


class CopurchaseStats(Base):
    """Статистика совместных покупок - какие товары покупают вместе"""
    __tablename__ = "copurchase_stats"

    product_id_1 = Column(Integer, primary_key=True)
    product_id_2 = Column(Integer, primary_key=True)
    copurchase_count = Column(Integer, default=0)  # сколько раз покупали вместе
    updated_at = Column(TIMESTAMP, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("idx_copurchase_product1", "product_id_1"),
        Index("idx_copurchase_count", "copurchase_count"),
    )
