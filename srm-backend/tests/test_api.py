import pytest
from fastapi.testclient import TestClient
import uuid
from sqlalchemy import text
from datetime import date, timedelta

# Імпортуємо наш додаток FastAPI
from app.main import app
from app.database import SessionLocal
from app import security, models

# Створюємо клієнта для тестування (він імітує браузер/фронтенд)
client = TestClient(app)

@pytest.fixture(scope="function")
def db():
    """Фікстура, що надає сесію БД для тестів і закриває її після завершення."""
    db_session = SessionLocal()
    try:
        yield db_session
    finally:
        db_session.close()

# Генеруємо унікальний email для кожного запуску тестів, 
# щоб база даних не сварилася на унікальність
test_email = f"test_supplier_{uuid.uuid4().hex[:6]}@example.com"
test_password = "secure_test_password"

def test_register_supplier():
    """Тест №1: Перевірка реєстрації нового постачальника"""
    payload = {
        "email": test_email,
        "password": test_password
    }
    # Робимо POST запит до нашого API
    response = client.post("/auth/register/supplier", json=payload)
    
    # Перевіряємо, чи сервер відповів успішно (статус 200)
    assert response.status_code == 200
    
    # Перевіряємо, чи створився користувач
    data = response.json()
    assert data["email"] == test_email
    assert data["role"] == "SUPPLIER"
    assert "user_id" in data

def test_login_supplier():
    """Тест №2: Перевірка авторизації та отримання JWT токена"""
    payload = {
        "username": test_email,
        "password": test_password
    }

    response = client.post("/auth/login", data=payload)
    
    assert response.status_code == 200
    data = response.json()
    
    # Перевіряємо, чи сервер видав нам токен
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_price_list_crud_and_history(db: SessionLocal):
    """Тест №3: Перевірка створення прайсу, оновлення ціни та запису в Price_History"""
    # 1. Реєструємо та логінимо нового постачальника
    email = f"price_test_{uuid.uuid4().hex[:6]}@example.com"
    client.post("/auth/register/supplier", json={"email": email, "password": "password123"})
    res_login = client.post("/auth/login", data={"username": email, "password": "password123"})
    token = res_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Створюємо профіль постачальника (бо без нього не можна додати прайс)
    unique_edrpou = uuid.uuid4().hex[:8]  # Довжина не більше 10 символів!
    unique_company = f"Price Test {uuid.uuid4().hex[:4]}"
    res_profile = client.post("/users/suppliers/profile", json={
        "company_name": unique_company,
        "edrpou": unique_edrpou,
        "address": "Test Ave",
        "payment_deadline": 14
    }, headers=headers)
    assert res_profile.status_code == 200

    # 3. Підготовка: створюємо тестовий товар у БД через SessionLocal
    db.execute(text("INSERT INTO categories (category_id, name) VALUES (9999, 'Test Category') ON CONFLICT (category_id) DO NOTHING"))
    db.execute(text("INSERT INTO products (product_id, category_id, internal_sku, name, unit) VALUES (9999, 9999, 'TEST-SKU-1', 'Test Product', 'pcs') ON CONFLICT (product_id) DO NOTHING"))
    db.commit()
    product_id = 9999

    # 4. Додаємо товар у свій прайс-лист
    price_payload = {
        "product_id": product_id,
        "sup_article": "SUP-TEST-01",
        "wh_price": 100.50,
        "moq_batches": 1,
        "batch_size": 1.0
    }
    res_create = client.post("/prices/", json=price_payload, headers=headers)
    assert res_create.status_code == 201, res_create.text
    price_id = res_create.json()["price_id"]

    # 5. Оновлюємо ціну з 100.50 на 120.00
    update_payload = {"wh_price": 120.00, "moq_batches": 1, "batch_size": 1.0}
    res_update = client.put(f"/prices/{price_id}", json=update_payload, headers=headers)
    assert res_update.status_code == 200
    assert float(res_update.json()["wh_price"]) == 120.0

    # 6. Перевіряємо, чи записалась історія
    res_history = client.get(f"/prices/{price_id}/history", headers=headers)
    assert res_history.status_code == 200
    history = res_history.json()
    
    assert len(history) == 1
    assert float(history[0]["old_price"]) == 100.5
    assert float(history[0]["new_price"]) == 120.0
    # Переконуємось, що поле з датою збігається з БД
    assert "change_date" in history[0]

def get_token(username, password):
    """Допоміжна функція для отримання токена"""
    response = client.post("/auth/login", data={"username": username, "password": password})
    assert response.status_code == 200
    return response.json()["access_token"]

def test_order_workflow_and_permissions(db: SessionLocal):
    """
    Тест №4: Комплексна перевірка життєвого циклу замовлення та прав доступу.
    Створює Менеджера, двох Постачальників, а потім перевіряє:
    - Створення замовлення (тільки Менеджер)
    - Отримання списку замовлень (кожен бачить своє)
    - State Machine зміни статусів (Draft -> Confirmed -> Sent -> Delivered)
    - Права доступу до зміни статусів та перегляду замовлень.
    """
    # 1. --- SETUP: Створюємо користувачів, профілі та отримуємо токени ---
    
    # Створюємо Менеджера напряму в БД для простоти тесту
    manager_email = f"manager_{uuid.uuid4().hex[:6]}@srm.com"
    manager_password = "password123"
    hashed_pwd = security.get_password_hash(manager_password)
    db.execute(text(f"INSERT INTO users (email, password_hash, role, is_active) VALUES ('{manager_email}', '{hashed_pwd}', 'MANAGER', true)"))
    db.commit()
    manager_token = get_token(manager_email, manager_password)
    manager_headers = {"Authorization": f"Bearer {manager_token}"}

    # Створюємо Постачальника 1
    s1_email = f"supplier1_{uuid.uuid4().hex[:6]}@srm.com"
    client.post("/auth/register/supplier", json={"email": s1_email, "password": "password123"})
    s1_token = get_token(s1_email, "password123")
    s1_headers = {"Authorization": f"Bearer {s1_token}"}
    s1_company = f"Supplier One {uuid.uuid4().hex[:6]}"
    client.post("/users/suppliers/profile", json={"company_name": s1_company, "edrpou": f"111{uuid.uuid4().hex[:5]}"}, headers=s1_headers)
    s1_profile = db.query(models.Supplier).filter(models.Supplier.company_name == s1_company).first()
    assert s1_profile is not None
    s1_supplier_id = s1_profile.supplier_id

    # Створюємо Постачальника 2
    s2_email = f"supplier2_{uuid.uuid4().hex[:6]}@srm.com"
    client.post("/auth/register/supplier", json={"email": s2_email, "password": "password123"})
    s2_token = get_token(s2_email, "password123")
    s2_headers = {"Authorization": f"Bearer {s2_token}"}
    s2_company = f"Supplier Two {uuid.uuid4().hex[:6]}"
    client.post("/users/suppliers/profile", json={"company_name": s2_company, "edrpou": f"222{uuid.uuid4().hex[:5]}"}, headers=s2_headers)

    # Використовуємо тестовий товар, створений у попередньому тесті
    product_id = 9999

    # 2. --- ТЕСТ СТВОРЕННЯ ЗАМОВЛЕННЯ ---
    order_payload = {
        "supplier_id": s1_supplier_id,
        "items": [{"product_id": product_id, "ord_batches": 10, "batch_size": 12, "price_at_ord": 25.5}]
    }
    # Менеджер створює замовлення -> УСПІХ
    res_create = client.post("/orders/", json=order_payload, headers=manager_headers)
    assert res_create.status_code == 201, res_create.text
    order_data = res_create.json()
    order_id = order_data["order_id"]
    assert order_data["status"] == "Draft"
    assert float(order_data["total_sum"]) == 10 * 12 * 25.5

    # Постачальник намагається створити замовлення -> ПОМИЛКА 403
    res_create_fail = client.post("/orders/", json=order_payload, headers=s1_headers)
    assert res_create_fail.status_code == 403

    # 3. --- ТЕСТ ОТРИМАННЯ СПИСКІВ ЗАМОВЛЕНЬ ---
    # Менеджер бачить замовлення
    res_get_manager = client.get("/orders/", headers=manager_headers)
    assert res_get_manager.status_code == 200
    assert any(o['order_id'] == order_id for o in res_get_manager.json())

    # Постачальник 1 бачить своє замовлення
    res_get_s1 = client.get("/orders/", headers=s1_headers)
    assert res_get_s1.status_code == 200
    assert len(res_get_s1.json()) == 1
    assert res_get_s1.json()[0]["order_id"] == order_id

    # Постачальник 2 не бачить чужих замовлень
    res_get_s2 = client.get("/orders/", headers=s2_headers)
    assert res_get_s2.status_code == 200
    assert len(res_get_s2.json()) == 0

    # 4. --- ТЕСТ STATE MACHINE (ЗМІНА СТАТУСІВ) ---
    # Постачальник: Draft -> Confirmed (ПОМИЛКА 403)
    res_patch = client.patch(f"/orders/{order_id}/status", json={"new_status": "Confirmed"}, headers=s1_headers)
    assert res_patch.status_code == 403

    # Менеджер: Draft -> Confirmed (УСПІХ)
    res_patch = client.patch(f"/orders/{order_id}/status", json={"new_status": "Confirmed"}, headers=manager_headers)
    assert res_patch.status_code == 200
    assert res_patch.json()["status"] == "Confirmed"

    # Постачальник 2 (чужий): Confirmed -> Sent (ПОМИЛКА 403)
    res_patch = client.patch(f"/orders/{order_id}/status", json={"new_status": "Sent"}, headers=s2_headers)
    assert res_patch.status_code == 403

    # Постачальник 1 (власник): Confirmed -> Sent (УСПІХ)
    res_patch = client.patch(f"/orders/{order_id}/status", json={"new_status": "Sent"}, headers=s1_headers)
    assert res_patch.status_code == 200
    assert res_patch.json()["status"] == "Sent"

    # Менеджер: Sent -> Delivered (УСПІХ)
    res_patch = client.patch(f"/orders/{order_id}/status", json={"new_status": "Delivered"}, headers=manager_headers)
    assert res_patch.status_code == 200
    assert res_patch.json()["status"] == "Delivered"

    # 5. --- ТЕСТ ДОСТУПУ ЗА ID ---
    # Постачальник 2 намагається отримати замовлення Постачальника 1 -> ПОМИЛКА 403
    res_get_id_fail = client.get(f"/orders/{order_id}", headers=s2_headers)
    assert res_get_id_fail.status_code == 403


def test_bulk_order_and_business_features(db: SessionLocal):
    """
    Тест №5: Перевірка групового створення замовлень, аналітики, 
    термінів придатності та маппінгу номенклатур.
    """
    # 1. --- SETUP: Створюємо Менеджера та двох Постачальників ---
    manager_email = f"manager_bulk_{uuid.uuid4().hex[:6]}@srm.com"
    hashed_pwd = security.get_password_hash("password123")
    db.execute(text(f"INSERT INTO users (email, password_hash, role, is_active) VALUES ('{manager_email}', '{hashed_pwd}', 'MANAGER', true)"))
    db.commit()
    manager_token = get_token(manager_email, "password123")
    manager_headers = {"Authorization": f"Bearer {manager_token}"}

    # Постачальник A
    sA_email = f"supp_a_{uuid.uuid4().hex[:6]}@srm.com"
    client.post("/auth/register/supplier", json={"email": sA_email, "password": "password123"})
    sA_token = get_token(sA_email, "password123")
    sA_headers = {"Authorization": f"Bearer {sA_token}"}
    client.post("/users/suppliers/profile", json={"company_name": "Supplier A", "edrpou": f"888{uuid.uuid4().hex[:5]}"}, headers=sA_headers)
    sA_profile = db.query(models.Supplier).filter(models.Supplier.company_name == "Supplier A").first()
    assert sA_profile is not None
    sA_id = sA_profile.supplier_id

    # Постачальник B
    sB_email = f"supp_b_{uuid.uuid4().hex[:6]}@srm.com"
    client.post("/auth/register/supplier", json={"email": sB_email, "password": "password123"})
    sB_token = get_token(sB_email, "password123")
    sB_headers = {"Authorization": f"Bearer {sB_token}"}
    client.post("/users/suppliers/profile", json={"company_name": "Supplier B", "edrpou": f"999{uuid.uuid4().hex[:5]}"}, headers=sB_headers)
    sB_profile = db.query(models.Supplier).filter(models.Supplier.company_name == "Supplier B").first()
    assert sB_profile is not None
    sB_id = sB_profile.supplier_id

    # Очищуємо залишки з попередніх запусків тестів з урахуванням тригерів та зовнішніх ключів
    db.execute(text("DELETE FROM order_items WHERE product_id IN (1001, 1002)"))
    db.execute(text("DELETE FROM price_lists WHERE product_id IN (1001, 1002)"))
    db.execute(text("DELETE FROM product_batches WHERE product_id IN (1001, 1002)"))
    db.execute(text("DELETE FROM products WHERE product_id IN (1001, 1002)"))
    db.execute(text("DELETE FROM categories WHERE category_id = 1001"))
    db.commit()

    # Товар 1 та Товар 2
    db.execute(text("INSERT INTO categories (category_id, name) VALUES (1001, 'Category 1001') ON CONFLICT DO NOTHING"))
    db.execute(text("INSERT INTO products (product_id, category_id, internal_sku, name, unit) VALUES (1001, 1001, 'SKU-1001', 'Milk A', 'pcs') ON CONFLICT DO NOTHING"))
    db.execute(text("INSERT INTO products (product_id, category_id, internal_sku, name, unit) VALUES (1002, 1001, 'SKU-1002', 'Milk B', 'pcs') ON CONFLICT DO NOTHING"))
    db.commit()

    # Створюємо ціни в прайс-листі
    # Постачальник A пропонує товар 1001
    db.execute(text(f"INSERT INTO price_lists (supplier_id, product_id, sup_article, wh_price, moq_batches, batch_size) VALUES ({sA_id}, 1001, 'ART-A-1', 50.00, 2, 1.0) ON CONFLICT DO NOTHING"))
    # Постачальник B пропонує товар 1001 та 1002
    db.execute(text(f"INSERT INTO price_lists (supplier_id, product_id, sup_article, wh_price, moq_batches, batch_size) VALUES ({sB_id}, 1001, 'ART-B-1', 48.00, 5, 1.0) ON CONFLICT DO NOTHING"))
    db.execute(text(f"INSERT INTO price_lists (supplier_id, product_id, sup_article, wh_price, moq_batches, batch_size) VALUES ({sB_id}, 1002, 'ART-B-2', 75.00, 1, 1.0) ON CONFLICT DO NOTHING"))
    db.commit()

    # 2. --- ТЕСТ GET /business/products/offers ---
    res_offers = client.get("/business/products/offers", headers=manager_headers)
    assert res_offers.status_code == 200
    offers_data = res_offers.json()
    # Перевіряємо наявність пропозицій для товару 1001 (має бути дві пропозиції від A та B)
    milk_a_offers = next(p for p in offers_data if p["product_id"] == 1001)
    assert len(milk_a_offers["offers"]) == 2

    # 3. --- ТЕСТ POST /orders/bulk ---
    bulk_payload = {
        "items": [
            {
                "product_id": 1001,
                "supplier_id": sA_id,
                "ord_batches": 4,
                "batch_size": 1.0,
                "price_at_ord": 50.00,
                "sup_article": "ART-A-1"
            },
            {
                "product_id": 1002,
                "supplier_id": sB_id,
                "ord_batches": 2,
                "batch_size": 1.0,
                "price_at_ord": 75.00,
                "sup_article": "ART-B-2"
            }
        ]
    }
    res_bulk = client.post("/orders/bulk", json=bulk_payload, headers=manager_headers)
    assert res_bulk.status_code == 201
    bulk_orders = res_bulk.json()
    assert len(bulk_orders) == 2  # Створилося 2 окремих замовлення для A та B

    # Перевіримо суми
    order_A = next(o for o in bulk_orders if o["supplier"]["supplier_id"] == sA_id)
    order_B = next(o for o in bulk_orders if o["supplier"]["supplier_id"] == sB_id)
    assert float(order_A["total_sum"]) == 4 * 1.0 * 50.0
    assert float(order_B["total_sum"]) == 2 * 1.0 * 75.0

    # 4. --- ТЕСТ GET /business/prices/mappings та PUT ---
    res_mappings = client.get("/business/prices/mappings", headers=manager_headers)
    assert res_mappings.status_code == 200
    mappings = res_mappings.json()
    assert len(mappings) >= 3

    # Знаходимо запис прайсу для оновлення артикулу
    mapping_to_update = next(m for m in mappings if m["supplier_id"] == sA_id and m["product_id"] == 1001)
    price_id = mapping_to_update["price_id"]

    res_put_mapping = client.put(f"/business/prices/mappings/{price_id}", json={"sup_article": "ART-A-NEW"}, headers=manager_headers)
    assert res_put_mapping.status_code == 200
    assert res_put_mapping.json()["sup_article"] == "ART-A-NEW"

    # 5. --- ТЕСТ GET /business/analytics ---
    res_analytics = client.get("/business/analytics?period=week", headers=manager_headers)
    assert res_analytics.status_code == 200
    analytics = res_analytics.json()
    assert "total_expenses" in analytics
    assert "total_earnings" in analytics
    assert len(analytics["chart_data"]) > 0

    # 6. --- ТЕСТ GET /business/batches/expiration-warnings ---
    # Створимо партію товару з терміном придатності через 15 днів (менше 30 днів)
    today = date.today()
    exp_date_near = today + timedelta(days=15)
    db.execute(text(f"INSERT INTO product_batches (product_id, order_id, prod_date, exp_date, curr_qty, status) VALUES (1001, {order_A['order_id']}, '{today}', '{exp_date_near}', 100.0, 'Active')"))
    db.commit()

    res_warnings = client.get("/business/batches/expiration-warnings", headers=manager_headers)
    assert res_warnings.status_code == 200
    warnings = res_warnings.json()
    assert len(warnings) > 0
    assert any(w["product_id"] == 1001 and w["days_left"] == 15 for w in warnings)