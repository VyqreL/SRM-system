from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Numeric, DateTime, Date, FetchedValue, Interval, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

# Блок 1: Користувачі та безпека
class User(Base):
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20))
    registration_token = Column(String(255))
    is_active = Column(Boolean, default=True)

    # Зв'язки (Relationships) дозволяють FastAPI автоматично підтягувати пов'язані дані
    supplier_profile = relationship("Supplier", back_populates="user", uselist=False)


# Блок 2: Товарний каталог
class Product(Base):
    __tablename__ = "products"

    product_id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.category_id", ondelete="RESTRICT"))
    internal_sku = Column(String(50), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    unit = Column(String(10), nullable=False)
    order_items = relationship("OrderItem", back_populates="product")


# Блок 3: Контрагенти (Постачальники)
class Supplier(Base):
    __tablename__ = "suppliers"

    supplier_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"))
    company_name = Column(String(255), nullable=False)
    edrpou = Column(String(10))
    address = Column(Text)
    default_payment_terms = Column(String(50))
    payment_deadline = Column(Integer, default=0)
    rating = Column(Numeric(3,2), server_default=FetchedValue())
    
    user = relationship("User", back_populates="supplier_profile")
    orders = relationship("Order", back_populates="supplier")


# Блок 4: Замовлення
class Order(Base):
    __tablename__ = "orders"

    order_id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id", ondelete="RESTRICT"))
    status = Column(String(50), default="Draft")
    total_sum = Column(Numeric(15, 2), default=0)
    created_at = Column(DateTime, server_default=func.now())

    supplier = relationship("Supplier", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    batches = relationship("ProductBatch", back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"

    item_id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.order_id", ondelete="CASCADE"))
    product_id = Column(Integer, ForeignKey("products.product_id"))
    sup_article = Column(String(50))
    ord_batches = Column(Integer, nullable=False)
    batch_size = Column(Integer, nullable=False)
    price_at_ord = Column(Numeric(12, 2), nullable=False)
    # Додаємо колонки, щоб SQLAlchemy знала про їхнє існування
    total_units = Column(Numeric(14, 3), server_default=FetchedValue())
    line_total = Column(Numeric(15, 2), server_default=FetchedValue())

    order = relationship("Order", back_populates="items")
    product = relationship("Product", back_populates="order_items")

class PriceList(Base):
    __tablename__ = "price_lists"
    price_id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id"))
    product_id = Column(Integer, ForeignKey("products.product_id"))
    sup_article = Column(String(50))
    wh_price = Column(Numeric(12,2), nullable=False)
    moq_batches = Column(Integer, default=1)
    batch_size = Column(Numeric(12,3), default=1)

class PriceHistory(Base):
    __tablename__ = "price_history"
    history_id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.supplier_id"))
    product_id = Column(Integer, ForeignKey("products.product_id"))
    old_price = Column(Numeric(12, 2), nullable=False)
    new_price = Column(Numeric(12, 2), nullable=False)
    change_date = Column(DateTime, server_default=func.now())

class PerformanceRecord(Base):
    __tablename__ = "performance_records"
    record_id = Column(Integer, primary_key=True, index=True)
    batch_id = Column(Integer, ForeignKey("product_batches.batch_id"))
    delta_time = Column(Interval) 
    quality_rate = Column(Numeric(3,2))
    total_score = Column(Numeric(3,2))

class ProductBatch(Base):
    __tablename__ = "product_batches"
    batch_id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.product_id"))
    order_id = Column(Integer, ForeignKey("orders.order_id"))
    prod_date = Column(Date)
    # arrival_date генерується базою автоматично (DEFAULT CURRENT_TIMESTAMP)
    arrival_date = Column(DateTime, server_default=FetchedValue()) 
    exp_date = Column(Date, nullable=False)
    curr_qty = Column(Numeric(12,3), nullable=False)
    status = Column(String(20), default="Active")

    order = relationship("Order", back_populates="batches")