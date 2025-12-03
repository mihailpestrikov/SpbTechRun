#!/usr/bin/env python3
"""
Экспорт эмбеддингов из PostgreSQL в CSV файл.
Запуск: python export_embeddings.py

Для импорта на другой машине: python import_embeddings.py
"""

import csv
import psycopg2
import os

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "postgres",
    "database": "spbtechrun",
}

OUTPUT_FILE = "embeddings.csv"


def export_embeddings():
    print(f"Connecting to PostgreSQL at {DB_CONFIG['host']}:{DB_CONFIG['port']}...")

    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM product_embeddings")
    total = cursor.fetchone()[0]
    print(f"Total embeddings to export: {total}")

    cursor.execute("""
        SELECT product_id, embedding, text_representation
        FROM product_embeddings
        ORDER BY product_id
    """)

    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["product_id", "embedding", "text_representation"])

        count = 0
        for row in cursor:
            product_id, embedding, text_repr = row
            # Эмбеддинг как строка с разделителем |
            embedding_str = "|".join(str(x) for x in embedding)
            writer.writerow([product_id, embedding_str, text_repr or ""])
            count += 1
            if count % 1000 == 0:
                print(f"Progress: {count}/{total}")

    cursor.close()
    conn.close()

    file_size = os.path.getsize(OUTPUT_FILE) / 1024 / 1024
    print(f"Exported {count} embeddings to {OUTPUT_FILE}")
    print(f"File size: {file_size:.2f} MB")


if __name__ == "__main__":
    export_embeddings()
