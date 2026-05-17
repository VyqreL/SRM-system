import pytest
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app import models
import uuid

# Фікстура для підключення до тестової сесії БД
@pytest.fixture
def db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_database_transaction(db: Session):
    """Database Unit Test: Перевірка транзакцій, цілісності та базових операцій БД"""
    
    # 1. Створюємо унікального користувача
    test_email = f"db_test_{uuid.uuid4().hex[:6]}@example.com"
    new_user = models.User(email=test_email, password_hash="hashed_pw", role="SUPPLIER")
    
    # Починаємо транзакцію
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Перевіряємо, чи БД згенерувала первинний ключ (Primary Key)
    assert new_user.user_id is not None
    assert new_user.email == test_email

    # 2. Перевіряємо зв'язок таблиць (Foreign Key Constraints)
    # Створюємо профіль постачальника, прив'язаний до цього користувача
    new_supplier = models.Supplier(
        user_id=new_user.user_id,
        company_name="Test Company LLC",
        edrpou="87654321"
    )
    db.add(new_supplier)
    db.commit()
    db.refresh(new_supplier)

    assert new_supplier.supplier_id is not None
    # Перевіряємо, чи БД автоматично встановила дефолтний рейтинг (значення з БД, а не з бекенду)
    assert float(new_supplier.rating) == 1.00 

    # 3. Перевіряємо видалення та каскадність (чистимо за собою)
    db.delete(new_supplier)
    db.delete(new_user)
    db.commit()
    
    # Перевіряємо, що записів більше немає
    deleted_user = db.query(models.User).filter(models.User.email == test_email).first()
    assert deleted_user is None