import socket
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker
from app.config import settings

db_url = settings.database_url

# Динамічна підміна хоста для локального тестування (поза межами Docker)
try:
    socket.gethostbyname("srm_db")
except socket.gaierror:
    # Якщо srm_db не резолвиться, ми локально — підміняємо на localhost
    db_url = db_url.replace("@srm_db:", "@localhost:")

engine = create_engine(db_url)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()