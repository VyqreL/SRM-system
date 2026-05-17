from passlib.context import CryptContext
import secrets
from datetime import datetime, timedelta, timezone
from jose import jwt
from app.config import settings

# Алгоритм шифрування
ALGORITHM = "HS256"
# Час життя токена (для MVP зробимо 24 години, щоб не доводилось постійно логінитись)
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

# Налаштування контексту для хешування паролів
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    """Генерує безпечний хеш пароля"""
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Перевіряє, чи збігається пароль із хешем у базі"""
    return pwd_context.verify(plain_password, hashed_password)

def generate_invite_token() -> str:
    """Генерує випадковий 32-символьний токен для запрошення"""
    return secrets.token_urlsafe(32)

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Генерує JWT токен із заданими даними (наприклад, email та роль)"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
        
    # Додаємо час закінчення дії токена (exp - reserved claim in JWT)
    to_encode.update({"exp": expire})
    
    # Створюємо підписаний токен
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)
    return encoded_jwt