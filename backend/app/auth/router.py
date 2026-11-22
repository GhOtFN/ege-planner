from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.context import CryptContext
from datetime import datetime, timezone, timedelta
from app.db import get_db
from app.models import User, Session
from app.schemas import UserRegister, UserLogin, TokenResponse, RefreshRequest, UserUpdate
from app.auth.jwt import create_access_token, create_refresh_token, decode_refresh
from app.auth.deps import get_current_user
from app.bot.bot import bot, send_notification
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
import hashlib

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_refresh(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/register", response_model=TokenResponse)
async def register(
    data: UserRegister, request: Request, db: AsyncSession = Depends(get_db)
):
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Email already registered")

    user = User(
        email=data.email,
        password_hash=pwd_context.hash(data.password),
    )
    db.add(user)
    await db.flush()

    access = create_access_token(str(user.id))
    refresh = create_refresh_token(str(user.id))

    session = Session(
        user_id=user.id,
        refresh_token_hash=hash_refresh(refresh),
        device_name=request.headers.get("User-Agent", "")[:100],
        user_agent=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(session)
    await db.commit()

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user={"id": str(user.id), "email": user.email, "role": user.role},
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not pwd_context.verify(data.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")

    access = create_access_token(str(user.id))
    refresh = create_refresh_token(str(user.id))

    session = Session(
        user_id=user.id,
        refresh_token_hash=hash_refresh(refresh),
        device_name=request.headers.get("User-Agent", "")[:100],
        user_agent=request.headers.get("User-Agent"),
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(session)
    await db.commit()

    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user={"id": str(user.id), "email": user.email, "role": user.role},
    )


@router.post("/refresh")
async def refresh_token(
    data: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)
):
    payload = decode_refresh(data.refresh_token)
    if not payload:
        raise HTTPException(401, "Invalid refresh token")

    token_hash = hash_refresh(data.refresh_token)
    result = await db.execute(
        select(Session).where(
            Session.refresh_token_hash == token_hash,
            Session.revoked_at.is_(None),
        )
    )
    session = result.scalar_one_or_none()

    if not session or session.expires_at < datetime.now(timezone.utc):
        if session:
            await db.execute(
                delete(Session).where(Session.user_id == session.user_id)
            )
            await db.commit()
        raise HTTPException(401, "Invalid or reused refresh token")

    session.revoked_at = datetime.now(timezone.utc)
    new_refresh = create_refresh_token(str(session.user_id))
    new_session = Session(
        user_id=session.user_id,
        refresh_token_hash=hash_refresh(new_refresh),
        device_name=session.device_name,
        user_agent=session.user_agent,
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(new_session)
    await db.commit()

    access = create_access_token(str(session.user_id))
    return {"access_token": access, "refresh_token": new_refresh}


@router.get("/me")
async def me(current: User = Depends(get_current_user)):
    return {
        "id": str(current.id),
        "email": current.email,
        "role": current.role,
        "telegram_id": current.telegram_id,
        "notification_offset": current.notification_offset,
        "timezone": current.timezone,
    }


@router.patch("/me")
async def update_me(data: UserUpdate, current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if data.notification_offset is not None:
        current.notification_offset = data.notification_offset
    if data.telegram_id is not None:
        current.telegram_id = data.telegram_id
    
    await db.commit()
    return {"ok": True}


@router.post("/test-telegram")
async def test_telegram(current: User = Depends(get_current_user)):
    if not current.telegram_id:
        raise HTTPException(400, "Telegram ID не привязан в настройках")
    
    try:
        if bot:
            # Проверяем, может ли бот писать этому пользователю (не заблокировал ли он его и начинал ли диалог)
            try:
                await bot.get_chat(chat_id=current.telegram_id)
            except (TelegramBadRequest, TelegramForbiddenError) as e:
                if "chat not found" in str(e).lower():
                    raise HTTPException(400, "Бот не может написать вам первым. Найдите бота в Telegram и нажмите 'Запустить' (/start), затем повторите тест.")
                elif "blocked by the user" in str(e).lower():
                    raise HTTPException(400, "Вы заблокировали бота. Разблокируйте его в Telegram.")
                else:
                    raise HTTPException(500, f"Ошибка проверки чата: {str(e)}")
            
            # Если проверка прошла, отправляем сообщение
            await send_notification(current.telegram_id, "🔔 Это тестовое уведомление от ЕГЭ-Планера! Всё работает отлично.")
        else:
            raise HTTPException(500, "Бот не инициализирован. Проверьте TELEGRAM_BOT_TOKEN в переменных окружения Render.")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Ошибка отправки: {str(e)}")
    
    return {"ok": True}
