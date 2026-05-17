--
-- PostgreSQL database dump
--

\restrict ZBCLQVynaOTcSK6j86NBdODOT2RY0YErR9h4JHZgKy1bdsoaVu4SPhYTNu2BjMb

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

-- Started on 2026-03-28 16:02:24

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 247 (class 1255 OID 17379)
-- Name: fn_check_stocks_alert(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_check_stocks_alert(p_product_id integer) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_qty NUMERIC(12,3);
    v_limit NUMERIC(12,3);
BEGIN
    SELECT quantity, reorder_point INTO v_qty, v_limit 
    FROM stocks WHERE product_id = p_product_id;
    
    IF v_qty <= v_limit THEN
        RETURN 'REORDER';
    ELSE
        RETURN 'OK';
    END IF;
END;
$$;


ALTER FUNCTION public.fn_check_stocks_alert(p_product_id integer) OWNER TO postgres;

--
-- TOC entry 244 (class 1255 OID 17374)
-- Name: fn_check_suppliers_delete(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_check_suppliers_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Перевіряємо наявність незавершених замовлень у таблиці Orders
    IF EXISTS (
        SELECT 1 
        FROM Orders 
        WHERE supplier_id = OLD.supplier_id 
          AND status != 'Delivered'
    ) THEN
        RAISE EXCEPTION 'Неможливо видалити постачальника з активними замовленнями';
    END IF;

    RETURN OLD;
END;
$$;


ALTER FUNCTION public.fn_check_suppliers_delete() OWNER TO postgres;

--
-- TOC entry 245 (class 1255 OID 17375)
-- Name: fn_prevent_suppliers_delete(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_prevent_suppliers_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM Orders 
        WHERE supplier_id = OLD.supplier_id AND status NOT IN ('Delivered', 'Cancelled')
    ) THEN
        RAISE EXCEPTION 'Неможливо видалити постачальника (ID: %) з активними замовленнями', OLD.supplier_id;
    END IF;
    RETURN OLD;
END;
$$;


ALTER FUNCTION public.fn_prevent_suppliers_delete() OWNER TO postgres;

--
-- TOC entry 246 (class 1255 OID 17377)
-- Name: fn_refresh_suppliers_rating(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.fn_refresh_suppliers_rating() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE suppliers
    SET rating = (
        SELECT AVG(perf.total_score)
        FROM performance_records perf
        JOIN product_batches pb ON perf.batch_id = pb.batch_id
        JOIN Orders o ON pb.order_id = o.order_id
        WHERE o.supplier_id = (
            SELECT supplier_id FROM Orders 
            WHERE order_id = (SELECT order_id FROM product_batches WHERE batch_id = NEW.batch_id)
        )
    )
    WHERE supplier_id = (
        SELECT supplier_id FROM Orders 
        WHERE order_id = (SELECT order_id FROM product_batches WHERE batch_id = NEW.batch_id)
    );
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.fn_refresh_suppliers_rating() OWNER TO postgres;

--
-- TOC entry 248 (class 1255 OID 17381)
-- Name: log_price_changes(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.log_price_changes() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (OLD.wh_price <> NEW.wh_price) THEN
        INSERT INTO Price_History (supplier_id, product_id, old_price, new_price)
        VALUES (OLD.supplier_id, OLD.product_id, OLD.wh_price, NEW.wh_price);
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.log_price_changes() OWNER TO postgres;

--
-- TOC entry 260 (class 1255 OID 17380)
-- Name: sp_place_simple_order(integer, integer, integer); Type: PROCEDURE; Schema: public; Owner: postgres
--

CREATE PROCEDURE public.sp_place_simple_order(IN p_supplier_id integer, IN p_product_id integer, IN p_batches integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_order_id INTEGER;
    v_price NUMERIC(12,2);
    v_sup_article VARCHAR(50);
    v_batch_size INTEGER;
    v_line_total NUMERIC(15,2);
BEGIN
    -- 1. Отримуємо актуальні дані з прайс-листа
    SELECT wh_price, sup_article, batch_size 
    INTO v_price, v_sup_article, v_batch_size
    FROM price_lists 
    WHERE supplier_id = p_supplier_id AND product_id = p_product_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Товар не знайдено у прайс-листі цього постачальника';
    END IF;

    -- 2. Створюємо нове замовлення (спрощена логіка для ПЗ3)
    INSERT INTO Orders (supplier_id, status, created_at)
    VALUES (p_supplier_id, 'Draft', CURRENT_TIMESTAMP)
    RETURNING order_id INTO v_order_id;

    -- 3. Додаємо товар у специфікацію (sup_article копіюється сюди!)
    INSERT INTO order_items (
        order_id, 
        product_id, 
        sup_article, 
        ord_batches, 
        batch_size, 
        price_at_ord
    ) VALUES (
        v_order_id, 
        p_product_id, 
        v_sup_article, 
        p_batches, 
        v_batch_size, 
        v_price
    );

    -- 4. Оновлюємо загальну суму замовлення
    -- (Хоча в нас є згенеровані поля, суму в заголовку Orders треба оновити)
    UPDATE Orders 
    SET total_sum = (SELECT SUM(line_total) FROM order_items WHERE order_id = v_order_id)
    WHERE order_id = v_order_id;

    COMMIT;
END;
$$;


ALTER PROCEDURE public.sp_place_simple_order(IN p_supplier_id integer, IN p_product_id integer, IN p_batches integer) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 224 (class 1259 OID 17146)
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    category_id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- TOC entry 223 (class 1259 OID 17145)
-- Name: categories_category_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.categories_category_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.categories_category_id_seq OWNER TO postgres;

--
-- TOC entry 5083 (class 0 OID 0)
-- Dependencies: 223
-- Name: categories_category_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.categories_category_id_seq OWNED BY public.categories.category_id;


--
-- TOC entry 222 (class 1259 OID 17131)
-- Name: managers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.managers (
    manager_id integer NOT NULL,
    user_id integer NOT NULL,
    first_name character varying(100),
    last_name character varying(100),
    phone character varying(20),
    "position" character varying(100),
    hire_date date DEFAULT CURRENT_DATE
);


ALTER TABLE public.managers OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 17130)
-- Name: managers_manager_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.managers_manager_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.managers_manager_id_seq OWNER TO postgres;

--
-- TOC entry 5084 (class 0 OID 0)
-- Dependencies: 221
-- Name: managers_manager_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.managers_manager_id_seq OWNED BY public.managers.manager_id;


--
-- TOC entry 238 (class 1259 OID 17273)
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    item_id integer NOT NULL,
    order_id integer,
    product_id integer,
    ord_batches integer NOT NULL,
    batch_size numeric(12,3) NOT NULL,
    price_at_ord numeric(12,2) NOT NULL,
    total_units numeric(14,3) GENERATED ALWAYS AS (((ord_batches)::numeric * batch_size)) STORED,
    line_total numeric(15,2) GENERATED ALWAYS AS (round((((ord_batches)::numeric * batch_size) * price_at_ord), 2)) STORED,
    sup_article character varying(50)
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- TOC entry 237 (class 1259 OID 17272)
-- Name: order_items_item_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_items_item_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_items_item_id_seq OWNER TO postgres;

--
-- TOC entry 5085 (class 0 OID 0)
-- Dependencies: 237
-- Name: order_items_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_items_item_id_seq OWNED BY public.order_items.item_id;


--
-- TOC entry 236 (class 1259 OID 17257)
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    order_id SERIAL PRIMARY KEY NOT NULL,
    supplier_id integer,
    status character varying(50) DEFAULT 'Draft'::character varying,
    total_sum numeric(15,2) DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- TOC entry 5086 (class 0 OID 0)
-- Dependencies: 235
-- Name: orders_order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orders_order_id_seq OWNED BY public.orders.order_id;


--
-- TOC entry 242 (class 1259 OID 17318)
-- Name: performance_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.performance_records (
    record_id integer NOT NULL,
    batch_id integer,
    delta_time interval,
    quality_rate numeric(3,2),
    total_score numeric(3,2)
);


ALTER TABLE public.performance_records OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 17317)
-- Name: performance_records_record_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.performance_records_record_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.performance_records_record_id_seq OWNER TO postgres;

--
-- TOC entry 5087 (class 0 OID 0)
-- Dependencies: 241
-- Name: performance_records_record_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.performance_records_record_id_seq OWNED BY public.performance_records.record_id;


--
-- TOC entry 232 (class 1259 OID 17221)
-- Name: price_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.price_history (
    history_id bigint NOT NULL,
    supplier_id integer,
    product_id integer,
    old_price numeric(12,2),
    new_price numeric(12,2),
    change_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.price_history OWNER TO postgres;

--
-- TOC entry 231 (class 1259 OID 17220)
-- Name: price_history_history_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.price_history_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.price_history_history_id_seq OWNER TO postgres;

--
-- TOC entry 5088 (class 0 OID 0)
-- Dependencies: 231
-- Name: price_history_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.price_history_history_id_seq OWNED BY public.price_history.history_id;


--
-- TOC entry 230 (class 1259 OID 17195)
-- Name: price_lists; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.price_lists (
    price_id integer NOT NULL,
    supplier_id integer,
    product_id integer,
    sup_article character varying(50),
    wh_price numeric(12,2) NOT NULL,
    moq_batches integer DEFAULT 1 NOT NULL,
    batch_size numeric(12,3) DEFAULT 1 NOT NULL,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.price_lists OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 17194)
-- Name: price_lists_price_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.price_lists_price_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.price_lists_price_id_seq OWNER TO postgres;

--
-- TOC entry 5089 (class 0 OID 0)
-- Dependencies: 229
-- Name: price_lists_price_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.price_lists_price_id_seq OWNED BY public.price_lists.price_id;


--
-- TOC entry 226 (class 1259 OID 17157)
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.products (
    product_id integer NOT NULL,
    category_id integer,
    internal_sku character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    unit character varying(10) NOT NULL
);


ALTER TABLE public.products OWNER TO postgres;

--
-- TOC entry 240 (class 1259 OID 17296)
-- Name: product_batches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_batches (
    batch_id integer NOT NULL,
    product_id integer,
    order_id integer,
    prod_date date,
    arrival_date timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    exp_date date NOT NULL,
    curr_qty numeric(12,3) NOT NULL,
    status character varying(20) DEFAULT 'Active'::character varying,
    CONSTRAINT chk_expiration_after_productsion CHECK ((exp_date > prod_date))
);


ALTER TABLE public.product_batches OWNER TO postgres;

--
-- TOC entry 239 (class 1259 OID 17295)
-- Name: product_batches_batch_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.product_batches_batch_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.product_batches_batch_id_seq OWNER TO postgres;

--
-- TOC entry 5090 (class 0 OID 0)
-- Dependencies: 239
-- Name: product_batches_batch_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.product_batches_batch_id_seq OWNED BY public.product_batches.batch_id;


--
-- TOC entry 225 (class 1259 OID 17156)
-- Name: products_product_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.products_product_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.products_product_id_seq OWNER TO postgres;

--
-- TOC entry 5091 (class 0 OID 0)
-- Dependencies: 225
-- Name: products_product_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.products_product_id_seq OWNED BY public.products.product_id;


--
-- TOC entry 234 (class 1259 OID 17240)
-- Name: stocks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.stocks (
    stock_id integer NOT NULL,
    product_id integer,
    quantity numeric(12,3) DEFAULT 0,
    reorder_point numeric(12,3) DEFAULT 10
);


ALTER TABLE public.stocks OWNER TO postgres;

--
-- TOC entry 233 (class 1259 OID 17239)
-- Name: stocks_stock_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.stocks_stock_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.stocks_stock_id_seq OWNER TO postgres;

--
-- TOC entry 5092 (class 0 OID 0)
-- Dependencies: 233
-- Name: stocks_stock_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.stocks_stock_id_seq OWNED BY public.stocks.stock_id;


--
-- TOC entry 228 (class 1259 OID 17175)
-- Name: suppliers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.suppliers (
    supplier_id integer NOT NULL,
    user_id integer,
    company_name character varying(255) NOT NULL,
    edrpou character varying(10),
    address text,
    default_payment_terms character varying(50),
    payment_deadline integer DEFAULT 0,
    rating numeric(3,2) DEFAULT 1.00
);


ALTER TABLE public.suppliers OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 17174)
-- Name: suppliers_supplier_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.suppliers_supplier_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.suppliers_supplier_id_seq OWNER TO postgres;

--
-- TOC entry 5093 (class 0 OID 0)
-- Dependencies: 227
-- Name: suppliers_supplier_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.suppliers_supplier_id_seq OWNED BY public.suppliers.supplier_id;


--
-- TOC entry 220 (class 1259 OID 17115)
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    user_id integer NOT NULL,
    email character varying(255) UNIQUE NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20),
    registration_token character varying(255),
    is_active boolean DEFAULT true,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY ((ARRAY['ADMIN'::character varying, 'MANAGER'::character varying, 'SUPPLIER'::character varying])::text[])))
);


ALTER TABLE public.users OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 17114)
-- Name: users_user_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.users_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_user_id_seq OWNER TO postgres;

--
-- TOC entry 5094 (class 0 OID 0)
-- Dependencies: 219
-- Name: users_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.users_user_id_seq OWNED BY public.users.user_id;


--
-- TOC entry 243 (class 1259 OID 17385)
-- Name: view_reorder_suggestions; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.view_reorder_suggestions AS
 SELECT p.product_id,
    p.name,
    s.quantity AS current_stocks,
    s.reorder_point,
    pl.supplier_id,
    sup.company_name,
    pl.wh_price
   FROM (((public.products p
     JOIN public.stocks s ON ((p.product_id = s.product_id)))
     JOIN public.price_lists pl ON ((p.product_id = pl.product_id)))
     JOIN public.suppliers sup ON ((pl.supplier_id = sup.supplier_id)))
  WHERE (s.quantity <= s.reorder_point)
  ORDER BY sup.rating DESC, pl.wh_price;


ALTER VIEW public.view_reorder_suggestions OWNER TO postgres;

--
-- TOC entry 4824 (class 2604 OID 17149)
-- Name: categories category_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories ALTER COLUMN category_id SET DEFAULT nextval('public.categories_category_id_seq'::regclass);


--
-- TOC entry 4822 (class 2604 OID 17134)
-- Name: managers manager_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.managers ALTER COLUMN manager_id SET DEFAULT nextval('public.managers_manager_id_seq'::regclass);


--
-- TOC entry 4842 (class 2604 OID 17276)
-- Name: order_items item_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items ALTER COLUMN item_id SET DEFAULT nextval('public.order_items_item_id_seq'::regclass);


--
-- TOC entry 4838 (class 2604 OID 17260)
-- Name: orders order_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders ALTER COLUMN order_id SET DEFAULT nextval('public.orders_order_id_seq'::regclass);


--
-- TOC entry 4848 (class 2604 OID 17321)
-- Name: performance_records record_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_records ALTER COLUMN record_id SET DEFAULT nextval('public.performance_records_record_id_seq'::regclass);


--
-- TOC entry 4833 (class 2604 OID 17224)
-- Name: price_history history_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_history ALTER COLUMN history_id SET DEFAULT nextval('public.price_history_history_id_seq'::regclass);


--
-- TOC entry 4829 (class 2604 OID 17198)
-- Name: price_lists price_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_lists ALTER COLUMN price_id SET DEFAULT nextval('public.price_lists_price_id_seq'::regclass);


--
-- TOC entry 4825 (class 2604 OID 17160)
-- Name: products product_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products ALTER COLUMN product_id SET DEFAULT nextval('public.products_product_id_seq'::regclass);


--
-- TOC entry 4845 (class 2604 OID 17299)
-- Name: product_batches batch_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_batches ALTER COLUMN batch_id SET DEFAULT nextval('public.product_batches_batch_id_seq'::regclass);


--
-- TOC entry 4835 (class 2604 OID 17243)
-- Name: stocks stock_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stocks ALTER COLUMN stock_id SET DEFAULT nextval('public.stocks_stock_id_seq'::regclass);


--
-- TOC entry 4826 (class 2604 OID 17178)
-- Name: suppliers supplier_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.suppliers ALTER COLUMN supplier_id SET DEFAULT nextval('public.suppliers_supplier_id_seq'::regclass);


--
-- TOC entry 4820 (class 2604 OID 17118)
-- Name: users user_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users ALTER COLUMN user_id SET DEFAULT nextval('public.users_user_id_seq'::regclass);


--
-- TOC entry 5059 (class 0 OID 17146)
-- Dependencies: 224
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.categories (category_id, name, description) VALUES (4, 'Молочні продукти', 'Товари з коротким терміном придатності, потребують холодильника');
INSERT INTO public.categories (category_id, name, description) VALUES (5, 'Напої', 'Вода, соки, солодкі напої');


--
-- TOC entry 5057 (class 0 OID 17131)
-- Dependencies: 222
-- Data for Name: managers; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.managers (manager_id, user_id, first_name, last_name, phone, "position", hire_date) VALUES (1, 2, 'Євген', 'Студент-КМІТ', '+380501234567', 'Старший закупник', '2026-03-28');


--
-- TOC entry 5073 (class 0 OID 17273)
-- Dependencies: 238
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.order_items (item_id, order_id, product_id, ord_batches, batch_size, price_at_ord, sup_article) VALUES (2, 3, 6, 10, 12.000, 28.50, 'GAL-MILK-25');
INSERT INTO public.order_items (item_id, order_id, product_id, ord_batches, batch_size, price_at_ord, sup_article) VALUES (3, 4, 7, 20, 6.000, 14.20, 'GAL-WATR-15');
INSERT INTO public.order_items (item_id, order_id, product_id, ord_batches, batch_size, price_at_ord, sup_article) VALUES (4, 6, 7, 5, 6.000, 14.20, 'GAL-WATR-15');


--
-- TOC entry 5071 (class 0 OID 17257)
-- Dependencies: 236
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.orders (order_id, supplier_id, status, total_sum, created_at) VALUES (3, 2, 'Delivered', 3420.00, '2026-03-20 10:00:00');
INSERT INTO public.orders (order_id, supplier_id, status, total_sum, created_at) VALUES (4, 2, 'Sent', 1704.00, '2026-03-27 14:00:00');
INSERT INTO public.orders (order_id, supplier_id, status, total_sum, created_at) VALUES (6, 2, 'Draft', 426.00, '2026-03-28 09:16:43.548338');


--
-- TOC entry 5077 (class 0 OID 17318)
-- Dependencies: 242
-- Data for Name: performance_records; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.performance_records (record_id, batch_id, delta_time, quality_rate, total_score) VALUES (1, 2, '1 day', 1.00, 0.85);


--
-- TOC entry 5067 (class 0 OID 17221)
-- Dependencies: 232
-- Data for Name: price_history; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.price_history (history_id, supplier_id, product_id, old_price, new_price, change_date) VALUES (1, 2, 6, 28.50, 38.00, '2026-03-28 09:00:05.853153');


--
-- TOC entry 5065 (class 0 OID 17195)
-- Dependencies: 230
-- Data for Name: price_lists; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.price_lists (price_id, supplier_id, product_id, sup_article, wh_price, moq_batches, batch_size, updated_at) VALUES (5, 2, 7, 'GAL-WATR-15', 14.20, 20, 6.000, '2026-03-28 08:36:26.145669');
INSERT INTO public.price_lists (price_id, supplier_id, product_id, sup_article, wh_price, moq_batches, batch_size, updated_at) VALUES (4, 2, 6, 'GAL-MILK-25', 38.00, 10, 12.000, '2026-03-28 08:36:26.145669');


--
-- TOC entry 5061 (class 0 OID 17157)
-- Dependencies: 226
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.products (product_id, category_id, internal_sku, name, unit) VALUES (6, 4, 'SKU-MILK-001', 'Молоко 2.5%, 900г', 'шт');
INSERT INTO public.products (product_id, category_id, internal_sku, name, unit) VALUES (7, 5, 'SKU-WATR-002', 'Вода мінеральна, 1.5л', 'шт');


--
-- TOC entry 5075 (class 0 OID 17296)
-- Dependencies: 240
-- Data for Name: product_batches; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.product_batches (batch_id, product_id, order_id, prod_date, arrival_date, exp_date, curr_qty, status) VALUES (1, 6, 3, '2026-03-19', '2026-03-21 09:00:00', '2026-04-05', 120.000, 'Active');
INSERT INTO public.product_batches (batch_id, product_id, order_id, prod_date, arrival_date, exp_date, curr_qty, status) VALUES (2, 6, 3, '2026-03-19', '2026-03-21 09:00:00', '2026-04-05', 120.000, 'Active');


--
-- TOC entry 5069 (class 0 OID 17240)
-- Dependencies: 234
-- Data for Name: stocks; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.stocks (stock_id, product_id, quantity, reorder_point) VALUES (1, 6, 120.000, 50.000);
INSERT INTO public.stocks (stock_id, product_id, quantity, reorder_point) VALUES (2, 7, 0.000, 100.000);


--
-- TOC entry 5063 (class 0 OID 17175)
-- Dependencies: 228
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.suppliers (supplier_id, user_id, company_name, edrpou, address, default_payment_terms, payment_deadline, rating) VALUES (2, 3, 'ТОВ Галичина', '12345678', 'м. Львів, вул. Зелена, 10', 'Deferred', 14, 0.85);


--
-- TOC entry 5055 (class 0 OID 17115)
-- Dependencies: 220
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO public.users (user_id, email, password_hash, role, registration_token, is_active) VALUES (2, 'admin@srm.com', 'hash_admin_123', 'ADMIN', NULL, true);
INSERT INTO public.users (user_id, email, password_hash, role, registration_token, is_active) VALUES (3, 'eugene.nure@srm.com', 'hash_eugene_456', 'MANAGER', NULL, true);
INSERT INTO public.users (user_id, email, password_hash, role, registration_token, is_active) VALUES (4, 'sales@galychyna.com', 'hash_gal_789', 'suppliers', NULL, true);


--
-- TOC entry 5095 (class 0 OID 0)
-- Dependencies: 223
-- Name: categories_category_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.categories_category_id_seq', 5, true);


--
-- TOC entry 5096 (class 0 OID 0)
-- Dependencies: 221
-- Name: managers_manager_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.managers_manager_id_seq', 1, true);


--
-- TOC entry 5097 (class 0 OID 0)
-- Dependencies: 237
-- Name: order_items_item_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_items_item_id_seq', 4, true);


--
-- TOC entry 5098 (class 0 OID 0)
-- Dependencies: 235
-- Name: orders_order_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orders_order_id_seq', 6, true);


--
-- TOC entry 5099 (class 0 OID 0)
-- Dependencies: 241
-- Name: performance_records_record_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.performance_records_record_id_seq', 1, true);


--
-- TOC entry 5100 (class 0 OID 0)
-- Dependencies: 231
-- Name: price_history_history_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.price_history_history_id_seq', 1, true);


--
-- TOC entry 5101 (class 0 OID 0)
-- Dependencies: 229
-- Name: price_lists_price_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.price_lists_price_id_seq', 5, true);


--
-- TOC entry 5102 (class 0 OID 0)
-- Dependencies: 239
-- Name: product_batches_batch_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.product_batches_batch_id_seq', 2, true);


--
-- TOC entry 5103 (class 0 OID 0)
-- Dependencies: 225
-- Name: products_product_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.products_product_id_seq', 7, true);


--
-- TOC entry 5104 (class 0 OID 0)
-- Dependencies: 233
-- Name: stocks_stock_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.stocks_stock_id_seq', 2, true);


--
-- TOC entry 5105 (class 0 OID 0)
-- Dependencies: 227
-- Name: suppliers_supplier_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.suppliers_supplier_id_seq', 2, true);


--
-- TOC entry 5106 (class 0 OID 0)
-- Dependencies: 219
-- Name: users_user_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.users_user_id_seq', 4, true);


--
-- TOC entry 4858 (class 2606 OID 17155)
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (category_id);


--
-- TOC entry 4856 (class 2606 OID 17139)
-- Name: managers managers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.managers
    ADD CONSTRAINT managers_pkey PRIMARY KEY (manager_id);


--
-- TOC entry 4880 (class 2606 OID 17284)
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (item_id);


--
-- TOC entry 4878 (class 2606 OID 17266)
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (order_id);


--
-- TOC entry 4886 (class 2606 OID 17326)
-- Name: performance_records performance_records_batch_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_records
    ADD CONSTRAINT performance_records_batch_id_key UNIQUE (batch_id);


--
-- TOC entry 4888 (class 2606 OID 17324)
-- Name: performance_records performance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_records
    ADD CONSTRAINT performance_records_pkey PRIMARY KEY (record_id);


--
-- TOC entry 4872 (class 2606 OID 17228)
-- Name: price_history price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_pkey PRIMARY KEY (history_id);


--
-- TOC entry 4868 (class 2606 OID 17207)
-- Name: price_lists price_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_pkey PRIMARY KEY (price_id);


--
-- TOC entry 4870 (class 2606 OID 17209)
-- Name: price_lists price_lists_supplier_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_supplier_id_product_id_key UNIQUE (supplier_id, product_id);


--
-- TOC entry 4884 (class 2606 OID 17306)
-- Name: product_batches product_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_batches
    ADD CONSTRAINT product_batches_pkey PRIMARY KEY (batch_id);


--
-- TOC entry 4860 (class 2606 OID 17168)
-- Name: products products_internal_sku_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_internal_sku_key UNIQUE (internal_sku);


--
-- TOC entry 4862 (class 2606 OID 17166)
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (product_id);


--
-- TOC entry 4874 (class 2606 OID 17248)
-- Name: stocks stocks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stocks
    ADD CONSTRAINT stocks_pkey PRIMARY KEY (stock_id);


--
-- TOC entry 4876 (class 2606 OID 17250)
-- Name: stocks stocks_product_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stocks
    ADD CONSTRAINT stocks_product_id_key UNIQUE (product_id);


--
-- TOC entry 4864 (class 2606 OID 17188)
-- Name: suppliers suppliers_edrpou_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_edrpou_key UNIQUE (edrpou);


--
-- TOC entry 4866 (class 2606 OID 17186)
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (supplier_id);


--
-- TOC entry 4882 (class 2606 OID 17384)
-- Name: order_items uq_order_products; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT uq_order_products UNIQUE (order_id, product_id);


--
-- TOC entry 4852 (class 2606 OID 17129)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 4854 (class 2606 OID 17127)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (user_id);


--
-- TOC entry 4903 (class 2620 OID 17376)
-- Name: suppliers tr_check_suppliers_delete; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tr_check_suppliers_delete BEFORE DELETE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_suppliers_delete();


--
-- TOC entry 4904 (class 2620 OID 17382)
-- Name: price_lists tr_log_price_change; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tr_log_price_change AFTER UPDATE ON public.price_lists FOR EACH ROW EXECUTE FUNCTION public.log_price_changes();


--
-- TOC entry 4905 (class 2620 OID 17378)
-- Name: performance_records tr_update_rating_after_perf; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER tr_update_rating_after_perf AFTER INSERT OR UPDATE ON public.performance_records FOR EACH ROW EXECUTE FUNCTION public.fn_refresh_suppliers_rating();


--
-- TOC entry 4889 (class 2606 OID 17140)
-- Name: managers managers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.managers
    ADD CONSTRAINT managers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;


--
-- TOC entry 4898 (class 2606 OID 17285)
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(order_id) ON DELETE CASCADE;


--
-- TOC entry 4899 (class 2606 OID 17290)
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);


--
-- TOC entry 4897 (class 2606 OID 17267)
-- Name: orders orders_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(supplier_id);


--
-- TOC entry 4902 (class 2606 OID 17327)
-- Name: performance_records performance_records_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.performance_records
    ADD CONSTRAINT performance_records_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.product_batches(batch_id) ON DELETE CASCADE;


--
-- TOC entry 4894 (class 2606 OID 17234)
-- Name: price_history price_history_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);


--
-- TOC entry 4895 (class 2606 OID 17229)
-- Name: price_history price_history_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(supplier_id);


--
-- TOC entry 4892 (class 2606 OID 17215)
-- Name: price_lists price_lists_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id) ON DELETE CASCADE;


--
-- TOC entry 4893 (class 2606 OID 17210)
-- Name: price_lists price_lists_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(supplier_id) ON DELETE CASCADE;


--
-- TOC entry 4900 (class 2606 OID 17312)
-- Name: product_batches product_batches_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_batches
    ADD CONSTRAINT product_batches_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(order_id);


--
-- TOC entry 4901 (class 2606 OID 17307)
-- Name: product_batches product_batches_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_batches
    ADD CONSTRAINT product_batches_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id);


--
-- TOC entry 4890 (class 2606 OID 17169)
-- Name: products products_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(category_id) ON DELETE RESTRICT;


--
-- TOC entry 4896 (class 2606 OID 17251)
-- Name: stocks stocks_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.stocks
    ADD CONSTRAINT stocks_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(product_id) ON DELETE CASCADE;


--
-- TOC entry 4891 (class 2606 OID 17189)
-- Name: suppliers suppliers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;


-- Completed on 2026-03-28 16:02:25

--
-- PostgreSQL database dump complete
--

\unrestrict ZBCLQVynaOTcSK6j86NBdODOT2RY0YErR9h4JHZgKy1bdsoaVu4SPhYTNu2BjMb

