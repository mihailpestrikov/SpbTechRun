CREATE TABLE IF NOT EXISTS product_stats (
    product_id INT PRIMARY KEY REFERENCES products(id),
    view_count INT DEFAULT 0,
    cart_add_count INT DEFAULT 0,
    order_count INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_stats_popularity ON product_stats(view_count, order_count);

INSERT INTO product_stats (product_id)
SELECT id FROM products
ON CONFLICT (product_id) DO NOTHING;
