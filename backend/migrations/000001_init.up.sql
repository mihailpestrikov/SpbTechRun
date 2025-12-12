-- Категории
CREATE TABLE IF NOT EXISTS categories (
    id INT PRIMARY KEY,
    parent_id INT REFERENCES categories(id),
    name VARCHAR(255) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- Товары
CREATE TABLE IF NOT EXISTS products (
    id INT PRIMARY KEY,
    category_id INT REFERENCES categories(id),
    name VARCHAR(500) NOT NULL,
    url VARCHAR(500),
    price DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'RUB',
    picture VARCHAR(500),
    vendor VARCHAR(255),
    country VARCHAR(100),
    description TEXT,
    market_description TEXT,
    weight DECIMAL(10,3),
    available BOOLEAN DEFAULT true,
    params JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);
CREATE INDEX IF NOT EXISTS idx_products_vendor ON products(vendor);
CREATE INDEX IF NOT EXISTS idx_products_available ON products(available);

-- Скидки
CREATE TABLE IF NOT EXISTS promos (
    id SERIAL PRIMARY KEY,
    promo_id INT NOT NULL,
    product_id INT REFERENCES products(id),
    promo_type VARCHAR(100),
    discount_price DECIMAL(10,2),
    start_date DATE,
    end_date DATE,
    description VARCHAR(500),
    url VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_promos_product ON promos(product_id);
CREATE INDEX IF NOT EXISTS idx_promos_dates ON promos(start_date, end_date);

-- Пользователи
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Корзина
CREATE TABLE IF NOT EXISTS cart_items (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    session_id VARCHAR(255),
    product_id INT REFERENCES products(id) NOT NULL,
    quantity INT DEFAULT 1,
    added_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT cart_user_or_session CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_session ON cart_items(session_id);

-- Заказы
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    total DECIMAL(10,2) NOT NULL,
    address TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INT REFERENCES orders(id) NOT NULL,
    product_id INT REFERENCES products(id) NOT NULL,
    quantity INT NOT NULL,
    price DECIMAL(10,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- Просмотры товаров (для ML)
CREATE TABLE IF NOT EXISTS product_views (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id),
    session_id VARCHAR(255),
    product_id INT REFERENCES products(id) NOT NULL,
    viewed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_views_user ON product_views(user_id);
CREATE INDEX IF NOT EXISTS idx_product_views_product ON product_views(product_id);
CREATE INDEX IF NOT EXISTS idx_product_views_session ON product_views(session_id);
