from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from app.config import settings

# ВАЖНО: для Supabase используйте Transaction pooler (порт 6543) и NullPool.
# connect_args={"statement_cache_size": 0} ОБЯЗАТЕЛЕН для работы с PgBouncer,
# иначе вылезет ошибка DuplicatePreparedStatementError.
engine = create_async_engine(
    settings.database_url,
    poolclass=NullPool,
    echo=False,
    connect_args={"statement_cache_size": 0}, 
)

async_session = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with async_session() as session:
        yield session
