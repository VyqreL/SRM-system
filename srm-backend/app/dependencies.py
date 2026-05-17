from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app import models, security
from app.database import get_db
from app.config import settings

# Ця магічна штука вказує Swagger-у, куди йти за токеном (зелена кнопка Authorize)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """
    Ця функція перехоплює токен, розшифровує його і повертає об'єкт користувача з БД.
    Якщо токен підроблений або прострочений - кидає помилку 401.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не вдалося перевірити облікові дані (токен недійсний або прострочений)",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Розшифровуємо токен за допомогою нашого секретного ключа
        payload = jwt.decode(token, settings.secret_key, algorithms=[security.ALGORITHM])
        email: str = payload.get("sub") # type: ignore
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    # Шукаємо користувача в базі
    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception
        
    return user