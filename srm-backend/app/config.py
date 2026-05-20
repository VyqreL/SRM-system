import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):

    database_url: str
    secret_key: str
    # Додаємо extra='ignore', щоб Pydantic не сварився на змінні для Docker
    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        env_file_encoding='utf-8', 
        extra='ignore'
    )

settings = Settings() # type: ignore