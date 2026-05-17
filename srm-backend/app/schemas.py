from pydantic import BaseModel, EmailStr, ConfigDict, Field
from typing import List, Optional
from datetime import datetime, date
from decimal import Decimal

# ==========================================
# Базові налаштування для всіх Response-схем
# ==========================================
# ConfigDict(from_attributes=True) - це критично важлива річ! 
# Вона каже Pydantic: "Якщо тобі передали об'єкт SQLAlchemy (з бази), 
# не лякайся, просто прочитай його атрибути (наприклад, user.email)".

class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ==========================================
# 1. КОРИСТУВАЧІ (Users)
# ==========================================
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, description="Пароль має бути не коротшим за 6 символів")

class UserResponse(ORMBase):
    user_id: int
    email: EmailStr
    role: str
    is_active: bool
    # Зверни увагу: ми НЕ додаємо сюди password_hash! Він ніколи не повинен покидати бекенд.

# Схема для адміна, який створює запрошення
class ManagerInviteCreate(BaseModel):
    email: EmailStr

# Схема для менеджера, який завершує реєстрацію за токеном
class ManagerCompleteRegistration(BaseModel):
    token: str
    password: str = Field(min_length=6)

# ==========================================
# 2. ПОСТАЧАЛЬНИКИ (Suppliers)
# ==========================================
class SupplierCreate(BaseModel):
    company_name: str
    edrpou: str = Field(min_length=8, max_length=10)

class SupplierResponse(ORMBase):
    supplier_id: int
    user_id: Optional[int]
    company_name: str
    edrpou: str
    rating: Decimal

# --- Схеми для Профілю Постачальника (Кабінет) ---
class SupplierProfileCreate(BaseModel):
    company_name: str = Field(..., description="Назва компанії")
    edrpou: Optional[str] = Field(None, description="Код ЄДРПОУ")
    address: Optional[str] = Field(None, description="Юридична адреса")
    default_payment_terms: Optional[str] = Field("Deferred", description="Умови оплати (напр. Deferred)")
    payment_deadline: int = Field(0, description="Відстрочка платежу в днях")

class SupplierProfileResponse(SupplierProfileCreate):
    supplier_id: int
    user_id: int
    rating: Decimal
    
    class Config:
        from_attributes = True


# ==========================================
# 3. ТОВАРИ (Products)
# ==========================================
class ProductCreate(BaseModel):
    category_id: int
    internal_sku: str
    name: str
    unit: str

class ProductResponse(ORMBase):
    product_id: int
    category_id: int
    internal_sku: str
    name: str
    unit: str


# ==========================================
# 4. ЗАМОВЛЕННЯ (Orders & Items)
# ==========================================
class OrderItemCreate(BaseModel):
    product_id: int
    sup_article: Optional[str] = None
    ord_batches: int = Field(gt=0, description="Кількість упаковок має бути більшою за 0")
    batch_size: int = Field(gt=0)
    price_at_ord: Decimal = Field(ge=0, description="Ціна не може бути від'ємною")

class OrderItemResponse(ORMBase):
    item_id: int
    order_id: int
    product_id: int
    sup_article: Optional[str] = None
    ord_batches: int
    batch_size: int
    price_at_ord: Decimal
    
    # Робимо ці поля необов'язковими, щоб Pydantic не панікував
    total_units: Optional[int] = None
    line_total: Optional[Decimal] = None

class OrderCreate(BaseModel):
    supplier_id: int
    items: List[OrderItemCreate] # Замовлення одразу приймає список товарів!

class OrderResponse(ORMBase):
    order_id: int
    supplier_id: int
    status: str
    total_sum: Decimal
    created_at: datetime
    items: List[OrderItemResponse] = [] # Автоматично підтягне всі рядки замовлення

class OrderStatusUpdate(BaseModel):
    new_status: str = Field(..., description="Новий статус: Confirmed, Delivered або Cancelled")

# ==========================================
# 5. ТОКЕНИ (Авторизація)
# ==========================================
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None





# --- Схеми для Прайс-листів ---
class PriceListCreate(BaseModel):
    product_id: int
    sup_article: str
    wh_price: Decimal
    moq_batches: int = 1
    batch_size: Decimal = 1.0

class PriceListResponse(PriceListCreate):
    price_id: int
    supplier_id: int
    
    class Config:
        from_attributes = True

# --- Схеми для Оцінки ефективності ---
class PerformanceCreate(BaseModel):
    batch_id: int
    delta_days: int = Field(..., description="Запізнення в днях (0 якщо вчасно)")
    quality_rate: Decimal = Field(..., description="Оцінка якості від 0.00 до 1.00")
    total_score: Decimal = Field(..., description="Загальний бал від 0.00 до 1.00")

class PerformanceResponse(BaseModel):
    record_id: int
    batch_id: int
    quality_rate: Decimal
    total_score: Decimal
    
    class Config:
        from_attributes = True


# --- Схеми для Партій товару (Прийомка на склад) ---
class BatchCreate(BaseModel):
    product_id: int
    order_id: int
    prod_date: date
    exp_date: date
    curr_qty: Decimal = Field(..., description="Фактична кількість прийнятого товару")

class BatchResponse(BatchCreate):
    batch_id: int
    arrival_date: datetime
    status: str
    
    class Config:
        from_attributes = True