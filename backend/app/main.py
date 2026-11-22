import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db import engine, async_session
from app.models import Base, User
from app.auth.router import router as auth_router
from app.tasks.router import router as tasks_router
from app.sessions.router import router as sessions_router
from app.activity.router import router as activity_router
from app.admin.router import router as admin_router
from app.scheduler import scheduler
from app.bot.bot import bot, dp
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Создание таблиц (для продакшена используйте Alembic)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Бутстрап суперадмина
    if settings.bootstrap_superadmin_email:
        async with async_session() as db:
            from sqlalchemy import select
            res = await db.execute(select(User).where(User.email == settings.bootstrap_superadmin_email))
            if not res.scalar_one_or_none():
                db.add(User(
                    email=settings.bootstrap_superadmin_email,
                    password_hash=pwd_context.hash(settings.bootstrap_superadmin_password),
                    role="superadmin",
                ))
                await db.commit()

    scheduler.start()
    if bot:
        asyncio.create_task(dp.start_polling(bot))
    yield
    scheduler.shutdown()
    if bot:
        await bot.session.close()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def real_ip(request: Request, call_next):
    request.state.client_ip = request.client.host if request.client else None
    return await call_next(request)

app.include_router(auth_router)
app.include_router(tasks_router)
app.include_router(sessions_router)
app.include_router(activity_router)
app.include_router(admin_router)

@app.get("/health")
async def health():
    return {"ok": True}
