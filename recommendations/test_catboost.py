"""
Скрипт для тестирования CatBoost Ranker.
Запуск: python test_catboost.py
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "app"))

from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import async_session
from app.ml.catboost_ranker import catboost_ranker
from app.services.product_recommender import product_recommender


async def test_training():
    """Тест обучения модели"""
    print("\n" + "="*80)
    print("ТЕСТ 1: ОБУЧЕНИЕ CATBOOST RANKER")
    print("="*80)

    async with async_session() as session:
        try:
            # Загружаем эмбеддинги (если еще не загружены)
            if not product_recommender.index:
                print("\n[PREP] Загрузка эмбеддингов в FAISS...")
                await product_recommender.load_embeddings(session)

            # Обучаем модель
            metadata = await catboost_ranker.train_model(
                session=session,
                iterations=100,  # меньше для быстрого теста
                learning_rate=0.05,
                depth=4,
                min_feedback_count=1,  # низкий порог для теста
            )

            print("\n✅ ТЕСТ ПРОЙДЕН: Модель обучена успешно")
            print(f"   Версия: {metadata['version']}")
            print(f"   Train AUC: {metadata['metrics']['train_auc']:.4f}")
            print(f"   Val AUC: {metadata['metrics']['val_auc']:.4f}")

            return True

        except Exception as e:
            print(f"\n❌ ТЕСТ ПРОВАЛЕН: {e}")
            import traceback
            traceback.print_exc()
            return False


async def test_inference():
    """Тест inference (предсказание)"""
    print("\n" + "="*80)
    print("ТЕСТ 2: INFERENCE (РАНЖИРОВАНИЕ)")
    print("="*80)

    async with async_session() as session:
        try:
            # Проверяем что модель загружена
            model_info = catboost_ranker.get_model_info()
            print(f"\nСтатус модели: {model_info['status']}")

            if model_info['status'] != 'ready':
                print("⚠️  Модель не обучена, пропускаем тест inference")
                return True

            # Загружаем эмбеддинги
            if not product_recommender.index:
                print("\n[PREP] Загрузка эмбеддингов...")
                await product_recommender.load_embeddings(session)

            # Берем случайный товар
            from sqlalchemy import text
            result = await session.execute(
                text("SELECT id FROM products WHERE available = true LIMIT 1")
            )
            product_id = result.scalar()

            if not product_id:
                print("⚠️  Нет доступных товаров в БД")
                return False

            print(f"\n[TEST] Получаем рекомендации для товара {product_id}...")

            # Без ML
            result_formula = await product_recommender.get_recommendations(
                product_id=product_id,
                session=session,
                limit=10,
                use_ml=False,
            )

            # С ML
            result_ml = await product_recommender.get_recommendations(
                product_id=product_id,
                session=session,
                limit=10,
                use_ml=True,
            )

            print(f"\n✅ ТЕСТ ПРОЙДЕН: Inference работает")
            print(f"   Ranking method (formula): {result_formula['ranking_method']}")
            print(f"   Ranking method (ML): {result_ml['ranking_method']}")
            print(f"   Рекомендаций (formula): {len(result_formula['recommendations'])}")
            print(f"   Рекомендаций (ML): {len(result_ml['recommendations'])}")

            # Сравнение топ-3
            print("\n   Топ-3 (Formula):")
            for i, rec in enumerate(result_formula['recommendations'][:3]):
                print(f"     {i+1}. {rec['product']['name'][:50]} (score: {rec['score']:.3f})")

            print("\n   Топ-3 (CatBoost):")
            for i, rec in enumerate(result_ml['recommendations'][:3]):
                ml_score = rec.get('ml_score', rec['score'])
                print(f"     {i+1}. {rec['product']['name'][:50]} (score: {ml_score:.3f})")

            return True

        except Exception as e:
            print(f"\n❌ ТЕСТ ПРОВАЛЕН: {e}")
            import traceback
            traceback.print_exc()
            return False


async def test_model_info():
    """Тест получения информации о модели"""
    print("\n" + "="*80)
    print("ТЕСТ 3: ИНФОРМАЦИЯ О МОДЕЛИ")
    print("="*80)

    try:
        info = catboost_ranker.get_model_info()

        print(f"\nСтатус: {info['status']}")

        if info['status'] == 'ready':
            print(f"Версия: {info['version']}")
            print(f"Признаков: {info['feature_count']}")

            if info.get('metadata'):
                meta = info['metadata']
                print(f"\nМетрики:")
                if 'metrics' in meta:
                    for metric, value in meta['metrics'].items():
                        print(f"  {metric}: {value:.4f}")

                print(f"\nТоп-5 признаков:")
                if 'top_features' in meta:
                    for i, feat in enumerate(meta['top_features'][:5]):
                        print(f"  {i+1}. {feat['feature']}: {feat['importance']:.2f}")

        print("\n✅ ТЕСТ ПРОЙДЕН")
        return True

    except Exception as e:
        print(f"\n❌ ТЕСТ ПРОВАЛЕН: {e}")
        return False


async def main():
    """Запуск всех тестов"""
    print("\n" + "="*80)
    print("ТЕСТИРОВАНИЕ CATBOOST RANKER")
    print("="*80)
    print("\nЭтот скрипт проверяет:")
    print("1. Обучение модели на данных из БД")
    print("2. Inference (предсказание скоров)")
    print("3. Получение информации о модели")
    print("\n⚠️  ВАЖНО: Убедитесь что:")
    print("  - PostgreSQL запущен и содержит данные (products, feedback, orders)")
    print("  - Эмбеддинги сгенерированы")
    print("  - Есть минимум 100 примеров с фидбеком или заказами")

    input("\nНажмите Enter для продолжения...")

    results = []

    # Тест 3: Информация (до обучения)
    results.append(await test_model_info())

    # Тест 1: Обучение
    results.append(await test_training())

    # Тест 2: Inference
    results.append(await test_inference())

    # Тест 3: Информация (после обучения)
    results.append(await test_model_info())

    # Итоги
    print("\n" + "="*80)
    print("ИТОГИ ТЕСТИРОВАНИЯ")
    print("="*80)
    passed = sum(results)
    total = len(results)
    print(f"\nПройдено: {passed}/{total}")

    if passed == total:
        print("\n✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ!")
    else:
        print(f"\n⚠️  {total - passed} тест(ов) провалено")

    print("\n" + "="*80)


if __name__ == "__main__":
    asyncio.run(main())
