from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    jwt_secret: str
    refresh_secret: str
    telegram_bot_token: str = ""
    bootstrap_superadmin_email: str = ""
    bootstrap_superadmin_password: str = ""
    frontend_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"

settings = Settings()
