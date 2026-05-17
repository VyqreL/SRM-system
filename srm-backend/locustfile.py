from locust import HttpUser, task, between
import uuid

class SRMUser(HttpUser):
    # Пауза між діями кожного віртуального користувача (від 1 до 3 секунд)
    wait_time = between(1, 3)

    def on_start(self):
        """Ця функція виконується один раз для кожного користувача при старті. 
        Ми реєструємо його і отримуємо токен, щоб імітувати реальне навантаження на БД."""
        self.email = f"load_{uuid.uuid4().hex[:8]}@example.com"
        self.password = "testpass"
        
        # 1. Реєстрація (навантажує INSERT в БД)
        self.client.post("/auth/register/supplier", json={
            "email": self.email,
            "password": self.password
        })
        
        # 2. Логін (навантажує SELECT в БД та генерацію JWT)
        response = self.client.post("/auth/login", data={
            "username": self.email,
            "password": self.password
        })
        
        if response.status_code == 200:
            self.token = response.json().get("access_token")
            self.headers = {"Authorization": f"Bearer {self.token}"}
        else:
            self.headers = {}

    @task(3)
    def view_orders(self):
        """Імітація того, як користувач часто оновлює список замовлень (навантажує SELECT)"""
        if self.headers:
            self.client.get("/orders/", headers=self.headers)

    @task(1)
    def view_profile(self):
        """Імітація перегляду свого профілю (навантажує JOIN запити в БД)"""
        if self.headers:
            self.client.get("/users/me", headers=self.headers)