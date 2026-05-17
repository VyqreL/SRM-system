# Використовуємо офіційний легкий образ Python
FROM python:3.11-slim

# Робоча директорія всередині контейнера
WORKDIR /app

# Забороняємо Python створювати .pyc файли та буферизувати вивід (корисно для логів)
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Копіюємо файл залежностей та встановлюємо їх
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копіюємо весь наш код у контейнер
COPY . .

# Відкриваємо порт для FastAPI
EXPOSE 8000

# Команда для запуску сервера
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]