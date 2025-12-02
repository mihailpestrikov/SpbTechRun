ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at);

UPDATE products SET updated_at = created_at WHERE updated_at IS NULL;

CREATE TABLE IF NOT EXISTS outbox (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id INT NOT NULL,
    action VARCHAR(20) NOT NULL,
    payload JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outbox_unprocessed ON outbox(created_at) WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_processed ON outbox(processed_at) WHERE processed_at IS NOT NULL;
