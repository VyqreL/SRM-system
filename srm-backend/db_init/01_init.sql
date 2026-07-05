-- ==========================================
-- 1. СТВОРЕННЯ ТАБЛИЦЬ ІЗ ЗВ'ЯЗКАМИ
-- ==========================================

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('ADMIN', 'MANAGER', 'SUPPLIER')),
    registration_token VARCHAR(255),
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT
);

CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(category_id) ON DELETE SET NULL,
    internal_sku VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    unit VARCHAR(10) NOT NULL
);

CREATE TABLE managers (
    manager_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    "position" VARCHAR(100),
    hire_date DATE DEFAULT CURRENT_DATE
);

CREATE TABLE suppliers (
    supplier_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    company_name VARCHAR(255) NOT NULL,
    edrpou VARCHAR(10),
    address TEXT,
    default_payment_terms VARCHAR(50),
    payment_deadline INTEGER DEFAULT 0,
    rating NUMERIC(3,2) DEFAULT 1.00
);

CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    supplier_id INTEGER REFERENCES suppliers(supplier_id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'Draft',
    total_sum NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE order_items (
    item_id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(order_id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(product_id) ON DELETE RESTRICT,
    ord_batches INTEGER NOT NULL,
    batch_size NUMERIC(12,3) NOT NULL,
    price_at_ord NUMERIC(12,2) NOT NULL,
    total_units NUMERIC(14,3) GENERATED ALWAYS AS (ord_batches * batch_size) STORED,
    line_total NUMERIC(15,2) GENERATED ALWAYS AS (ROUND((ord_batches * batch_size * price_at_ord), 2)) STORED,
    sup_article VARCHAR(50)
);

CREATE TABLE price_lists (
    price_id SERIAL PRIMARY KEY,
    supplier_id INTEGER REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(product_id) ON DELETE CASCADE,
    sup_article VARCHAR(50),
    wh_price NUMERIC(12,2) NOT NULL,
    moq_batches INTEGER DEFAULT 1 NOT NULL,
    batch_size NUMERIC(12,3) DEFAULT 1 NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE price_history (
    history_id SERIAL PRIMARY KEY,
    supplier_id INTEGER REFERENCES suppliers(supplier_id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(product_id) ON DELETE CASCADE,
    old_price NUMERIC(12,2),
    new_price NUMERIC(12,2),
    change_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stocks (
    stock_id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(product_id) ON DELETE CASCADE,
    quantity NUMERIC(12,3) DEFAULT 0,
    reorder_point NUMERIC(12,3) DEFAULT 10
);

CREATE TABLE product_batches (
    batch_id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(product_id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(order_id) ON DELETE SET NULL,
    prod_date DATE,
    arrival_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    exp_date DATE NOT NULL,
    curr_qty NUMERIC(12,3) NOT NULL,
    status VARCHAR(20) DEFAULT 'Active',
    CONSTRAINT chk_expiration_after_productsion CHECK (exp_date > prod_date)
);

CREATE TABLE performance_records (
    record_id SERIAL PRIMARY KEY,
    batch_id INTEGER REFERENCES product_batches(batch_id) ON DELETE CASCADE,
    delta_time INTERVAL,
    quality_rate NUMERIC(3,2),
    total_score NUMERIC(3,2)
);

-- ==========================================
-- 2. СТВОРЕННЯ VIEW (УЯВЛЕННЯ)
-- ==========================================

CREATE VIEW view_reorder_suggestions AS
 SELECT p.product_id,
    p.name,
    s.quantity AS current_stocks,
    s.reorder_point,
    pl.supplier_id,
    sup.company_name,
    pl.wh_price,
    pl.batch_size,
    pl.moq_batches
   FROM (((products p
     JOIN stocks s ON ((p.product_id = s.product_id)))
     JOIN price_lists pl ON ((p.product_id = pl.product_id)))
     JOIN suppliers sup ON ((pl.supplier_id = sup.supplier_id)))
  WHERE (s.quantity <= s.reorder_point)
  ORDER BY sup.rating DESC, pl.wh_price;

-- ==========================================
-- 3. СТВОРЕННЯ ФУНКЦІЙ ТА ПРОЦЕДУР
-- ==========================================

CREATE OR REPLACE FUNCTION check_order_status_change() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'Delivered' AND NEW.status = 'Cancelled' THEN
        RAISE EXCEPTION 'Помилка бізнес-логіки: Неможливо скасувати вже доставлене замовлення.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_product_delete() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM order_items WHERE product_id = OLD.product_id) THEN
        RAISE EXCEPTION 'Неможливо видалити товар, оскільки він міститься у існуючих замовленнях.';
    END IF;
    RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION get_order_total(p_order_id integer) RETURNS numeric
    LANGUAGE plpgsql AS $$
DECLARE
    v_total NUMERIC(10, 2);
BEGIN
    SELECT COALESCE(SUM(line_total), 0) INTO v_total
    FROM order_items
    WHERE order_id = p_order_id;
    RETURN v_total;
END;
$$;

CREATE OR REPLACE PROCEDURE proc_confirm_order(IN p_order_id integer)
    LANGUAGE plpgsql AS $$
BEGIN
    UPDATE orders
    SET status = 'Confirmed'
    WHERE order_id = p_order_id AND status = 'Draft';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Замовлення не знайдено або воно не в статусі Draft.';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION fn_prevent_suppliers_delete() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM orders 
        WHERE supplier_id = OLD.supplier_id AND status NOT IN ('Delivered', 'Cancelled')
    ) THEN
        RAISE EXCEPTION 'Неможливо видалити постачальника (ID: %) з активними замовленнями', OLD.supplier_id;
    END IF;
    RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION log_price_changes() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    IF (OLD.wh_price <> NEW.wh_price) THEN
        INSERT INTO price_history (supplier_id, product_id, old_price, new_price)
        VALUES (OLD.supplier_id, OLD.product_id, OLD.wh_price, NEW.wh_price);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_refresh_suppliers_rating() RETURNS trigger
    LANGUAGE plpgsql AS $$
BEGIN
    UPDATE suppliers
    SET rating = (
        SELECT AVG(perf.total_score)
        FROM performance_records perf
        JOIN product_batches pb ON perf.batch_id = pb.batch_id
        JOIN orders o ON pb.order_id = o.order_id
        WHERE o.supplier_id = (
            SELECT supplier_id FROM orders 
            WHERE order_id = (SELECT order_id FROM product_batches WHERE batch_id = NEW.batch_id)
        )
    )
    WHERE supplier_id = (
        SELECT supplier_id FROM orders 
        WHERE order_id = (SELECT order_id FROM product_batches WHERE batch_id = NEW.batch_id)
    );
    RETURN NEW;
END;
$$;

-- ==========================================
-- 4. СТВОРЕННЯ ТРИГЕРІВ
-- ==========================================

CREATE TRIGGER trg_check_order_status 
BEFORE UPDATE ON orders 
FOR EACH ROW EXECUTE FUNCTION check_order_status_change();

CREATE TRIGGER trg_prevent_product_delete 
BEFORE DELETE ON products 
FOR EACH ROW EXECUTE FUNCTION prevent_product_delete();

CREATE TRIGGER tr_check_suppliers_delete
BEFORE DELETE ON suppliers
FOR EACH ROW EXECUTE FUNCTION fn_prevent_suppliers_delete();

CREATE TRIGGER tr_log_price_change
AFTER UPDATE ON price_lists
FOR EACH ROW EXECUTE FUNCTION log_price_changes();

CREATE TRIGGER tr_update_rating_after_perf
AFTER INSERT OR UPDATE ON performance_records
FOR EACH ROW EXECUTE FUNCTION fn_refresh_suppliers_rating();

-- ==========================================
-- 5. ЗАПОВНЕННЯ ТЕСТОВИМИ ДАНИМИ
-- ==========================================

INSERT INTO users (user_id, email, password_hash, role, is_active) VALUES 
(1, 'supp@example.com', '$2b$12$EaaCBafujmyndxy9Thd2NOHtafOGhrXjgpK1gdr2KrjvEBKWnqhxG', 'SUPPLIER', true),
(3, 'manager1@example.com', '$2b$12$CrkyvvRHvYLniC9ueeG5y.YDh/ZXf59ljXVZpS3CIG7YOMfUyjSK2', 'MANAGER', true);
SELECT setval('users_user_id_seq', (SELECT MAX(user_id) FROM users));

INSERT INTO categories (category_id, name, description) VALUES 
(4, 'Молочні продукти', 'Товари з коротким терміном придатності'),
(5, 'Напої', 'Вода, соки, солодкі напої');
SELECT setval('categories_category_id_seq', (SELECT MAX(category_id) FROM categories));

INSERT INTO products (product_id, category_id, internal_sku, name, unit) VALUES 
(6, 4, 'SKU-MILK-001', 'Молоко 2.5%, 900г', 'шт'),
(7, 5, 'SKU-WATR-002', 'Вода мінеральна, 1.5л', 'шт');
SELECT setval('products_product_id_seq', (SELECT MAX(product_id) FROM products));

INSERT INTO managers (manager_id, user_id, first_name, last_name, phone, "position", hire_date) VALUES 
(1, 3, 'Євген', 'Студент-КМІТ', '+380501234567', 'Старший закупник', '2026-03-28');
SELECT setval('managers_manager_id_seq', (SELECT MAX(manager_id) FROM managers));

INSERT INTO suppliers (supplier_id, user_id, company_name, edrpou, address, default_payment_terms, payment_deadline, rating) VALUES 
(2, 1, 'ТОВ Галичина', '12345678', 'м. Львів, вул. Зелена, 10', 'Deferred', 14, 0.85);
SELECT setval('suppliers_supplier_id_seq', (SELECT MAX(supplier_id) FROM suppliers));

INSERT INTO orders (order_id, supplier_id, status, total_sum, created_at) VALUES 
(1, 2, 'Confirmed', 1230.23, '2026-03-28 19:42:25.966974'),
(2, 2, 'Draft', 37299.23, '2026-03-28 19:42:54.979193'),
(4, 2, 'Confirmed', 14400.00, '2026-03-29 06:45:42.006667'),
(5, 2, 'Draft', 0.00, '2026-03-29 08:16:17.233373');
SELECT setval('orders_order_id_seq', (SELECT MAX(order_id) FROM orders));

INSERT INTO order_items (item_id, order_id, product_id, ord_batches, batch_size, price_at_ord, sup_article) VALUES 
(1, 1, 6, 1, 1.000, 1230.23, 'string'),
(2, 2, 6, 1, 1.000, 1230.23, 'string'),
(3, 4, 7, 20, 6.000, 14.20, 'GAL-WATR-15'),
(4, 4, 6, 10, 12.000, 120.00, 'string');
SELECT setval('order_items_item_id_seq', (SELECT MAX(item_id) FROM order_items));

INSERT INTO price_lists (supplier_id, product_id, sup_article, wh_price, moq_batches, batch_size) VALUES 
(2, 6, 'GAL-MILK-01', 120.00, 1, 12.000),
(2, 7, 'GAL-WATR-15', 14.20, 5, 6.000);

INSERT INTO stocks (stock_id, product_id, quantity, reorder_point) VALUES 
(1, 6, 120.000, 50.000),
(2, 7, 0.000, 100.000);
SELECT setval('stocks_stock_id_seq', (SELECT MAX(stock_id) FROM stocks));