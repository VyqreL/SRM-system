from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app import models, schemas, security
from app.database import get_db
from fastapi.security import OAuth2PasswordRequestForm
from app.dependencies import get_current_user
from datetime import timedelta

router = APIRouter(prefix="/auth", tags=["Автентифікація та Реєстрація"])

# ---------------------------------------------------------
# 1. ВІДКРИТА РЕЄСТРАЦІЯ (Тільки для Постачальників)
# ---------------------------------------------------------
@router.post("/register/supplier", response_model=schemas.UserResponse)
def register_supplier(user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    # Перевіряємо, чи не зайнятий email
    existing_user = db.query(models.User).filter(models.User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Цей email вже зареєстрований")

    # Створюємо постачальника
    hashed_pwd = security.get_password_hash(user_data.password)
    new_user = models.User(
        email=user_data.email,
        password_hash=hashed_pwd,
        role="SUPPLIER",
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


# ---------------------------------------------------------
# 2. ГЕНЕРАЦІЯ ЗАПРОШЕННЯ (Для Менеджерів)
# ---------------------------------------------------------
@router.post("/invite/manager")
def invite_manager(
    invite_data: schemas.ManagerInviteCreate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Тільки адміністратор може генерувати запрошення для менеджерів")
    
    existing_user = db.query(models.User).filter(models.User.email == invite_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Користувач з таким email вже існує")

    token = security.generate_invite_token()
    
    # Створюємо "скелет" користувача без пароля, але з токеном
    new_manager = models.User(
        email=invite_data.email,
        password_hash="!INVITED_NO_PASSWORD",
        role="MANAGER",
        registration_token=token,
        is_active=False    # Акаунт неактивний до завершення реєстрації
    )
    db.add(new_manager)
    db.commit()
    
    # В реальності тут би відправлявся лист на email, але для MVP просто повертаємо токен
    return {"message": "Запрошення створено", "invite_link": f"http://127.0.0.1:8000/auth/register/manager?token={token}"}


# ---------------------------------------------------------
# 3. ЗАВЕРШЕННЯ РЕЄСТРАЦІЇ МЕНЕДЖЕРА ЗА ТОКЕНОМ
# ---------------------------------------------------------
@router.post("/register/manager", response_model=schemas.UserResponse)
def complete_manager_registration(reg_data: schemas.ManagerCompleteRegistration, db: Session = Depends(get_db)):
    # Шукаємо користувача за унікальним токеном
    user = db.query(models.User).filter(models.User.registration_token == reg_data.token).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Недійсний або прострочений токен запрошення")

    # Активуємо акаунт і встановлюємо пароль
    user.password_hash = security.get_password_hash(reg_data.password) # type: ignore
    user.registration_token = None  # Знищуємо токен, щоб його не використали двічі # type: ignore
    user.is_active = True # type: ignore
    
    db.commit()
    db.refresh(user)
    return user

# ---------------------------------------------------------
# 4. ЛОГІН (Отримання JWT токена)
# ---------------------------------------------------------
@router.post("/login", response_model=schemas.Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(), 
    db: Session = Depends(get_db)
):
    # УВАГА: OAuth2PasswordRequestForm під капотом завжди очікує поле 'username'.
    # Тому ми передаємо наш email у поле username.
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    
    # Перевіряємо, чи існує користувач і чи збігається пароль
    if not user or not security.verify_password(form_data.password, str(user.password_hash)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неправильний email або пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    # Створюємо токен, зашиваючи туди email та роль користувача
    access_token_expires = timedelta(minutes=security.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        data={"sub": user.email, "role": user.role}, 
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer", "token": access_token}