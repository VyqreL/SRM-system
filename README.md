# FMCG Supply Chain Management System (SRM)

[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

A Corporate Information System (CIS) for supply chain management (SRM system) tailored for the FMCG sector. It automates purchasing workflows, price list management, warehouse batch reception, shelf life tracking, and supplier performance evaluation based on objective logistic KPIs.

> 🇺🇦 **Читати українською:** Якщо ви шукаєте україномовну версію документації, перейдіть до [README.uk.md](README.uk.md).

---

## 🏗️ Tech Stack

- **Backend:** FastAPI (Python), REST API, SQLAlchemy ORM, Pydantic, Passlib/Bcrypt, JWT.
- **Database:** PostgreSQL (with PL/pgSQL triggers and functions).
- **Frontend:** Next.js (App Router, React, TypeScript, Tailwind CSS).
- **Infrastructure:** Docker and Docker Compose.

---

## 📜 Database as the Single Source of Truth

The project enforces database-level consistency and logic. Business rules are tightly coupled to the PostgreSQL layer via PL/pgSQL triggers. Python's backend acts as a validation and communication bridge.

Key triggers active in the database:
- `tr_log_price_change` (upon `UPDATE` in `price_lists`): Automatically archives previous prices in the `price_history` table. FastAPI only performs updates; history tracking is completely hands-off.
- `tr_update_rating_after_perf` (upon `INSERT` in `performance_records`): Recalculates and updates the integration score (`rating`) in the `Supplier` table after batch delivery and scoring.
- `prevent_product_delete`: Restricts deletion of catalog products if they are mapped to any active orders.
- `check_order_status_change`: Safeguards the order status state-machine (Draft ➔ Confirmed ➔ Sent ➔ Delivered). Prevents illegal actions, such as canceling an already shipped or delivered order.

---

## 📦 Project Structure

```text
SRM/
├── srm-backend/              # Backend (FastAPI, Python)
│   ├── app/
│   │   ├── routers/          # REST API Controllers (auth, users, orders, prices, suppliers, business)
│   │   ├── models.py         # SQLAlchemy ORM models (DB Schema)
│   │   ├── schemas.py        # Pydantic schemas (Data Transfer Objects)
│   │   ├── security.py       # JWT Authorization and Hashing (Passlib/Bcrypt)
│   │   ├── dependencies.py   # Dependency Injection (get_db, get_current_user)
│   │   └── main.py           # FastAPI entry point, CORS, Router mounting
│   └── tests/                # Unit tests (Pytest)
├── srm-frontend/             # Frontend (Next.js App Router, React, TypeScript)
│   ├── app/
│   │   ├── dashboard/        # Protected Role-Based workspace
│   │   │   ├── manager/      # Purchasing Manager features
│   │   │   │   ├── analytics/# Financial/logistics dashboard (SVG charts)
│   │   │   │   ├── expirations/# Expiry date control for inventory batches
│   │   │   │   ├── mappings/ # SKU mappings between supplier and internal network codes
│   │   │   │   ├── stocks/   # Minimum stock settings (reorder_point)
│   │   │   │   └── products/ # Product card details (pricing trend charts)
│   │   │   ├── supplier/     # Supplier Partner dashboard
│   │   │   │   └── prices/   # Price list management, MOQ, package sizing
│   │   │   ├── orders/       # Order page, invoice print layout (PDF), batch acceptance
│   │   │   └── profile/      # Workspace profile & business details
│   │   ├── login/            # User Authentication
│   │   └── register/         # User Registration
│   └── tailwind.config.ts    # Tailwind styling config
└── docker-compose.yml        # Multi-container orchestration (DB, Backend, Frontend)
```

---

## 🌟 Key Features per Role

### 1. Purchasing Manager (Manager Cabinet)
- **Deficit Dashboard (`/dashboard/manager/reorder-suggestions`)**: Automatically checks product levels against their set `reorder_point` and offers instant group ordering recommendations.
- **Group Order Creation**: Packages orders into invoices respecting supplier constraints like **MOQ** (Minimum Order Quantity) and **package size rounding**.
- **Batch Logistics and Expirations (`/dashboard/manager/expirations`)**: Tracks inventory with strict batch logging (production date, expiry dates).
- **Goods Reception & Rating**: Evaluates delivered batches on a 10-point scale (OTIF - On-Time In-Full metrics, product quality, service rate) which updates the supplier rating dynamically in the DB.
- **Analytics (`/dashboard/manager/analytics`)**: Analyzes price trends, order summaries, and logistic KPIs with custom SVG diagrams.

### 2. Supplier (Supplier Cabinet)
- **Price List Management (`/dashboard/supplier/prices`)**: Directly edit product catalog connections, wholesale prices, MOQ, and pack sizing.
- **Order Dispatching**: Review orders placed by managers and mark status updates when cargo is shipped.
- **Rating Review**: View overall rating score fetched directly from the database performance logs.

### 3. Administrator
- **Configuration & User Controls**: Profile validation and master controls.

---

## 🚀 Setup and Launch Guide

### Prerequisites
Make sure you have [Docker](https://www.docker.com/) and [Docker Compose](https://docs.docker.com/compose/) installed on your machine.

### Step 1: Clone the repository
```bash
git clone https://github.com/your-username/srm-system.git
cd srm-system
```

### Step 2: Environment Variables
Create a `.env` file inside the `srm-backend` directory:
```env
# PostgreSQL Database settings
POSTGRES_USER=postgres
POSTGRES_PASSWORD=root
POSTGRES_DB=srm_db

# Connection URL for SQLAlchemy
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@srm_db:5432/${POSTGRES_DB}

# Backend security secrets
SECRET_KEY=super_secret_key_for_srm_project_2026
```

### Step 3: Run the Application
Start the application services in the background:
```bash
docker compose up --build -d
```
This command spins up three services:
1. **Database (`srm_db`)** at `localhost:5432`.
2. **Backend API (`srm_backend`)** at `localhost:8000`.
3. **Frontend SPA (`srm_frontend`)** at `localhost:3000`.

### Step 4: Database Seeding
To populate the database with category info, catalog products, simulated suppliers, order histories, and batches, run the seed script inside the running backend container:
```bash
docker exec -it srm_backend python seed_db.py
```

---

## 🔑 Demo Credentials
You can log in to the system using the following pre-seeded credentials (all passwords are `password123`):

| Role | Email | Password | Description |
|---|---|---|---|
| **Purchasing Manager** | `manager1@example.com` | `password123` | Senior Purchaser account (Eugene) |
| **Supplier Partner** | `supp@example.com` | `password123` | Representative of "ТОВ Галичина" |
| **Additional Manager** | `manager_alex@example.com` | `password123` | Junior Purchaser |
| **Additional Supplier**| `supplier_2@example.com` | `password123` | Representative of "ТОВ Молочний Альянс" |

---

## 🧪 Testing and Quality Control

To run automated unit tests (for the backend logic, routers, schemas):
```bash
docker exec -it srm_backend pytest -v
```