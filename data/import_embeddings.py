#!/usr/bin/env python3
"""
Импорт эмбеддингов из JSON файла в PostgreSQL.
Запуск: python import_embeddings.py

Предварительно нужен файл embeddings.json (из export_embeddings.py)
"""

import json
import psycopg2
import sys

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "postgres",
    "database": "spbtechrun",
}

INPUT_FILE = "embeddings.json"


def import_embeddings():
    print(f"Loading {INPUT_FILE}...")

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    embeddings = data["embeddings"]
    print(f"Loaded {len(embeddings)} embeddings (exported at {data['exported_at']})")
    print(f"Embedding dimension: {data['embedding_dimension']}")

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

    imported = 0
    skipped = 0

    for i, emb in enumerate(embeddings):
        cursor.execute("""
            INSERT INTO product_embeddings (product_id, embedding, text_representation, created_at)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (product_id) DO UPDATE
            SET embedding = EXCLUDED.embedding,
                text_representation = EXCLUDED.text_representation,
                created_at = EXCLUDED.created_at
        """, (
            emb["product_id"],
            emb["embedding"],
            emb["text_representation"],
            emb["created_at"],
        ))
        imported += 1

        if (i + 1) % 500 == 0:
            conn.commit()
            print(f"Progress: {i + 1}/{len(embeddings)}")

    conn.commit()
    cursor.close()
    conn.close()

    print(f"Done! Imported: {imported}")


if __name__ == "__main__":
    import_embeddings()
