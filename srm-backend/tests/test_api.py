import pytest
from fastapi.testclient import TestClient
import uuid

# Імпортуємо наш додаток FastAPI
from app.main import app

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