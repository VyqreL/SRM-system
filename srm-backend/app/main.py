from fastapi import FastAPI
from app.database import engine, Base
from app.routers import auth, users, orders, business, prices
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="SRM System API",
    description="Бекенд-система для управління взаємовідносинами з постачальниками (FMCG)",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
        ],  # Дозволяємо запити з нашого фронтенду
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Підключаємо роутери
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(orders.router)
app.include_router(business.router)
app.include_router(prices.router)

@app.get("/")
async def root():
    return {"message": "Вітаємо у SRM System API!", "docs": "/docs"}