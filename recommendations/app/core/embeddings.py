import logging
import httpx
import numpy as np
from typing import Optional

from .config import settings

logger = logging.getLogger(__name__)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    if a is None or b is None:
        return 0.0
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def build_product_text(
    name: str,
    category_path: str = "",
    vendor: str = "",
    description: str = "",
    params: dict = None,
) -> str:
    parts = [name]
    if category_path:
        parts.append(f"Категория: {category_path}")
    if vendor:
        parts.append(f"Производитель: {vendor}")
    if description:
        parts.append(description[:500])
    if params:
        params_text = ", ".join(f"{k}: {v}" for k, v in list(params.items())[:10])
        if params_text:
            parts.append(f"Характеристики: {params_text}")
    return ". ".join(parts)


class OllamaEmbeddings:
    def __init__(self):
        self.url = f"{settings.ollama_url}/api/embeddings"
        self.model = settings.ollama_model

    async def generate(self, text: str) -> Optional[list[float]]:
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    self.url,
                    json={"model": self.model, "prompt": text},
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get("embedding")
                return None
        except httpx.TimeoutException:
            logger.warning(f"Embedding timeout for text: {text[:50]}...")
            return None
        except Exception as e:
            logger.error(f"Embedding error: {e}")
            return None

    async def generate_batch(self, texts: list[str]) -> list[Optional[list[float]]]:
        return [await self.generate(text) for text in texts]
