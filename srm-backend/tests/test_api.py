import pytest
from fastapi.testclient import TestClient
import uuid
from sqlalchemy import text

# Імпортуємо наш додаток FastAPI
from app.main import app
from app.database import SessionLocal

# Створюємо клієнта для тестування (він імітує браузер/фронтенд)
client = TestClient(app)

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

def test_price_list_crud_and_history():
    """Тест №3: Перевірка створення прайсу, оновлення ціни та запису в Price_History"""
    # 1. Реєструємо та логінимо нового постачальника
    email = f"price_test_{uuid.uuid4().hex[:6]}@example.com"
    client.post("/auth/register/supplier", json={"email": email, "password": "password123"})
    res_login = client.post("/auth/login", data={"username": email, "password": "password123"})
    token = res_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Створюємо профіль постачальника (бо без нього не можна додати прайс)
    res_profile = client.post("/users/suppliers/profile", json={
        "company_name": "Price Test LLC",
        "edrpou": "12345678",
        "address": "Test Ave",
        "payment_deadline": 14
    }, headers=headers)
    assert res_profile.status_code == 200

    # 3. Підготовка: створюємо тестовий товар у БД через SessionLocal
    db = SessionLocal()
    try:
        db.execute(text("INSERT INTO categories (category_id, name) VALUES (9999, 'Test Category') ON CONFLICT (category_id) DO NOTHING"))
        db.execute(text("INSERT INTO products (product_id, category_id, internal_sku, name, unit) VALUES (9999, 9999, 'TEST-SKU-1', 'Test Product', 'pcs') ON CONFLICT (product_id) DO NOTHING"))
        db.commit()
        product_id = 9999
    finally:
        db.close()

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