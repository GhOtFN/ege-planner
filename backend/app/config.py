from pydantic_settings import BaseSettings
import time

APP_START_TIME = time.time()

class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    refresh_secret: str
    telegram_bot_token: str = ""
    bootstrap_superadmin_email: str = ""
    bootstrap_superadmin_password: str = ""
    frontend_url: str = "http://localhost:3000"
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:admin@example.com"

    class Config:
        env_file = ".env"

settings = Settings()
