# КІС Управління постачанням (SRM-система) для FMCG-сектору

[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

Корпоративна Інформаційна Система (КІС) управління постачанням (SRM-система), розроблена спеціально для FMCG-сектору. Програма автоматизує процеси закупівель, керування прайс-листами постачальників, прийому партій на склад, контролю термінів придатності товарів та розрахунку інтегрального рейтингу постачальників на основі логістичних KPI.

> 🇬🇧 **Read in English:** If you are looking for the English documentation, please check out [README.md](README.md).

---

## 🏗️ Стек технологій

- **Бекенд:** FastAPI (Python), REST API, SQLAlchemy ORM, Pydantic, Passlib/Bcrypt, JWT.
- **База даних:** PostgreSQL (з активним використанням PL/pgSQL тригерів та функцій).
- **Фронтенд:** Next.js (App Router, React, TypeScript, Tailwind CSS).
- **Інфраструктура:** Docker та Docker Compose.

---

## 📜 База даних як "Єдине джерело істини" (Single Source of Truth)

Бізнес-логіка системи частково делегована на рівень СУБД за допомогою тригерів та функцій PL/pgSQL. Це гарантує цілісність даних незалежно від клієнтських запитів:
- **`tr_log_price_change`** (при `UPDATE` в таблиці `price_lists`): Автоматично логує попередні ціни в `price_history`. Бекенд лише оновлює поточну ціну, а логування історії відбувається на боці PostgreSQL.
- **`tr_update_rating_after_perf`** (при `INSERT` в `performance_records`): Автоматично перераховує та оновлює інтегральний показник `rating` у таблиці `Supplier` після оцінки менеджером виконаної доставки.
- **`prevent_product_delete`**: Блокує видалення товарів з каталогу, якщо вони вже задіяні у замовленнях.
- **`check_order_status_change`**: Забезпечує коректність життєвого циклу замовлення (Draft ➔ Confirmed ➔ Sent ➔ Delivered). Забороняє некоректні переходи (наприклад, скасування замовлення, яке вже відправлено чи доставлено).

---

## 📦 Структура проєкту

```text
SRM/
├── srm-backend/              # Бекенд (FastAPI, Python)
│   ├── app/
│   │   ├── routers/          # REST API Контролери (auth, users, orders, prices, suppliers, business)
│   │   ├── models.py         # SQLAlchemy ORM моделі (схема БД)
│   │   ├── schemas.py        # Pydantic схеми (Data Transfer Objects)
│   │   ├── security.py       # JWT авторизація та хешування (Passlib/Bcrypt)
│   │   ├── dependencies.py   # Dependency Injection (get_db, get_current_user)
│   │   └── main.py           # Точка входу FastAPI, CORS, підключення роутерів
│   └── tests/                # Unit-тести (Pytest)
├── srm-frontend/             # Фронтенд (Next.js App Router, React, TypeScript)
│   ├── app/
│   │   ├── dashboard/        # Захищена зона (рольовий layout)
│   │   │   ├── manager/      # Кабінет менеджера (закупника)
│   │   │   │   ├── analytics/# Дашборд фінансової та логістичної аналітики (SVG графіки)
│   │   │   │   ├── expirations/# Контроль критичних термінів придатності партій
│   │   │   │   ├── mappings/ # Маппінг номенклатури артиклів мережі та постачальника
│   │   │   │   ├── stocks/   # Керування мінімальними залишками (reorder_point)
│   │   │   │   └── products/ # Детальна картка товару з графіками тренду цін
│   │   │   ├── supplier/     # Кабінет постачальника (партнера)
│   │   │   │   └── prices/   # Керування цінами, MOQ, упаковкою та історією змін
│   │   │   ├── orders/       # Деталі замовлення, друк PDF та прийом поставок
│   │   │   └── profile/      # Сторінка профілю користувача
│   │   ├── login/            # Авторизація
│   │   └── register/         # Реєстрація постачальників
│   └── tailwind.config.ts    # Налаштування стилів Tailwind
└── docker-compose.yml        # Оркестрація контейнерів (PostgreSQL, Backend, Frontend)
```

---

## 🌟 Ключовий функціонал за ролями

### 1. Менеджер (Закупник)
- **Дашборд дефіциту (`/dashboard/manager/reorder-suggestions`)**: Автоматичний моніторинг залишків. Пропонує рекомендації до замовлення на основі визначеного `reorder_point`.
- **Групове створення інвойсів**: Формування замовлень із урахуванням умов постачальника — **MOQ** (мінімальна кількість) та **округлення до кратності упаковки**.
- **Контроль термінів придатності (`/dashboard/manager/expirations`)**: Контроль партій на складі, виділення товарів з критичним терміном.
- **Прийом поставок та Оцінка**: Приймання товарів на склад за фактом доставки із фіксацією дат випуску/придатності та оцінюванням постачальника за 10-бальною шкалою (OTIF - On-Time In-Full, якість тощо).
- **Аналітика та Звіти (`/dashboard/manager/analytics`)**: Інтерактивні SVG-графіки динаміки цін на товари, замовлень та KPI постачальників.

### 2. Постачальник (Партнер)
- **Керування прайс-листом (`/dashboard/supplier/prices`)**: Редагування оптових цін, MOQ та кратності упаковок для товарів.
- **Обробка замовлень**: Перегляд замовлень від мережі, маркування статусу відправлення вантажів.
- **Перегляд рейтингу**: Відображення актуального інтегрального рейтингу компанії на основі розрахованих оцінок.

### 3. Адміністратор
- **Конфігурація користувачів**: Верифікація профілів постачальників, глобальні налаштування системи.

---

## 🚀 Інструкція із запуску та розгортання

### Передумови
Переконайтеся, що на вашому комп'ютері встановлено [Docker](https://www.docker.com/) та [Docker Compose](https://docs.docker.com/compose/).

### Крок 1: Клонування репозиторію
```bash
git clone https://github.com/your-username/srm-system.git
cd srm-system
```

### Крок 2: Налаштування змінних оточення
Створіть файл `.env` у каталозі `srm-backend`:
```env
# Налаштування для створення контейнера PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=root
POSTGRES_DB=srm_db

# Рядок підключення для FastAPI
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@srm_db:5432/${POSTGRES_DB}

# Секрети бекенду для JWT шифрування
SECRET_KEY=super_secret_key_for_srm_project_2026
```

### Крок 3: Запуск сервісів
Виконайте команду для збирання та запуску контейнерів у фоновому режимі:
```bash
docker compose up --build -d
```
Це запустить три ключові сервіси:
1. **База даних (`srm_db`)** — доступна на порту `5432`.
2. **Бекенд FastAPI (`srm_backend`)** — доступний на порту `8000`.
3. **Фронтенд Next.js (`srm_frontend`)** — доступний на порту `3000`.

### Крок 4: Наповнення бази даних демо-даними (Seeding)
Для первинного наповнення каталогу товарів, створення категорій, тестових постачальників, замовлень та партій на складі запустіть спеціальний скрипт всередині контейнера бекенду:
```bash
docker exec -it srm_backend python seed_db.py
```

---

## 🔑 Тестові користувачі для авторизації
Для перевірки роботи системи скористайтеся попередньо створеними акаунтами (пароль для всіх акаунтів — `password123`):

| Роль | Email | Пароль | Опис |
|---|---|---|---|
| **Менеджер (Закупник)** | `manager1@example.com` | `password123` | Старший менеджер закупівлі (Євген) |
| **Постачальник (Партнер)** | `supp@example.com` | `password123` | Представник "ТОВ Галичина" |
| **Додатковий Менеджер** | `manager_alex@example.com` | `password123` | Закупівельник Олександр |
| **Додатковий Постачальник**| `supplier_2@example.com` | `password123` | Представник "ТОВ Молочний Альянс" |

---

## 🧪 Тестування коду
Для запуску автоматичних unit-тестів бекенду виконайте команду:
```bash
docker exec -it srm_backend pytest -v
```