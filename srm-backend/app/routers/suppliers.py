from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/suppliers", tags=["Постачальники (загальне)"])

@router.get("/", response_model=List[schemas.SupplierShortResponse])
def get_all_suppliers(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Отримати список всіх постачальників (для Менеджера)."""
    if current_user.role != "MANAGER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ дозволено тільки менеджерам.")
    
    suppliers = db.query(models.Supplier).order_by(models.Supplier.company_name).all()
    return suppliers

@router.get("/{supplier_id}/products", response_model=List[schemas.ProductForOrderCreation])
def get_products_for_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Отримати список товарів з цінами для конкретного постачальника (для Менеджера)."""
    if current_user.role != "MANAGER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ дозволено тільки менеджерам.")
    
    results = db.query(
        models.Product.product_id,
        models.Product.name,
        models.PriceList.wh_price,
        models.PriceList.batch_size,
        models.PriceList.moq_batches
    ).join(models.PriceList, models.Product.product_id == models.PriceList.product_id)\
     .filter(models.PriceList.supplier_id == supplier_id).order_by(models.Product.name).all()
    
    return results