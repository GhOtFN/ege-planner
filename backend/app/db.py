from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from app.config import settings
from uuid import uuid4

# ВАЖНО: для Supabase (PgBouncer) нужно отключить кэширование подготовленных запросов.
# 1. Добавляем prepared_statement_cache_size=0 в URL.
# 2. В connect_args передаем statement_cache_size=0.
# 3. Используем prepared_statement_name_func для генерации уникальных имён (обход бага SQLAlchemy).

db_url = settings.database_url
if "prepared_statement_cache_size" not in db_url:
    separator = "&" if "?" in db_url else "?"
    db_url += f"{separator}prepared_statement_cache_size=0"

engine = create_async_engine(
    db_url,
    poolclass=NullPool,
    echo=False,
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
    },
)

async_session = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with async_session() as session:
        yield session
