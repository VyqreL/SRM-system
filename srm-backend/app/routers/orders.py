from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/orders", tags=["Замовлення"])

@router.post("/", response_model=schemas.OrderResponse, status_code=status.HTTP_201_CREATED)
def create_order(
    order_data: schemas.OrderCreate, 
    db: Session = Depends(get_db),
    # Охоронець: сюди пройде тільки той, хто має валідний токен
    current_user: models.User = Depends(get_current_user) 
):
    # 1. Перевіряємо, чи існує постачальник
    supplier = db.query(models.Supplier).filter(models.Supplier.supplier_id == order_data.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Постачальника з таким ID не знайдено")

    # 2. Створюємо шапку замовлення
    new_order = models.Order(
        supplier_id=order_data.supplier_id,
        status="Draft",
        total_sum=0  # Початкова сума, можна перерахувати нижче або довірити це тригеру в БД
    )
    db.add(new_order)
    
    # flush() відправляє SQL-запит в базу, генерує order_id, 
    # але НЕ робить остаточний commit. Якщо далі буде помилка - все відкотиться.
    db.flush() 

    calculated_total_sum = 0

    # 3. Додаємо товари до замовлення
    for item in order_data.items:
        # Перевіряємо, чи існує товар
        product = db.query(models.Product).filter(models.Product.product_id == item.product_id).first()
        if not product:
            db.rollback() # Скасовуємо створення шапки замовлення
            raise HTTPException(status_code=404, detail=f"Товар з ID {item.product_id} не знайдено")

        #Рахуємо вартість цього рядка (кількість упаковок * розмір упаковки * ціна)
        line_sum = item.ord_batches * item.batch_size * item.price_at_ord
        calculated_total_sum += line_sum

        new_item = models.OrderItem(
            order_id=new_order.order_id, # Використовуємо ID, який отримали після flush()
            product_id=item.product_id,
            sup_article=item.sup_article,
            ord_batches=item.ord_batches,
            batch_size=item.batch_size,
            price_at_ord=item.price_at_ord
        )
        db.add(new_item)

    # Записуємо підраховану суму в шапку замовлення ПЕРЕД комітом
    new_order.total_sum = calculated_total_sum # type: ignore

    # 4. Фіксуємо всі зміни (і шапку, і рядки) в базі даних одним махом
    db.commit()
    
    # Оновлюємо об'єкт із бази, щоб підтягнулися всі зв'язки (relationship 'items')
    db.refresh(new_order)
    
    return new_order

@router.get("/", response_model=list[schemas.OrderResponse])
def get_all_orders(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Повертає список усіх замовлень разом із вкладеними товарами.
    Доступно тільки для авторизованих користувачів.
    """
    # joinedload(models.Order.items) каже алхімії: 
    # "Одразу зроби JOIN таблиці order_items і підтягни всі рядки"
    orders = db.query(models.Order).options(joinedload(models.Order.items)).all()
    return orders

@router.get("/{order_id}", response_model=schemas.OrderResponse)
def get_order_by_id(
    order_id: int, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Отримати конкретне замовлення за його ID.
    """
    order = db.query(models.Order).options(joinedload(models.Order.items)).filter(models.Order.order_id == order_id).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Замовлення не знайдено")
        
    return order

@router.patch("/{order_id}/status", response_model=schemas.OrderResponse)
def update_order_status(
    order_id: int,
    status_data: schemas.OrderStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Зміна статусу замовлення з урахуванням ролей та правил State Machine.
    """
    # 1. Шукаємо замовлення
    order = db.query(models.Order).filter(models.Order.order_id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Замовлення не знайдено")

    current_status = order.status
    new_status = status_data.new_status
    role = current_user.role
    
    # 2. Визначаємо дозволені переходи для кожної ролі
    allowed_transitions = {
        "MANAGER": {
            "Draft": ["Confirmed", "Cancelled"],
            "Sent": ["Delivered"] # Менеджер підтверджує доставку
        },
        "SUPPLIER": {
            "Confirmed": ["Sent", "Cancelled"] # Постачальник відправляє замовлення
        }
    }

    # 3. Перевіряємо, чи може поточна роль взагалі змінювати поточний статус
    if role not in allowed_transitions or current_status not in allowed_transitions[role]: # type: ignore
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Користувач з роллю '{role}' не може змінювати замовлення зі статусом '{current_status}'."
        )

    # 4. Перевіряємо, чи є новий статус у списку дозволених переходів
    if new_status not in allowed_transitions[role][current_status]: # type: ignore
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Неприпустимий перехід зі статусу '{current_status}' до '{new_status}' для ролі '{role}'."
        )

    # 5. Додаткова перевірка для постачальника: чи це його замовлення?
    if role == "SUPPLIER":
        supplier_profile = db.query(models.Supplier).filter(models.Supplier.user_id == current_user.user_id).first()
        if not supplier_profile or order.supplier_id != supplier_profile.supplier_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Ви можете керувати лише власними замовленнями."
            )

    # 6. Якщо всі перевірки пройдені — оновлюємо статус
    order.status = new_status # type: ignore
    db.commit()
    db.refresh(order)
    
    return order