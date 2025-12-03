#!/usr/bin/env python3
"""
Импорт эмбеддингов из CSV файла в PostgreSQL.
Запуск: python import_embeddings.py

Предварительно нужен файл embeddings.csv (из export_embeddings.py)
"""

import csv
import psycopg2

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "postgres",
    "database": "spbtechrun",
}

INPUT_FILE = "data/embeddings.csv"


def import_embeddings():
    print(f"Connecting to PostgreSQL at {DB_CONFIG['host']}:{DB_CONFIG['port']}...")
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS product_embeddings (
            product_id INTEGER PRIMARY KEY,
            embedding DOUBLE PRECISION[] NOT NULL,
            text_representation TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    conn.commit()

    cursor.execute("SELECT COUNT(*) FROM product_embeddings")
    existing = cursor.fetchone()[0]
    print(f"Existing embeddings in DB: {existing}")

    print(f"Loading {INPUT_FILE}...")
    imported = 0

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            product_id = int(row["product_id"])
            embedding = [float(x) for x in row["embedding"].split("|")]
            text_repr = row["text_representation"] or None

            cursor.execute("""
                INSERT INTO product_embeddings (product_id, embedding, text_representation)
                VALUES (%s, %s, %s)
                ON CONFLICT (product_id) DO UPDATE
                SET embedding = EXCLUDED.embedding,
                    text_representation = EXCLUDED.text_representation
            """, (product_id, embedding, text_repr))

            imported += 1
            if imported % 1000 == 0:
                conn.commit()
                print(f"Progress: {imported}")

    conn.commit()
    cursor.close()
    conn.close()

    print(f"Done! Imported: {imported}")


if __name__ == "__main__":
    import_embeddings()
