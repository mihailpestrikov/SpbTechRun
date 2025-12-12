from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db, async_session
from .services.scenarios import scenarios_service
from .services.product_recommender import product_recommender
from .services.category_embeddings import category_embeddings_service
from .services.complementarity_model import complementarity_model
from .api import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Инициализация при старте
    await init_db()

    async with async_session() as session:
        # Загружаем категории для сценариев
        await scenarios_service.initialize(session)

        # Загружаем эмбеддинги в FAISS
        await product_recommender.load_embeddings(session)

        # NEW: Загружаем эмбеддинги категорий
        await category_embeddings_service.compute_embeddings(session)

        # NEW: Модель комплементарности загружается автоматически в __init__
        # Но проверим что она загружена
        model_info = complementarity_model.get_model_info()
        if model_info["status"] == "ready":
            print(f"✓ Complementarity model loaded: {model_info['matrix_size']} pairs")
        else:
            print("⚠ Complementarity model not trained. Run: python -m app.train_complementarity")

    yield


app = FastAPI(
    title="Recommendations ML Service",
    description="ML-сервис рекомендаций для этапа ремонта White Box",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
