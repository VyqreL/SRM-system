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
    # 0. Перевірка ролі: тільки менеджер може створювати замовлення
    if current_user.role != "MANAGER":
        raise HTTPException(status_code=403, detail="Тільки менеджер може створювати нові замовлення.")

    # 1. Перевіряємо, чи існує постачальник, якому створюється замовлення
    supplier = db.query(models.Supplier).filter(models.Supplier.supplier_id == order_data.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Постачальника з таким ID не знайдено")

    # 2. Створюємо шапку замовлення
    new_order = models.Order(
        supplier_id=order_data.supplier_id,
        # Всі нові замовлення створюються в статусі "Чернетка"
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
    Повертає список замовлень.
    - Менеджер бачить усі замовлення.
    - Постачальник бачить тільки свої замовлення.
    """
    # joinedload(models.Order.items) каже алхімії: 
    # "Одразу зроби JOIN таблиці order_items і підтягни всі рядки"
    query = db.query(models.Order).options(
        joinedload(models.Order.supplier),
        joinedload(models.Order.items).joinedload(models.OrderItem.product),
        joinedload(models.Order.batches)
    ).order_by(models.Order.order_id.desc())
    
    if current_user.role == "MANAGER":
        # Менеджер бачить все
        orders = query.all()
    elif current_user.role == "SUPPLIER":
        # Постачальник бачить тільки свої
        supplier_profile = db.query(models.Supplier).filter(models.Supplier.user_id == current_user.user_id).first()
        if not supplier_profile:
            # Постачальник без профілю не має замовлень
            return []
        orders = query.filter(models.Order.supplier_id == supplier_profile.supplier_id).all()
    else:
        # Інші ролі (напр. ADMIN) не бачать замовлень за замовчуванням
        return []
        
    return orders

@router.get("/{order_id}", response_model=schemas.OrderResponse)
def get_order_by_id(
    order_id: int, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Отримати конкретне замовлення за його ID.
    Менеджер бачить будь-яке замовлення.
    Постачальник - тільки своє.
    """
    order = db.query(models.Order).options(
        joinedload(models.Order.supplier),
        joinedload(models.Order.items).joinedload(models.OrderItem.product),
        joinedload(models.Order.batches)
    ).filter(models.Order.order_id == order_id).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Замовлення не знайдено")
        
    if current_user.role == "SUPPLIER":
        supplier_profile = db.query(models.Supplier).filter(models.Supplier.user_id == current_user.user_id).first()
        if not supplier_profile or order.supplier_id != supplier_profile.supplier_id:
            raise HTTPException(status_code=403, detail="Ви не маєте доступу до цього замовлення.")
            
    # Менеджер має доступ до всіх замовлень, тому додаткова перевірка не потрібна
        
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


@router.post("/bulk", response_model=list[schemas.OrderResponse], status_code=status.HTTP_201_CREATED)
def create_bulk_orders(
    bulk_data: schemas.BulkOrderCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Групове створення замовлень (інвойсів).
    Приймає список товарів з різними постачальниками, групує їх за постачальником
    і створює окреме замовлення (Draft) для кожного.
    """
    if current_user.role != "MANAGER":
        raise HTTPException(status_code=403, detail="Тільки менеджер може створювати замовлення.")

    if not bulk_data.items:
        raise HTTPException(status_code=400, detail="Список товарів не може бути порожнім.")

    # Групуємо товари за supplier_id
    grouped_items = {}
    for item in bulk_data.items:
        grouped_items.setdefault(item.supplier_id, []).append(item)

    created_orders = []

    try:
        for supplier_id, items in grouped_items.items():
            # Перевіряємо постачальника
            supplier = db.query(models.Supplier).filter(models.Supplier.supplier_id == supplier_id).first()
            if not supplier:
                raise HTTPException(status_code=404, detail=f"Постачальника з ID {supplier_id} не знайдено.")

            # Створюємо шапку замовлення
            new_order = models.Order(
                supplier_id=supplier_id,
                status="Draft",
                total_sum=0
            )
            db.add(new_order)
            db.flush()  # Отримуємо order_id

            calculated_total = 0
            for item in items:
                # Перевіряємо продукт
                product = db.query(models.Product).filter(models.Product.product_id == item.product_id).first()
                if not product:
                    raise HTTPException(status_code=404, detail=f"Товар з ID {item.product_id} не знайдено.")

                line_sum = item.ord_batches * item.batch_size * item.price_at_ord
                calculated_total += line_sum

                new_item = models.OrderItem(
                    order_id=new_order.order_id,
                    product_id=item.product_id,
                    sup_article=item.sup_article,
                    ord_batches=item.ord_batches,
                    batch_size=item.batch_size,
                    price_at_ord=item.price_at_ord
                )
                db.add(new_item)

            new_order.total_sum = calculated_total
            created_orders.append(new_order)

        db.commit()
        
        # Робимо refresh для кожного замовлення, щоб підтягнути зв'язки
        # Використовуємо joinedload для уникнення N+1 проблеми при серіалізації
        refreshed_orders = []
        for order in created_orders:
            refreshed = db.query(models.Order).options(
                joinedload(models.Order.supplier),
                joinedload(models.Order.items).joinedload(models.OrderItem.product),
                joinedload(models.Order.batches)
            ).filter(models.Order.order_id == order.order_id).first()
            if refreshed:
                refreshed_orders.append(refreshed)
            
        return refreshed_orders

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Помилка при створенні групових замовлень: {str(e)}")