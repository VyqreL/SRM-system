from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text, func
from typing import List
from datetime import datetime, date, timedelta
from decimal import Decimal
from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(tags=["Бізнес-процеси (Прайси та Оцінка)"])

@router.post("/price-lists/", response_model=schemas.PriceListResponse)
def create_price_list(
    price_data: schemas.PriceListCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Додавання товару в прайс-лист. Доступно тільки постачальникам."""
    if current_user.role != "SUPPLIER":
        raise HTTPException(status_code=403, detail="Тільки постачальник може редагувати прайс-лист")

    # Знаходимо ID постачальника, який прив'язаний до цього юзера
    supplier = db.query(models.Supplier).filter(models.Supplier.user_id == current_user.user_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Профіль постачальника не знайдено")

    new_price = models.PriceList(
        supplier_id=supplier.supplier_id,
        product_id=price_data.product_id,
        sup_article=price_data.sup_article,
        wh_price=price_data.wh_price,
        moq_batches=price_data.moq_batches,
        batch_size=price_data.batch_size
    )
    db.add(new_price)
    db.commit()
    db.refresh(new_price)
    return new_price

@router.post("/performance/", response_model=schemas.PerformanceResponse)
def rate_supplier_performance(
    perf_data: schemas.PerformanceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Оцінка партії товару (автоматично оновлює рейтинг). Доступно тільки менеджерам."""
    if current_user.role != "MANAGER":
        raise HTTPException(status_code=403, detail="Тільки менеджер може оцінювати постачальника")

    # Конвертуємо дні з JSON у об'єкт timedelta для бази даних
    time_interval = timedelta(days=perf_data.delta_days)

    new_record = models.PerformanceRecord(
        batch_id=perf_data.batch_id,
        delta_time=time_interval,
        quality_rate=perf_data.quality_rate,
        total_score=perf_data.total_score
    )
    db.add(new_record)
    
    try:
        db.commit()
        db.refresh(new_record)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Помилка при збереженні. Перевірте, чи існує такий batch_id.")
        
    return new_record

@router.post("/batches/", response_model=schemas.BatchResponse)
def receive_product_batch(
    batch_data: schemas.BatchCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Прийом товару на склад (створення партії). Доступно тільки менеджерам."""
    if current_user.role != "MANAGER":
        raise HTTPException(status_code=403, detail="Тільки менеджер може приймати товар на склад")

    # Перевіряємо бізнес-правило бази даних: термін придатності має бути більшим за дату виробництва
    if batch_data.exp_date <= batch_data.prod_date:
        raise HTTPException(status_code=400, detail="Термін придатності (exp_date) повинен бути більшим за дату виробництва (prod_date)")

    new_batch = models.ProductBatch(
        product_id=batch_data.product_id,
        order_id=batch_data.order_id,
        prod_date=batch_data.prod_date,
        exp_date=batch_data.exp_date,
        curr_qty=batch_data.curr_qty
    )
    db.add(new_batch)
    db.commit()
    db.refresh(new_batch)
    
    return new_batch

@router.get("/suggestions/reorder", response_model=List[schemas.ReorderSuggestionResponse])
def get_reorder_suggestions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Отримання списку товарів, які потребують замовлення (дефіцит). Доступно тільки менеджерам."""
    if current_user.role != "MANAGER":
        raise HTTPException(status_code=403, detail="Тільки менеджер має доступ до дашборду дефіциту")

    # Використовуємо існуючу VIEW у базі даних за допомогою "text"
    suggestions = db.execute(text("SELECT * FROM view_reorder_suggestions")).mappings().all()
    return suggestions


@router.get("/business/products/offers", response_model=List[schemas.ProductOffersResponse])
def get_products_with_offers(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Отримання всіх товарів з доступними пропозиціями від постачальників (для Менеджера)"""
    if current_user.role != "MANAGER":
        raise HTTPException(status_code=403, detail="Доступ дозволено тільки менеджерам.")

    products = db.query(models.Product).all()
    response = []
    for prod in products:
        # Отримуємо всі ціни для цього товару
        prices = db.query(models.PriceList).filter(models.PriceList.product_id == prod.product_id).all()
        offers = []
        for price in prices:
            supplier = db.query(models.Supplier).filter(models.Supplier.supplier_id == price.supplier_id).first()
            if supplier:
                offers.append(schemas.SupplierOffer(
                    supplier_id=price.supplier_id,
                    company_name=supplier.company_name,
                    wh_price=price.wh_price,
                    moq_batches=price.moq_batches,
                    batch_size=price.batch_size,
                    sup_article=price.sup_article,
                    rating=supplier.rating
                ))
        response.append(schemas.ProductOffersResponse(
            product_id=prod.product_id,
            name=prod.name,
            internal_sku=prod.internal_sku,
            unit=prod.unit,
            offers=offers
        ))
    return response


@router.get("/business/analytics", response_model=schemas.AnalyticsDashboardResponse)
def get_analytics_dashboard(
    period: str = "week",  # week, month, quarter
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Дашборд аналітики за замовленнями та OTIF рейтингом (для Менеджера)"""
    if current_user.role != "MANAGER":
        raise HTTPException(status_code=403, detail="Доступ дозволено тільки менеджерам.")

    # Визначаємо початкову дату
    now = datetime.now()
    if period == "week":
        start_date = now - timedelta(days=7)
        days_step = 1
    elif period == "month":
        start_date = now - timedelta(days=30)
        days_step = 5  # групуємо по 5 днів
    elif period == "quarter":
        start_date = now - timedelta(days=90)
        days_step = 15  # групуємо по 15 днів
    else:
        raise HTTPException(status_code=400, detail="Неприпустимий період. Очікується week, month або quarter.")

    # 1. Отримуємо всі замовлення за цей період
    orders = db.query(models.Order).filter(
        models.Order.created_at >= start_date,
        models.Order.status != "Cancelled"
    ).all()

    # Рахуємо загальні витрати (сума замовлень у статусі Delivered або Confirmed або Sent)
    active_statuses = ["Confirmed", "Sent", "Delivered"]
    expenses_orders = [o for o in orders if o.status in active_statuses]
    total_expenses = sum(o.total_sum for o in expenses_orders)
    total_earnings = total_expenses * Decimal("0.30")  # Оціночний заробіток (30% маржа)
    total_orders = len(orders)

    # 2. Розраховуємо OTIF та якість доставки
    perf_records = db.query(models.PerformanceRecord).join(
        models.ProductBatch, models.PerformanceRecord.batch_id == models.ProductBatch.batch_id
    ).filter(
        models.ProductBatch.arrival_date >= start_date
    ).all()

    if perf_records:
        avg_otif = sum(r.total_score for r in perf_records) / len(perf_records)
        avg_quality = sum(r.quality_rate for r in perf_records) / len(perf_records)
        # Вчасність доставки: відсоток замовлень, де delta_time <= 0 днів
        on_time_count = sum(1 for r in perf_records if r.delta_time <= timedelta(seconds=0))
        timeliness_rate = Decimal(on_time_count) / Decimal(len(perf_records))
    else:
        avg_otif = Decimal("1.00")
        avg_quality = Decimal("1.00")
        timeliness_rate = Decimal("1.00")

    # 3. Генеруємо дані для графіка
    chart_data = []
    current_date = start_date
    while current_date <= now:
        next_date = current_date + timedelta(days=days_step)
        interval_orders = [
            o for o in expenses_orders
            if current_date <= o.created_at < next_date
        ]
        interval_expenses = sum(o.total_sum for o in interval_orders)
        interval_earnings = interval_expenses * Decimal("0.30")

        chart_data.append(schemas.AnalyticsChartPoint(
            date=current_date.strftime("%d.%m"),
            expenses=interval_expenses,
            earnings=interval_earnings
        ))
        current_date = next_date

    return schemas.AnalyticsDashboardResponse(
        total_expenses=total_expenses,
        total_earnings=total_earnings,
        total_orders=total_orders,
        otif_rate=avg_otif,
        quality_rate=avg_quality,
        timeliness_rate=timeliness_rate,
        chart_data=chart_data
    )


@router.get("/business/batches/expiration-warnings", response_model=List[schemas.ExpirationWarningResponse])
def get_expiration_warnings(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Попередження про товари на складі, термін придатності яких спливає незабаром (для Менеджера)"""
    if current_user.role != "MANAGER":
        raise HTTPException(status_code=403, detail="Доступ дозволено тільки менеджерам.")

    today = date.today()
    warning_limit = today + timedelta(days=30)

    # Отримуємо активні партії з залишками на складі
    batches = db.query(models.ProductBatch).filter(
        models.ProductBatch.status == "Active",
        models.ProductBatch.curr_qty > 0,
        models.ProductBatch.exp_date <= warning_limit
    ).order_by(models.ProductBatch.exp_date).all()

    response = []
    for batch in batches:
        product = db.query(models.Product).filter(models.Product.product_id == batch.product_id).first()
        if product:
            days_left = (batch.exp_date - today).days
            response.append(schemas.ExpirationWarningResponse(
                batch_id=batch.batch_id,
                product_id=batch.product_id,
                product_name=product.name,
                internal_sku=product.internal_sku,
                exp_date=batch.exp_date,
                curr_qty=batch.curr_qty,
                days_left=days_left,
                status=batch.status
            ))
    return response


@router.get("/business/prices/mappings", response_model=List[schemas.ProductMappingResponse])
def get_product_mappings(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Отримання списку товарів у прайсах із артикулами постачальників (для Менеджера)"""
    if current_user.role != "MANAGER":
        raise HTTPException(status_code=403, detail="Доступ дозволено тільки менеджерам.")

    results = db.query(
        models.PriceList.price_id,
        models.PriceList.product_id,
        models.Product.name.label("product_name"),
        models.Product.internal_sku.label("internal_sku"),
        models.Category.name.label("category_name"),
        models.PriceList.supplier_id,
        models.Supplier.company_name.label("company_name"),
        models.PriceList.sup_article.label("sup_article"),
        models.PriceList.wh_price.label("wh_price")
    ).join(models.Product, models.PriceList.product_id == models.Product.product_id)\
     .join(models.Category, models.Product.category_id == models.Category.category_id)\
     .join(models.Supplier, models.PriceList.supplier_id == models.Supplier.supplier_id)\
     .order_by(models.Product.name, models.Supplier.company_name).all()

    return results


@router.put("/business/prices/mappings/{price_id}", response_model=schemas.ProductMappingResponse)
def update_product_mapping(
    price_id: int,
    mapping_data: schemas.MappingUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Оновлення артикулу постачальника для позиції прайс-листа менеджером"""
    if current_user.role != "MANAGER":
        raise HTTPException(status_code=403, detail="Доступ дозволено тільки менеджерам.")

    price_item = db.query(models.PriceList).filter(models.PriceList.price_id == price_id).first()
    if not price_item:
        raise HTTPException(status_code=404, detail="Позицію у прайс-листі не знайдено.")

    price_item.sup_article = mapping_data.sup_article
    db.commit()

    # Повертаємо оновлений маппінг
    result = db.query(
        models.PriceList.price_id,
        models.PriceList.product_id,
        models.Product.name.label("product_name"),
        models.Product.internal_sku.label("internal_sku"),
        models.Category.name.label("category_name"),
        models.PriceList.supplier_id,
        models.Supplier.company_name.label("company_name"),
        models.PriceList.sup_article.label("sup_article"),
        models.PriceList.wh_price.label("wh_price")
    ).join(models.Product, models.PriceList.product_id == models.Product.product_id)\
     .join(models.Category, models.Product.category_id == models.Category.category_id)\
     .join(models.Supplier, models.PriceList.supplier_id == models.Supplier.supplier_id)\
     .filter(models.PriceList.price_id == price_id).first()

    return result


@router.get("/business/stocks/limits", response_model=List[schemas.StockLimitResponse])
def get_stock_limits(
    days: int = 7,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Отримання лімітів залишків на складі та обсягів продажів за останні N днів (для Менеджера)"""
    if current_user.role != "MANAGER":
        raise HTTPException(status_code=403, detail="Доступ дозволено тільки менеджерам.")

    start_date = datetime.now() - timedelta(days=days)

    # Отримуємо всі записи з stocks разом із product та category
    stocks = db.query(models.Stock).join(models.Product, models.Stock.product_id == models.Product.product_id)\
        .join(models.Category, models.Product.category_id == models.Category.category_id).all()

    response = []
    for s in stocks:
        delivered_qty = db.query(func.sum(models.OrderItem.total_units)).join(models.Order).filter(
            models.OrderItem.product_id == s.product_id,
            models.Order.status == "Delivered",
            models.Order.created_at >= start_date
        ).scalar() or 0

        remaining_qty = db.query(func.sum(models.ProductBatch.curr_qty)).filter(
            models.ProductBatch.product_id == s.product_id,
            models.ProductBatch.arrival_date >= start_date,
            models.ProductBatch.status == "Active"
        ).scalar() or 0

        sales_volume = max(0, delivered_qty - remaining_qty)

        response.append(schemas.StockLimitResponse(
            stock_id=s.stock_id,
            product_id=s.product_id,
            product_name=s.product.name,
            internal_sku=s.product.internal_sku,
            category_name=s.product.category.name,
            current_quantity=s.quantity,
            reorder_point=s.reorder_point,
            sales_volume=sales_volume
        ))

    return response


@router.put("/business/stocks/limits/{stock_id}", response_model=schemas.StockLimitResponse)
def update_stock_limit(
    stock_id: int,
    limit_data: schemas.StockLimitUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Оновлення мінімального ліміту (reorder_point) товару на складі менеджером"""
    if current_user.role != "MANAGER":
        raise HTTPException(status_code=403, detail="Доступ дозволено тільки менеджерам.")

    stock = db.query(models.Stock).filter(models.Stock.stock_id == stock_id).first()
    if not stock:
        raise HTTPException(status_code=404, detail="Запис запасу на складі не знайдено.")

    stock.reorder_point = limit_data.reorder_point
    db.commit()

    # Порахуємо за замовчуванням за останні 7 днів
    start_date = datetime.now() - timedelta(days=7)
    
    delivered_qty = db.query(func.sum(models.OrderItem.total_units)).join(models.Order).filter(
        models.OrderItem.product_id == stock.product_id,
        models.Order.status == "Delivered",
        models.Order.created_at >= start_date
    ).scalar() or 0

    remaining_qty = db.query(func.sum(models.ProductBatch.curr_qty)).filter(
        models.ProductBatch.product_id == stock.product_id,
        models.ProductBatch.arrival_date >= start_date,
        models.ProductBatch.status == "Active"
    ).scalar() or 0

    sales_volume = max(0, delivered_qty - remaining_qty)

    return schemas.StockLimitResponse(
        stock_id=stock.stock_id,
        product_id=stock.product_id,
        product_name=stock.product.name,
        internal_sku=stock.product.internal_sku,
        category_name=stock.product.category.name,
        current_quantity=stock.quantity,
        reorder_point=stock.reorder_point,
        sales_volume=sales_volume
    )


@router.get("/business/products/{product_id}/details", response_model=schemas.ProductDetailsResponse)
def get_product_details(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Отримання повної інформації про товар, його залишки, товарообіг та історію цін (для Менеджера)"""
    if current_user.role != "MANAGER":
        raise HTTPException(status_code=403, detail="Доступ дозволено тільки менеджерам.")

    product = db.query(models.Product).filter(models.Product.product_id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Товар не знайдено.")

    # Отримуємо категорію
    category_name = product.category.name if product.category else "Без категорії"

    # Отримуємо поточний запас
    stock = db.query(models.Stock).filter(models.Stock.product_id == product_id).first()
    current_stock = stock.quantity if stock else 0

    # Розрахунок закуплено (всього в доставлених та активних замовленнях)
    total_purchased = db.query(func.sum(models.OrderItem.total_units)).join(models.Order).filter(
        models.OrderItem.product_id == product_id,
        models.Order.status.in_(["Confirmed", "Sent", "Delivered"])
    ).scalar() or 0

    # Розрахунок продано: всього доставлено - поточні залишки активних партій
    total_delivered = db.query(func.sum(models.OrderItem.total_units)).join(models.Order).filter(
        models.OrderItem.product_id == product_id,
        models.Order.status == "Delivered"
    ).scalar() or 0

    current_active_batches_qty = db.query(func.sum(models.ProductBatch.curr_qty)).filter(
        models.ProductBatch.product_id == product_id,
        models.ProductBatch.status == "Active"
    ).scalar() or 0

    total_sold = max(0, total_delivered - current_active_batches_qty)

    # Отримуємо історію цін
    history_records = db.query(
        models.PriceHistory.history_id,
        models.Supplier.company_name,
        models.PriceHistory.old_price,
        models.PriceHistory.new_price,
        models.PriceHistory.change_date
    ).join(models.Supplier, models.PriceHistory.supplier_id == models.Supplier.supplier_id)\
     .filter(models.PriceHistory.product_id == product_id)\
     .order_by(models.PriceHistory.change_date.asc()).all()

    price_history = [
        schemas.PriceHistoryPoint(
            history_id=h.history_id,
            company_name=h.company_name,
            old_price=h.old_price,
            new_price=h.new_price,
            change_date=h.change_date
        ) for h in history_records
    ]

    return schemas.ProductDetailsResponse(
        product_id=product.product_id,
        name=product.name,
        internal_sku=product.internal_sku,
        unit=product.unit,
        category_name=category_name,
        current_stock=current_stock,
        total_purchased=total_purchased,
        total_sold=total_sold,
        price_history=price_history
    )
