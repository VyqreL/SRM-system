from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta
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
    """Прийомка товару на склад (створення партії). Доступно тільки менеджерам."""
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
