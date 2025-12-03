-- Эмбеддинги товаров для семантического поиска
CREATE TABLE IF NOT EXISTS product_embeddings (
    product_id INT PRIMARY KEY REFERENCES products(id),
    embedding FLOAT[] NOT NULL,
    text_representation TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Сырой фидбек на рекомендации в сценариях (Тип 2)
CREATE TABLE IF NOT EXISTS scenario_feedback (
    id SERIAL PRIMARY KEY,
    user_id INT,
    scenario_id VARCHAR(50) NOT NULL,
    group_name VARCHAR(100) NOT NULL,
    product_id INT NOT NULL,
    feedback_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scenario_feedback_scenario ON scenario_feedback(scenario_id);
CREATE INDEX IF NOT EXISTS idx_scenario_feedback_product ON scenario_feedback(product_id);

-- Агрегированная статистика фидбека для товаров в сценариях
CREATE TABLE IF NOT EXISTS scenario_feedback_stats (
    id SERIAL PRIMARY KEY,
    scenario_id VARCHAR(50) NOT NULL,
    group_name VARCHAR(100) NOT NULL,
    product_id INT NOT NULL,
    positive_count INT DEFAULT 0,
    negative_count INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scenario_stats_unique
    ON scenario_feedback_stats(scenario_id, group_name, product_id);

-- Сырой фидбек на пары товаров (Тип 1 - страница товара)
CREATE TABLE IF NOT EXISTS product_pair_feedback (
    id SERIAL PRIMARY KEY,
    user_id INT,
    main_product_id INT NOT NULL,
    recommended_product_id INT NOT NULL,
    feedback_type VARCHAR(20) NOT NULL,
    context VARCHAR(50) DEFAULT 'product_page',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pair_feedback_main ON product_pair_feedback(main_product_id);
CREATE INDEX IF NOT EXISTS idx_pair_feedback_pair ON product_pair_feedback(main_product_id, recommended_product_id);

-- Агрегированная статистика фидбека для пар товаров
CREATE TABLE IF NOT EXISTS pair_feedback_stats (
    main_product_id INT NOT NULL,
    recommended_product_id INT NOT NULL,
    positive_count INT DEFAULT 0,
    negative_count INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (main_product_id, recommended_product_id)
);

-- Статистика совместных покупок - какие товары покупают вместе
CREATE TABLE IF NOT EXISTS copurchase_stats (
    product_id_1 INT NOT NULL,
    product_id_2 INT NOT NULL,
    copurchase_count INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (product_id_1, product_id_2)
);

CREATE INDEX IF NOT EXISTS idx_copurchase_product1 ON copurchase_stats(product_id_1);
CREATE INDEX IF NOT EXISTS idx_copurchase_count ON copurchase_stats(copurchase_count);
