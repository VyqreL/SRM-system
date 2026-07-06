from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/prices", tags=["Прайс-листи"])

def get_supplier_profile(db: Session, user_id: int):
    """Допоміжна функція для отримання профілю постачальника за user_id"""
    supplier = db.query(models.Supplier).filter(models.Supplier.user_id == user_id).first()
    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, 
            detail="Профіль постачальника не знайдено. Спочатку заповніть профіль компанії."
        )
    return supplier

@router.get("/", response_model=List[schemas.PriceListResponse])
def get_my_prices(
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    """Отримати весь прайс-лист для поточного постачальника"""
    if current_user.role != "SUPPLIER":
        raise HTTPException(status_code=403, detail="Тільки постачальник має доступ до своїх прайс-листів.")
    
    supplier = get_supplier_profile(db, current_user.user_id) # type: ignore
    prices = db.query(models.PriceList).filter(models.PriceList.supplier_id == supplier.supplier_id).all()
    return prices

@router.post("/", response_model=schemas.PriceListResponse, status_code=status.HTTP_201_CREATED)
def create_price_list_item(
    price_data: schemas.PriceListCreate, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    """Додати новий товар у прайс-лист"""
    if current_user.role != "SUPPLIER":
        raise HTTPException(status_code=403, detail="Тільки постачальник може додавати товари до прайс-листа.")
        
    supplier = get_supplier_profile(db, current_user.user_id) # type: ignore
    
    # Захист від дублів: чи є вже такий товар у прайсі цього постачальника?
    existing_price = db.query(models.PriceList).filter(
        models.PriceList.supplier_id == supplier.supplier_id,
        models.PriceList.product_id == price_data.product_id
    ).first()
    
    if existing_price:
        raise HTTPException(status_code=400, detail="Цей товар вже є у вашому прайс-листі. Використовуйте метод оновлення (PUT).")
        
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

@router.put("/{price_id}", response_model=schemas.PriceListResponse)
def update_price_list_item(
    price_id: int, 
    price_data: schemas.PriceListUpdate, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    """Оновити позицію (зокрема ціну) із збереженням історії"""
    if current_user.role != "SUPPLIER":
        raise HTTPException(status_code=403, detail="Тільки постачальник може оновлювати прайс-лист.")
        
    supplier = get_supplier_profile(db, current_user.user_id) # type: ignore
    
    price_query = db.query(models.PriceList).filter(
        models.PriceList.price_id == price_id,
        models.PriceList.supplier_id == supplier.supplier_id
    )
    
    # Використовуємо model_dump(exclude_unset=True) щоб оновлювати тільки передані поля
    update_values = price_data.model_dump(exclude_unset=True)

    # Якщо не передано жодного поля для оновлення
    if not update_values:
        raise HTTPException(status_code=400, detail="Не надано жодного поля для оновлення.")

    # Виконуємо прямий UPDATE запит, щоб гарантовано викликати тригер БД.
    # Це надійніше, ніж покладатися на відстеження змін в об'єкті сесії.
    # query.update() повертає кількість оновлених рядків.
    rows_updated = price_query.update(update_values, synchronize_session=False)
    
    if rows_updated == 0:
        raise HTTPException(status_code=404, detail="Позицію прайс-листа не знайдено або вона вам не належить.")

    db.commit()
    
    # Використовуємо сучасний Session.get() для отримання оновленого об'єкта.
    # Це також вирішує попередження 'LegacyAPIWarning', яке могло виникати раніше.
    updated_price_obj = db.get(models.PriceList, price_id)
    if not updated_price_obj:
        raise HTTPException(status_code=404, detail="Не вдалося отримати оновлений об'єкт після збереження.") # Додаткова перевірка
    
    return updated_price_obj

@router.get("/{price_id}/history", response_model=List[schemas.PriceHistoryResponse])
def get_price_history(price_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Отримати лог зміни ціни для конкретного товару"""
    # Доступ мають менеджери та власник-постачальник
    price_obj = db.query(models.PriceList).filter(models.PriceList.price_id == price_id).first()
    if not price_obj:
        raise HTTPException(status_code=404, detail="Позицію прайс-листа не знайдено.")
        
    if current_user.role == "SUPPLIER":
        supplier = get_supplier_profile(db, current_user.user_id) # type: ignore
        if price_obj.supplier_id != supplier.supplier_id:
            raise HTTPException(status_code=403, detail="Ви можете бачити історію лише своїх цін.")
            
    history = db.query(models.PriceHistory).filter(
        models.PriceHistory.supplier_id == price_obj.supplier_id,
        models.PriceHistory.product_id == price_obj.product_id
    ).order_by(models.PriceHistory.change_date.desc()).all()
    return history

@router.get("/products", response_model=List[schemas.ProductResponse])
def get_all_products(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Отримати список всіх товарів у системі (доступно всім авторизованим користувачам)"""
    products = db.query(models.Product).order_by(models.Product.name).all()
    return products