#!/usr/bin/env python3
"""
Экспорт эмбеддингов из PostgreSQL в JSON файл.
Запуск: python export_embeddings.py

Для импорта на другой машине: python import_embeddings.py
"""

import json
import psycopg2
import sys
from datetime import datetime

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "postgres",
    "database": "spbtechrun",
}

OUTPUT_FILE = "embeddings.json"


def export_embeddings():
    print(f"Connecting to PostgreSQL at {DB_CONFIG['host']}:{DB_CONFIG['port']}...")

    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM product_embeddings")
    total = cursor.fetchone()[0]
    print(f"Total embeddings to export: {total}")

    cursor.execute("""
        SELECT product_id, embedding, text_representation, created_at
        FROM product_embeddings
        ORDER BY product_id
    """)

    embeddings = []
    for row in cursor:
        product_id, embedding, text_repr, created_at = row
        embeddings.append({
            "product_id": product_id,
            "embedding": embedding,
            "text_representation": text_repr,
            "created_at": created_at.isoformat() if created_at else None,
        })

    cursor.close()
    conn.close()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump({
            "exported_at": datetime.utcnow().isoformat(),
            "total_count": len(embeddings),
            "embedding_dimension": len(embeddings[0]["embedding"]) if embeddings else 0,
            "embeddings": embeddings,
        }, f, ensure_ascii=False)

    print(f"Exported {len(embeddings)} embeddings to {OUTPUT_FILE}")
    print(f"File size: {round(len(open(OUTPUT_FILE).read()) / 1024 / 1024, 2)} MB")


if __name__ == "__main__":
    export_embeddings()
