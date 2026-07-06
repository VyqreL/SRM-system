import sys
import os
from datetime import date, datetime, timedelta
import random

# Додаємо шлях до backend, щоб FastAPI модулі імпортувалися коректно
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import SessionLocal, engine
from app import models, security

# Динамічно генерований хеш пароля 'password123'
DEFAULT_PASSWORD_HASH = security.get_password_hash("password123")

CATEGORIES_DATA = [
    {"category_id": 4, "name": "Молочні продукти", "desc": "Товари з коротким терміном придатності"},
    {"category_id": 5, "name": "Напої", "desc": "Вода, соки, солодкі напої"},
    {"category_id": 6, "name": "Бакалія", "desc": "Крупи, макарони, борошно, олія"},
    {"category_id": 7, "name": "М'ясні вироби", "desc": "Ковбаси, сосиски, свіже м'ясо"},
    {"category_id": 8, "name": "Овочі та фрукти", "desc": "Свіжі фрукти, овочі, зелень"},
    {"category_id": 9, "name": "Кондитерські вироби", "desc": "Шоколад, цукерки, печиво, торти"}
]

PRODUCT_TEMPLATES = {
    4: [ # Молочні продукти
        ("Молоко 2.5%", "900г", "шт", "MILK"),
        ("Молоко 3.2%", "900г", "шт", "MILK"),
        ("Кефір 1%", "900г", "шт", "KEFIR"),
        ("Кефір 2.5%", "900г", "шт", "KEFIR"),
        ("Сметана 15%", "350г", "шт", "SOUR"),
        ("Сметана 20%", "350г", "шт", "SOUR"),
        ("Йогурт питний", "290г", "шт", "YOGH"),
        ("Сир домашній 9%", "350г", "шт", "COTT"),
        ("Сир домашній 5%", "350г", "шт", "COTT"),
        ("Масло вершкове 73%", "200г", "шт", "BUTT"),
        ("Масло вершкове 82%", "200г", "шт", "BUTT"),
        ("Вершки 10%", "500г", "шт", "CREA"),
        ("Ряжанка 4%", "450г", "шт", "RYAZ"),
        ("Сир твердий Голландський", "кг", "кг", "CHEE"),
        ("Сир твердий Королівський", "кг", "кг", "CHEE"),
        ("Сир плавлений Дружба", "90г", "шт", "CHEE"),
        ("Йогурт персик-абрикос", "115г", "шт", "YOGH"),
        ("Вершки для кави", "100г", "шт", "CREA"),
        ("Закваска 2.5%", "900г", "шт", "FERM"),
        ("Сир кисломолочний знежирений", "350г", "шт", "COTT")
    ],
    5: [ # Напої
        ("Вода мінеральна негазована", "1.5л", "шт", "WATR"),
        ("Вода мінеральна газована", "1.5л", "шт", "WATR"),
        ("Сік яблучний", "1л", "шт", "JUIC"),
        ("Сік апельсиновий", "1л", "шт", "JUIC"),
        ("Сік томатний", "1л", "шт", "JUIC"),
        ("Сік вишневий", "1л", "шт", "JUIC"),
        ("Кола Класик", "0.5л", "шт", "COLA"),
        ("Кола Класик", "1.5л", "шт", "COLA"),
        ("Лимонад лимонний", "1л", "шт", "LEMO"),
        ("Квас Тарас", "1.5л", "шт", "KVAS"),
        ("Холодний чай персик", "0.5л", "шт", "ICE"),
        ("Холодний чай зелений", "0.5л", "шт", "ICE"),
        ("Тонік газований", "1л", "шт", "TONI"),
        ("Сік мультифрукт", "1л", "шт", "JUIC"),
        ("Нептун Вода питна", "5л", "шт", "WATR"),
        ("Енергетичний напій", "0.25л", "шт", "ENER"),
        ("Сік виноградний", "1л", "шт", "JUIC"),
        ("Лимонад грушевий Дюшес", "1.5л", "шт", "LEMO"),
        ("Вода слабогазована", "0.75л", "шт", "WATR")
    ],
    6: [ # Бакалія
        ("Рис довгозернистий", "1кг", "шт", "RICE"),
        ("Гречка ядриця", "1кг", "шт", "GREC"),
        ("Макарони Пір'я", "1кг", "шт", "PAST"),
        ("Макарони Спіралі", "1кг", "шт", "PAST"),
        ("Борошно пшеничне в/г", "2кг", "шт", "FLOU"),
        ("Цукор білий", "1кг", "шт", "SUGA"),
        ("Сіль кам'яна", "1кг", "шт", "SALT"),
        ("Сіль йодована", "0.5кг", "шт", "SALT"),
        ("Олія соняшникова рафінована", "850мл", "шт", "OIL"),
        ("Олія оливкова Extra Virgin", "500мл", "шт", "OIL"),
        ("Вівсяні пластівці", "0.8кг", "шт", "OATS"),
        ("Горох колотий", "1кг", "шт", "PEAS"),
        ("Сочевиця червона", "0.8кг", "шт", "LENT"),
        ("Манна крупа", "0.8кг", "шт", "MANI"),
        ("Макарони Спагеті", "0.5кг", "шт", "PAST"),
        ("Дріжджі сухі", "10г", "шт", "YEAS"),
        ("Томатна паста", "350г", "шт", "TOMP"),
        ("Гірчиця столова", "120г", "шт", "MUST"),
        ("Майонез 67%", "300г", "шт", "MAYO")
    ],
    7: [ # М'ясні вироби
        ("Ковбаса Лікарська в/г", "кг", "кг", "SAUS"),
        ("Сосиски Молочні", "кг", "кг", "SAUS"),
        ("Балик свинячий копчений", "кг", "кг", "MEAT"),
        ("Фарш яловичий свіжий", "кг", "кг", "MINC"),
        ("Філе куряче охолоджене", "кг", "кг", "CHIC"),
        ("Шинка святкова", "кг", "кг", "HAM"),
        ("Бекон нарізаний", "200г", "шт", "BACO"),
        ("Ковбаса Салямі Золотиста", "кг", "кг", "SAUS"),
        ("Грудинка копчена", "кг", "кг", "MEAT"),
        ("Крильця курячі", "кг", "кг", "CHIC"),
        ("Стейк зі свинини", "кг", "кг", "MEAT"),
        ("Фарш домашній (свинина+яловичина)", "кг", "кг", "MINC"),
        ("Стегно куряче", "кг", "кг", "CHIC"),
        ("Ковбаса Московська с/к", "кг", "кг", "SAUS"),
        ("Сардельки з сиром", "кг", "кг", "SAUS"),
        ("Паштет печінковий", "150г", "шт", "PATE"),
        ("Ковбаски мисливські", "кг", "кг", "SAUS"),
        ("М'ясо яловиче для гуляшу", "кг", "кг", "MEAT")
    ],
    8: [ # Овочі та фрукти
        ("Яблука Голден", "кг", "кг", "APPL"),
        ("Банани імпортні", "кг", "кг", "BANA"),
        ("Лимони", "кг", "кг", "LEMO"),
        ("Апельсини", "кг", "кг", "ORAN"),
        ("Помідори червоні", "кг", "кг", "TOMA"),
        ("Огірки тепличні", "кг", "кг", "CUCU"),
        ("Картопля відбірна", "кг", "кг", "POTA"),
        ("Цибуля ріпчаста", "кг", "кг", "ONIO"),
        ("Морква свіжа", "кг", "кг", "CARR"),
        ("Капуста білокачанна", "кг", "кг", "CABB"),
        ("Грейпфрут", "кг", "кг", "GRAP"),
        ("Зелень кропу та петрушки", "100г", "шт", "HERB"),
        ("Часник", "кг", "кг", "GARL"),
        ("Буряк", "кг", "кг", "BEET"),
        ("Перець солодкий болгарський", "кг", "кг", "PEPP"),
        ("Гриби печериці", "кг", "кг", "MUSH"),
        ("Мандарини Клементин", "кг", "кг", "MAND"),
        ("Виноград кишмиш", "кг", "кг", "GRAP")
    ],
    9: [ # Кондитерські вироби
        ("Шоколад Корона молочний", "90г", "шт", "CHOC"),
        ("Печиво вівсяне традиційне", "300г", "шт", "COOK"),
        ("Цукерки Ромашка", "кг", "кг", "CAND"),
        ("Вафлі Артек", "80г", "шт", "WAFL"),
        ("Зефір біло-рожевий", "300г", "шт", "ZEPH"),
        ("Торт Празький", "0.8кг", "шт", "CAKE"),
        ("Круасан з шоколадом", "70г", "шт", "CROI"),
        ("Мармелад фруктовий", "250г", "шт", "MARM"),
        ("Шоколад Корона чорний", "90г", "шт", "CHOC"),
        ("Печиво Марія", "150г", "шт", "COOK"),
        ("Цукерки Червоний мак", "кг", "кг", "CAND"),
        ("Тістечко Еклер", "150г", "шт", "CAKE"),
        ("Вафлі згущене молоко", "80г", "шт", "WAFL"),
        ("Рулет бісквітний полуничний", "200г", "шт", "ROLL"),
        ("Драже арахіс у шоколаді", "100г", "шт", "DRAG"),
        ("Пряники заварні", "400г", "шт", "GIND"),
        ("Зефір у шоколаді", "300г", "шт", "ZEPH"),
        ("Торт Грильяжний", "0.5кг", "шт", "CAKE")
    ]
}

SUPPLIER_NAMES = [
    "ТОВ Галичина", "ТОВ Молочний Альянс", "ПрАТ Оболонь", "ТОВ Кока-Кола Беверіджиз",
    "ПП М'ясна Гільдія", "ТОВ Глобино", "ТОВ Чумак", "ПрАТ Київмлин", "ТОВ Сандора",
    "ПП ФрутСервіс", "ТОВ Рошен", "ТОВ АВК", "ТОВ Бакалія Трейд", "ПП АгроОвоч",
    "ТОВ Світ Ласощів"
]

def seed():
    db = SessionLocal()
    print("Початок очищення таблиць...")
    
    # Видалення існуючих даних
    db.execute(text("TRUNCATE TABLE performance_records RESTART IDENTITY CASCADE;"))
    db.execute(text("TRUNCATE TABLE product_batches RESTART IDENTITY CASCADE;"))
    db.execute(text("TRUNCATE TABLE order_items RESTART IDENTITY CASCADE;"))
    db.execute(text("TRUNCATE TABLE orders RESTART IDENTITY CASCADE;"))
    db.execute(text("TRUNCATE TABLE price_history RESTART IDENTITY CASCADE;"))
    db.execute(text("TRUNCATE TABLE price_lists RESTART IDENTITY CASCADE;"))
    db.execute(text("TRUNCATE TABLE stocks RESTART IDENTITY CASCADE;"))
    db.execute(text("TRUNCATE TABLE products RESTART IDENTITY CASCADE;"))
    db.execute(text("TRUNCATE TABLE categories RESTART IDENTITY CASCADE;"))
    db.execute(text("TRUNCATE TABLE managers RESTART IDENTITY CASCADE;"))
    db.execute(text("TRUNCATE TABLE suppliers RESTART IDENTITY CASCADE;"))
    db.execute(text("TRUNCATE TABLE users RESTART IDENTITY CASCADE;"))
    db.commit()
    print("Таблиці очищено.")

    # 1. Створення користувачів
    print("Створення користувачів...")
    # Дефолтні користувачі з 01_init.sql для сумісності з тестами
    user_supplier_def = models.User(user_id=1, email='supp@example.com', password_hash=DEFAULT_PASSWORD_HASH, role='SUPPLIER', is_active=True)
    user_manager_def = models.User(user_id=3, email='manager1@example.com', password_hash=DEFAULT_PASSWORD_HASH, role='MANAGER', is_active=True)
    db.add_all([user_supplier_def, user_manager_def])
    db.flush()
    db.execute(text("SELECT setval('users_user_id_seq', (SELECT MAX(user_id) FROM users));"))

    # Створюємо додаткових користувачів постачальників
    supplier_users = [user_supplier_def]
    for i in range(2, len(SUPPLIER_NAMES) + 1):
        email = f"supplier_{i}@example.com"
        u = models.User(email=email, password_hash=DEFAULT_PASSWORD_HASH, role='SUPPLIER', is_active=True)
        db.add(u)
        supplier_users.append(u)
    db.flush()

    # Додаткові менеджери
    manager_emails = ["manager_alex@example.com", "manager_mary@example.com"]
    for email in manager_emails:
        u = models.User(email=email, password_hash=DEFAULT_PASSWORD_HASH, role='MANAGER', is_active=True)
        db.add(u)
    db.flush()

    # 2. Створення менеджерів у БД (через SQL, бо моделі ORM для них немає)
    print("Створення менеджерів...")
    db.execute(text(
        "INSERT INTO managers (manager_id, user_id, first_name, last_name, phone, position, hire_date) VALUES "
        "(1, 3, 'Євген', 'Студент-КМІТ', '+380501234567', 'Старший закупник', '2026-03-28')"
    ))
    db.execute(text("SELECT setval('managers_manager_id_seq', (SELECT MAX(manager_id) FROM managers));"))
    # Додаткові менеджери
    db.execute(text(
        "INSERT INTO managers (user_id, first_name, last_name, phone, position, hire_date) VALUES "
        "((SELECT user_id FROM users WHERE email='manager_alex@example.com'), 'Олександр', 'Закупівельник', '+380507654321', 'Закупник', '2026-04-10'),"
        "((SELECT user_id FROM users WHERE email='manager_mary@example.com'), 'Марія', 'Контролер', '+380509998877', 'Аналітик залишків', '2026-05-01')"
    ))
    db.commit()

    # 3. Створення постачальників
    print("Створення постачальників...")
    # Дефолтний постачальник з supplier_id=2 та user_id=1
    supplier_def = models.Supplier(
        supplier_id=2, 
        user_id=1, 
        company_name=SUPPLIER_NAMES[0], 
        edrpou="12345678", 
        address="м. Львів, вул. Зелена, 10", 
        default_payment_terms="Deferred", 
        payment_deadline=14,
        rating=0.85
    )
    db.add(supplier_def)
    db.flush()
    db.execute(text("SELECT setval('suppliers_supplier_id_seq', (SELECT MAX(supplier_id) FROM suppliers));"))

    suppliers = [supplier_def]
    # Інші постачальники
    for idx, user in enumerate(supplier_users[1:], start=3):
        co_name = SUPPLIER_NAMES[idx - 2]
        edrpou = f"{random.randint(10000000, 99999999)}"
        adr = f"м. {random.choice(['Київ', 'Дніпро', 'Харків', 'Одеса', 'Запоріжжя'])}, вул. {random.choice(['Шевченка', 'Лесі Українки', 'Грушевського', 'Соборна'])}, {random.randint(1, 150)}"
        payment_terms = random.choice(["Deferred", "Prepaid", "Cash"])
        deadline = random.choice([0, 7, 14, 30])
        
        s = models.Supplier(
            user_id=user.user_id,
            company_name=co_name,
            edrpou=edrpou,
            address=adr,
            default_payment_terms=payment_terms,
            payment_deadline=deadline,
            rating=0.80
        )
        db.add(s)
        suppliers.append(s)
    db.flush()

    # 4. Створення категорій
    print("Створення категорій...")
    categories = []
    for cat_data in CATEGORIES_DATA:
        c = models.Category(category_id=cat_data["category_id"], name=cat_data["name"], description=cat_data["desc"])
        db.add(c)
        categories.append(c)
    db.flush()
    db.execute(text("SELECT setval('categories_category_id_seq', (SELECT MAX(category_id) FROM categories));"))

    # 5. Створення продуктів
    print("Створення продуктів...")
    products = []
    
    # Базові продукти для тестів
    p_milk_def = models.Product(product_id=6, category_id=4, internal_sku='SKU-MILK-001', name='Молоко 2.5%, 900г', unit='шт')
    p_water_def = models.Product(product_id=7, category_id=5, internal_sku='SKU-WATR-002', name='Вода мінеральна, 1.5л', unit='шт')
    db.add_all([p_milk_def, p_water_def])
    db.flush()
    db.execute(text("SELECT setval('products_product_id_seq', (SELECT MAX(product_id) FROM products));"))
    products.extend([p_milk_def, p_water_def])

    # Додаткові продукти
    product_counter = 100
    for cat_id, templates in PRODUCT_TEMPLATES.items():
        for name, pack, unit, code_prefix in templates:
            # Пропускаємо базові продукти, щоб не було дублікатів
            if cat_id == 4 and "Молоко 2.5%" in name:
                continue
            if cat_id == 5 and "Вода мінеральна негазована" in name:
                continue
                
            sku = f"SKU-{code_prefix}-{product_counter}"
            full_name = f"{name}, {pack}" if pack != "кг" else name
            
            p = models.Product(
                category_id=cat_id,
                internal_sku=sku,
                name=full_name,
                unit=unit
            )
            db.add(p)
            products.append(p)
            product_counter += 1
    db.flush()
    print(f"Створено {len(products)} продуктів.")

    # 6. Створення записів у stocks (залишки та ліміти)
    print("Створення stocks...")
    stocks = []
    # Дефолтні для тестів
    s_milk_def = models.Stock(stock_id=1, product_id=6, quantity=120.0, reorder_point=50.0)
    s_water_def = models.Stock(stock_id=2, product_id=7, quantity=0.0, reorder_point=100.0)
    db.add_all([s_milk_def, s_water_def])
    db.flush()
    db.execute(text("SELECT setval('stocks_stock_id_seq', (SELECT MAX(stock_id) FROM stocks));"))
    stocks.extend([s_milk_def, s_water_def])

    for p in products:
        if p.product_id in [6, 7]:
            continue
        reorder = float(random.choice([10, 20, 50, 100, 150]))
        st = models.Stock(
            product_id=p.product_id,
            quantity=0.0,  # Залишки будуть нульовими і пізніше вирахуються/оновляться
            reorder_point=reorder
        )
        db.add(st)
        stocks.append(st)
    db.flush()

    # 7. Створення прайс-листів (PriceList)
    print("Створення прайс-листів...")
    price_lists = []
    
    # Дефолтні прайси для ТОВ Галичина (supplier_id=2)
    pl_milk_def = models.PriceList(supplier_id=2, product_id=6, sup_article='GAL-MILK-01', wh_price=120.00, moq_batches=1, batch_size=12.0)
    pl_water_def = models.PriceList(supplier_id=2, product_id=7, sup_article='GAL-WATR-15', wh_price=14.20, moq_batches=5, batch_size=6.0)
    db.add_all([pl_milk_def, pl_water_def])
    db.flush()
    price_lists.extend([pl_milk_def, pl_water_def])

    # Кожен постачальник пропонує випадкову вибірку продуктів (від 15 до 30 штук)
    # Також продукти за категоріями мають відповідати спеціалізації постачальника (напр. ТОВ Галичина - молочні продукти тощо)
    # Для простоти зробимо розподіл: постачальники пропонують продукти із категорій відповідно до своєї назви або випадково.
    for s in suppliers:
        # Для кожного постачальника вибираємо ~25 випадкових продуктів
        # Для ТОВ Галичина додамо ще товарів
        selected_products = random.sample(products, k=min(len(products), random.randint(20, 35)))
        for p in selected_products:
            # Уникаємо повторень для дефолтних
            if s.supplier_id == 2 and p.product_id in [6, 7]:
                continue
                
            wh_p = round(random.uniform(10.0, 350.0), 2)
            batch_sz = float(random.choice([1, 4, 6, 12, 24]))
            moq = random.choice([1, 2, 5, 10])
            art = f"{s.company_name[:3].upper()}-{p.internal_sku[4:]}"
            
            pl = models.PriceList(
                supplier_id=s.supplier_id,
                product_id=p.product_id,
                sup_article=art,
                wh_price=wh_p,
                moq_batches=moq,
                batch_size=batch_sz
            )
            db.add(pl)
            price_lists.append(pl)
    db.flush()
    db.commit()

    # 8. Симуляція оновлення цін для генерації PriceHistory через тригер бази даних
    print("Оновлення цін для генерації історії цін (через тригери БД)...")
    # Оновлюємо приблизно 35% цін у прайс-листі
    pl_to_update = random.sample(price_lists, k=int(len(price_lists) * 0.35))
    for pl in pl_to_update:
        # Стара ціна
        old_val = pl.wh_price
        # Нова ціна змінюється на випадковий відсоток (-10% ... +15%)
        percent = random.uniform(-0.10, 0.15)
        new_val = round(float(old_val) * (1.0 + percent), 2)
        if new_val < 5.0:
            new_val = 5.00
            
        pl.wh_price = new_val
    db.commit()
    print("Ціни оновлено. Тригер log_price_changes() мав спрацювати.")

    # 9. Створення замовлень (Orders) та деталей (OrderItems) за останні 120 днів
    print("Генерація 1000+ замовлень за останні 120 днів...")
    today = date.today()
    start_date = today - timedelta(days=120)
    
    # Групуємо прайс-листи за постачальниками для швидкого пошуку
    supplier_prices = {}
    for pl in price_lists:
        supplier_prices.setdefault(pl.supplier_id, []).append(pl)

    orders_count = 0
    orders_to_create = 1050
    
    # Список для збереження доставлених замовлень, щоб потім додати до них партії
    delivered_orders = []

    # Рівномірно розподіляємо замовлення за днями
    current_date = start_date
    orders_per_day = orders_to_create // 120

    while orders_count < orders_to_create:
        day_orders_limit = random.randint(orders_per_day - 3, orders_per_day + 5)
        for _ in range(day_orders_limit):
            if orders_count >= orders_to_create:
                break
                
            # Випадковий постачальник
            s = random.choice(suppliers)
            # Товари, які він пропонує
            s_offers = supplier_prices.get(s.supplier_id, [])
            if not s_offers:
                continue
                
            # Визначаємо статус замовлення залежно від дати
            days_ago = (today - current_date).days
            if days_ago > 10:
                # Старі замовлення
                status = random.choice(["Delivered", "Delivered", "Delivered", "Cancelled"])
            elif days_ago >= 3:
                # Нещодавні замовлення
                status = random.choice(["Delivered", "Sent", "Sent", "Cancelled"])
            else:
                # Дуже свіжі замовлення
                status = random.choice(["Draft", "Confirmed", "Sent", "Delivered"])
                
            # Створюємо замовлення
            created_at_dt = datetime.combine(current_date, datetime.min.time()) + timedelta(
                hours=random.randint(8, 20),
                minutes=random.randint(0, 59)
            )
            
            order = models.Order(
                supplier_id=s.supplier_id,
                status=status,
                created_at=created_at_dt,
                total_sum=0
            )
            db.add(order)
            db.flush() # щоб отримати order_id
            
            # Додаємо від 1 до 5 товарів у замовлення
            items_num = random.randint(1, 5)
            selected_offers = random.sample(s_offers, k=min(len(s_offers), items_num))
            
            total_sum = 0
            for offer in selected_offers:
                ord_bat = random.randint(1, 20)
                line_sum = float(offer.wh_price) * float(offer.batch_size) * ord_bat
                total_sum += line_sum
                
                item = models.OrderItem(
                    order_id=order.order_id,
                    product_id=offer.product_id,
                    sup_article=offer.sup_article,
                    ord_batches=ord_bat,
                    batch_size=offer.batch_size,
                    price_at_ord=offer.wh_price
                )
                db.add(item)
                
            order.total_sum = round(total_sum, 2)
            db.flush()
            
            if status == "Delivered":
                delivered_orders.append((order, created_at_dt))
                
            orders_count += 1
            
        current_date += timedelta(days=1)
        if current_date > today:
            current_date = start_date # Повертаємо по колу, якщо не дотягнули до ліміту
            
    db.commit()
    print(f"Створено {orders_count} замовлень.")

    # 10. Створення партій (ProductBatch) для доставлених замовлень
    print("Генерація партій товарів на складі для доставлених замовлень...")
    batches = []
    
    # Щоб не перевантажувати базу, згенеруємо партії для підмножини доставлених замовлень
    # Наприклад, для 700 випадкових замовлень
    delivered_sample = random.sample(delivered_orders, k=min(len(delivered_orders), 750))
    
    # Визначимо терміни придатності залежно від категорії продукту
    # Категорія 4 (Молочні): 10-20 днів
    # Категорія 5 (Напої): 90-180 днів
    # Категорія 6 (Бакалія): 180-360 днів
    # Категорія 7 (М'ясо): 15-30 днів
    # Категорія 8 (Овочі/фрукти): 7-15 днів
    # Категорія 9 (Кондитерка): 30-120 днів
    shelf_life_map = {
        4: (10, 20),
        5: (90, 180),
        6: (180, 360),
        7: (15, 30),
        8: (7, 15),
        9: (30, 120)
    }

    for order, order_dt in delivered_sample:
        # Отримуємо товари у цьому замовленні
        items = db.query(models.OrderItem).filter(models.OrderItem.order_id == order.order_id).all()
        for item in items:
            product = db.query(models.Product).filter(models.Product.product_id == item.product_id).first()
            if not product:
                continue
                
            cat_id = product.category_id
            life_range = shelf_life_map.get(cat_id, (30, 90))
            days_life = random.randint(*life_range)
            
            # prod_date = дата замовлення - випадково 1-5 днів
            prod_date = (order_dt - timedelta(days=random.randint(1, 5))).date()
            # exp_date = prod_date + days_life
            exp_date = prod_date + timedelta(days=days_life)
            
            # arrival_date = дата замовлення + 1-3 дні
            arrival_date = order_dt + timedelta(days=random.randint(1, 3))
            
            # Початкова кількість
            total_units = float(item.ord_batches) * float(item.batch_size)
            
            # Поточна кількість (curr_qty) залежить від того, наскільки стара партія
            days_since_arrival = (datetime.now() - arrival_date).days
            
            if days_since_arrival > days_life:
                # Термін придатності минув, або товар давно продано
                curr_qty = 0.0
                status = "Active" # в базі статус Active, але по факту 0
            elif days_since_arrival > (days_life * 0.7):
                # Партія закінчується
                curr_qty = round(total_units * random.uniform(0.0, 0.2), 3)
                status = "Active"
            else:
                # Свіжа партія
                curr_qty = round(total_units * random.uniform(0.4, 1.0), 3)
                status = "Active"
                
            batch = models.ProductBatch(
                product_id=item.product_id,
                order_id=order.order_id,
                prod_date=prod_date,
                arrival_date=arrival_date,
                exp_date=exp_date,
                curr_qty=curr_qty,
                status=status
            )
            db.add(batch)
            batches.append(batch)
            
    db.flush()
    db.commit()
    print(f"Створено {len(batches)} партій на складі.")

    # 11. Оновлення stocks.quantity на основі суми curr_qty активних партій
    print("Синхронізація stocks.quantity на основі активних партій...")
    # Оскільки тригерів на синхронізацію немає, розрахуємо суми партій та запишемо в stocks
    for st in stocks:
        active_sum = db.query(models.ProductBatch.curr_qty).filter(
            models.ProductBatch.product_id == st.product_id
        ).all()
        total_qty = sum([b[0] for b in active_sum])
        st.quantity = float(total_qty)
    db.commit()
    print("Stocks синхронізовано.")

    # 12. Створення PerformanceRecord для доставлених партій
    print("Генерація звітів про ефективність (PerformanceRecord)...")
    performance_count = 0
    # Згенеруємо оцінки для 85% створених партій
    batches_sample = random.sample(batches, k=int(len(batches) * 0.85))
    
    for batch in batches_sample:
        # Розраховуємо delta_time: прибуття мінус дата замовлення (плановий термін поставки 2 дні)
        order = db.query(models.Order).filter(models.Order.order_id == batch.order_id).first()
        if not order:
            continue
            
        actual_delivery_days = (batch.arrival_date - order.created_at).days
        # delta_time = фактичний час доставки мінус очікуваний (2 дні)
        delta_days = actual_delivery_days - 2
        delta_time = timedelta(days=delta_days)
        
        # Оцінки
        quality_rate = float(round(random.uniform(0.75, 1.0), 2))
        
        # Оцінка своєчасності
        if delta_days <= 0:
            timeliness_score = 1.0
        elif delta_days == 1:
            timeliness_score = 0.9
        elif delta_days == 2:
            timeliness_score = 0.7
        else:
            timeliness_score = max(0.2, 1.0 - (delta_days * 0.1))
            
        total_score = float(round((quality_rate + timeliness_score) / 2, 2))
        
        perf = models.PerformanceRecord(
            batch_id=batch.batch_id,
            delta_time=delta_time,
            quality_rate=quality_rate,
            total_score=total_score
        )
        db.add(perf)
        performance_count += 1
        
    db.commit()
    print(f"Створено {performance_count} записів ефективності. Тригер рейтингу мав оновити suppliers.rating.")

    print("\nПосів успішно завершено!")
    db.close()

if __name__ == "__main__":
    seed()
