from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import schemas, models, security
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/users", tags=["Користувачі (Захищені)"])

# Зверни увагу на `Depends(get_current_user)`!
# Це означає: "FastAPI, перш ніж виконати цей код, сходи в dependencies.py 
# і принеси мені поточного користувача. Якщо щось не так - відбий запит".
@router.get("/me", response_model=schemas.UserResponse)
def get_my_profile(current_user: models.User = Depends(get_current_user)):
    """
    Повертає дані профілю поточного авторизованого користувача.
    """
    return current_user

@router.put("/me/password")
def update_my_password(
    pwd_data: schemas.PasswordUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Зміна пароля поточного користувача."""
    if not security.verify_password(pwd_data.current_password, str(current_user.password_hash)):
        raise HTTPException(status_code=400, detail="Неправильний поточний пароль")
    current_user.password_hash = security.get_password_hash(pwd_data.new_password) # type: ignore
    db.commit()
    return {"message": "Пароль успішно змінено"}

@router.post("/suppliers/profile", response_model=schemas.SupplierProfileResponse)
def create_supplier_profile(
    profile_data: schemas.SupplierProfileCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Створення профілю компанії (Кабінет постачальника)."""
    if current_user.role != "SUPPLIER":
        raise HTTPException(status_code=403, detail="Тільки користувачі з роллю SUPPLIER можуть створювати профіль компанії.")

    # 1. Перевіряємо, чи цей користувач вже не має профілю
    existing_profile = db.query(models.Supplier).filter(models.Supplier.user_id == current_user.user_id).first()
    if existing_profile:
        raise HTTPException(status_code=400, detail="Профіль компанії вже створено для цього користувача.")

    # 2. Створюємо профіль, автоматично прив'язуючи його до поточного user_id
    new_supplier = models.Supplier(
        user_id=current_user.user_id,
        company_name=profile_data.company_name,
        edrpou=profile_data.edrpou,
        address=profile_data.address,
        default_payment_terms=profile_data.default_payment_terms,
        payment_deadline=profile_data.payment_deadline
        # rating автоматично стане 1.00 завдяки DEFAULT у базі
    )
    db.add(new_supplier)
    db.commit()
    db.refresh(new_supplier)
    
    return new_supplier

@router.get("/suppliers/profile", response_model=schemas.SupplierProfileResponse)
def get_supplier_profile(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Отримання профілю компанії поточного постачальника."""
    if current_user.role != "SUPPLIER":
        raise HTTPException(status_code=403, detail="Тільки постачальник має профіль компанії.")
    
    profile = db.query(models.Supplier).filter(models.Supplier.user_id == current_user.user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Профіль компанії не знайдено.")
    return profile

@router.put("/suppliers/profile", response_model=schemas.SupplierProfileResponse)
def update_supplier_profile(
    profile_data: schemas.SupplierProfileUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """Оновлення профілю компанії поточного постачальника."""
    if current_user.role != "SUPPLIER":
        raise HTTPException(status_code=403, detail="Тільки постачальник може редагувати профіль компанії.")
        
    profile = db.query(models.Supplier).filter(models.Supplier.user_id == current_user.user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Профіль компанії не знайдено. Спочатку створіть його.")
        
    update_data = profile_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(profile, key, value)
        
    db.commit()
    db.refresh(profile)
    return profile