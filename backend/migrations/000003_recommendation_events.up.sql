-- Таблица для логирования событий рекомендаций
CREATE TABLE IF NOT EXISTS recommendation_events (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    session_id VARCHAR(255),
    event_type VARCHAR(20) NOT NULL,  -- 'impression', 'click', 'add_to_cart'
    main_product_id INT REFERENCES products(id) NOT NULL,
    recommended_product_id INT REFERENCES products(id) NOT NULL,
    recommendation_context VARCHAR(50),  -- 'product_page', 'scenario_page'
    recommendation_rank INT,  -- позиция в списке рекомендаций (1-20)
    created_at TIMESTAMP DEFAULT NOW(),

    CONSTRAINT event_user_or_session CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX idx_recommendation_events_user ON recommendation_events(user_id);
CREATE INDEX idx_recommendation_events_session ON recommendation_events(session_id);
CREATE INDEX idx_recommendation_events_type ON recommendation_events(event_type);
CREATE INDEX idx_recommendation_events_main_product ON recommendation_events(main_product_id);
CREATE INDEX idx_recommendation_events_created_at ON recommendation_events(created_at);

-- Для быстрого расчета CTR
CREATE INDEX idx_recommendation_events_main_recommended ON recommendation_events(main_product_id, recommended_product_id, event_type);
