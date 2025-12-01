import os
import csv
import json
from decimal import Decimal
from datetime import datetime
import psycopg2
from psycopg2.extras import execute_values

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

DB_CONFIG = {
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
    "user": os.getenv("POSTGRES_USER", "postgres"),
    "password": os.getenv("POSTGRES_PASSWORD", "postgres"),
    "dbname": os.getenv("POSTGRES_DB", "spbtechrun"),
}

PRODUCT_COLUMNS = {
    "offer_id",
    "available",
    "url",
    "price",
    "currency",
    "category_id",
    "picture",
    "sales_notes",
    "delivery",
    "local_delivery_cost",
    "name",
    "vendor",
    "country_of_origin",
    "description",
    "market_description",
    "weight",
}


def get_connection():
    """Создаёт подключение к PostgreSQL."""
    return psycopg2.connect(**DB_CONFIG)


def load_categories(conn, filepath: str):
    """Загружает категории из CSV."""
    print(f"Загрузка категорий из {filepath}...")

    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    # Парсим все категории
    categories = []
    for r in rows:
        cat_id = int(r["category_id"])
        parent_id = int(r["parent_id"]) if r["parent_id"] else None
        name = r["name"]
        categories.append((cat_id, parent_id, name))

    with conn.cursor() as cur:
        # Очищаем таблицу
        cur.execute("TRUNCATE categories CASCADE")

        # Временно отключаем FK constraint
        cur.execute("ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_parent_id_fkey")
        conn.commit()

        # Вставляем все категории
        execute_values(
            cur,
            "INSERT INTO categories (id, parent_id, name) VALUES %s ON CONFLICT (id) DO NOTHING",
            categories
        )
        conn.commit()

        # Восстанавливаем FK constraint
        cur.execute("""
            ALTER TABLE categories
            ADD CONSTRAINT categories_parent_id_fkey
            FOREIGN KEY (parent_id) REFERENCES categories(id)
        """)
        conn.commit()

    print(f"  Загружено {len(categories)} категорий")


def load_products(conn, filepath: str, batch_size: int = 1000):
    """Загружает товары из CSV."""
    print(f"Загрузка товаров из {filepath}...")

    with conn.cursor() as cur:
        cur.execute("TRUNCATE products CASCADE")
    conn.commit()

    # Получаем существующие category_id
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM categories")
        valid_categories = {row[0] for row in cur.fetchall()}

    inserted = 0
    skipped = 0
    batch = []

    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames

        # Определяем колонки параметров (начинаются с param_)
        param_columns = [c for c in columns if c.startswith("param_")]

        for row in reader:
            # Проверяем category_id
            category_id = int(row["category_id"]) if row["category_id"] else None
            if category_id and category_id not in valid_categories:
                skipped += 1
                continue

            # Собираем параметры в JSON
            params = {}
            for col in param_columns:
                value = row.get(col, "").strip()
                if value:
                    param_name = col.replace("param_", "")
                    params[param_name] = value

            product = (
                int(row["offer_id"]),                                      # id
                category_id,                                               # category_id
                row["name"][:500] if row["name"] else "Без названия",     # name
                row.get("url", "")[:500] or None,                         # url
                Decimal(row["price"]) if row["price"] else Decimal("0"),  # price
                row.get("currency", "RUB")[:3] or "RUB",                  # currency
                row.get("picture", "")[:500] or None,                     # picture
                row.get("vendor", "")[:255] or None,                      # vendor
                row.get("country_of_origin", "")[:100] or None,           # country
                row.get("description") or None,                           # description
                row.get("market_description") or None,                    # market_description
                Decimal(row["weight"]) if row.get("weight") else None,    # weight
                row.get("available", "true").lower() == "true",           # available
                json.dumps(params, ensure_ascii=False) if params else "{}", # params
            )

            batch.append(product)

            if len(batch) >= batch_size:
                _insert_products_batch(conn, batch)
                inserted += len(batch)
                print(f"  Вставлено {inserted} товаров...", end="\r")
                batch = []

        if batch:
            _insert_products_batch(conn, batch)
            inserted += len(batch)

    print(f"  Загружено {inserted} товаров, пропущено {skipped} (несуществующие категории)")


def _insert_products_batch(conn, batch):
    """Вставляет батч товаров."""
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO products (id, category_id, name, url, price, currency, picture,
                                  vendor, country, description, market_description,
                                  weight, available, params)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                category_id = EXCLUDED.category_id,
                name = EXCLUDED.name,
                url = EXCLUDED.url,
                price = EXCLUDED.price,
                currency = EXCLUDED.currency,
                picture = EXCLUDED.picture,
                vendor = EXCLUDED.vendor,
                country = EXCLUDED.country,
                description = EXCLUDED.description,
                market_description = EXCLUDED.market_description,
                weight = EXCLUDED.weight,
                available = EXCLUDED.available,
                params = EXCLUDED.params
            """,
            batch
        )
    conn.commit()


def load_promos(conn, filepath: str, batch_size: int = 1000):
    """Загружает скидки/акции из CSV."""
    print(f"Загрузка скидок из {filepath}...")

    with conn.cursor() as cur:
        cur.execute("TRUNCATE promos")
    conn.commit()

    with conn.cursor() as cur:
        cur.execute("SELECT id FROM products")
        valid_products = {row[0] for row in cur.fetchall()}

    inserted = 0
    skipped = 0
    batch = []

    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)

        for row in reader:
            product_id = int(row["offer_id"]) if row["offer_id"] else None
            if product_id and product_id not in valid_products:
                skipped += 1
                continue

            start_date = None
            end_date = None
            if row.get("start_date"):
                try:
                    start_date = datetime.strptime(row["start_date"], "%Y-%m-%d").date()
                except ValueError:
                    pass
            if row.get("end_date"):
                try:
                    end_date = datetime.strptime(row["end_date"], "%Y-%m-%d").date()
                except ValueError:
                    pass

            promo = (
                int(row["promo_id"]) if row["promo_id"] else 0,           # promo_id
                product_id,                                                # product_id
                row.get("promo_type", "")[:100] or None,                  # promo_type
                Decimal(row["discount_price"]) if row.get("discount_price") else None,  # discount_price
                start_date,                                                # start_date
                end_date,                                                  # end_date
                row.get("description", "")[:500] or None,                 # description
                row.get("url", "")[:500] or None,                         # url
            )

            batch.append(promo)

            if len(batch) >= batch_size:
                _insert_promos_batch(conn, batch)
                inserted += len(batch)
                print(f"  Вставлено {inserted} скидок...", end="\r")
                batch = []

        if batch:
            _insert_promos_batch(conn, batch)
            inserted += len(batch)

    print(f"  Загружено {inserted} скидок, пропущено {skipped} (несуществующие товары)")


def _insert_promos_batch(conn, batch):
    """Вставляет батч скидок."""
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO promos (promo_id, product_id, promo_type, discount_price,
                               start_date, end_date, description, url)
            VALUES %s
            """,
            batch
        )
    conn.commit()


def main():
    print("=" * 50)
    print("Загрузка данных в PostgreSQL")
    print("=" * 50)
    print(f"Хост: {DB_CONFIG['host']}:{DB_CONFIG['port']}")
    print(f"База: {DB_CONFIG['dbname']}")
    print()

    conn = get_connection()

    try:
        # 1. Категории (сначала, т.к. товары ссылаются на них)
        categories_file = os.path.join(DATA_DIR, "categories.csv")
        if os.path.exists(categories_file):
            load_categories(conn, categories_file)
        else:
            print(f"Файл {categories_file} не найден, пропускаем")

        # 2. Товары
        products_file = os.path.join(DATA_DIR, "offers_expanded.csv")
        if os.path.exists(products_file):
            load_products(conn, products_file)
        else:
            print(f"Файл {products_file} не найден, пропускаем")

        # 3. Скидки (после товаров, т.к. ссылаются на них)
        promos_file = os.path.join(DATA_DIR, "promos.csv")
        if os.path.exists(promos_file):
            load_promos(conn, promos_file)
        else:
            print(f"Файл {promos_file} не найден, пропускаем")

        print()
        print("=" * 50)
        print("Загрузка завершена!")
        print("=" * 50)

        # Статистика
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM categories")
            print(f"Категорий: {cur.fetchone()[0]}")

            cur.execute("SELECT COUNT(*) FROM products")
            print(f"Товаров: {cur.fetchone()[0]}")

            cur.execute("SELECT COUNT(*) FROM promos")
            print(f"Скидок: {cur.fetchone()[0]}")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
