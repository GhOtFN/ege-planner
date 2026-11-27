from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.context import CryptContext
from datetime import datetime, timezone, timedelta
from app.db import get_db
from app.models import User, Session, TelegramLinkCode, PushSubscription
from app.schemas import UserRegister, UserLogin, TokenResponse, RefreshRequest, UserUpdate, TelegramLinkRequest, PasswordChange, PushSubscriptionCreate
from app.auth.jwt import create_access_token, create_refresh_token, decode_refresh
from app.auth.deps import get_current_user
from app.bot.bot import bot, send_notification
from app.activity.utils import log_action
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
import hashlib
import secrets

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_refresh(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()

@router.post("/register", response_model=TokenResponse)
async def register(data: UserRegister, request: Request, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Email already registered")

    user = User(email=data.email, password_hash=pwd_context.hash(data.password))
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
    
    request.state.user_id = user.id
    await log_action(request, db, "USER_REGISTER")
    await db.commit()

    return TokenResponse(access_token=access, refresh_token=refresh, user={"id": str(user.id), "email": user.email, "role": user.role})

@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
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
    
    request.state.user_id = user.id
    await log_action(request, db, "USER_LOGIN")
    await db.commit()

    return TokenResponse(access_token=access, refresh_token=refresh, user={"id": str(user.id), "email": user.email, "role": user.role})

@router.post("/refresh")
async def refresh_token(data: RefreshRequest, request: Request, db: AsyncSession = Depends(get_db)):
    payload = decode_refresh(data.refresh_token)
    if not payload:
        raise HTTPException(401, "Invalid refresh token")

    token_hash = hash_refresh(data.refresh_token)
    result = await db.execute(select(Session).where(Session.refresh_token_hash == token_hash, Session.revoked_at.is_(None)))
    session = result.scalar_one_or_none()

    if not session or session.expires_at < datetime.now(timezone.utc):
        if session:
            await db.execute(delete(Session).where(Session.user_id == session.user_id))
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
        "share_token": current.share_token,
        "timezone": current.timezone,
        "streak_days": current.streak_days,   # ВАЖНО
        "exam_dates": current.exam_dates or {},  # ВАЖНО
    }

@router.patch("/me")
async def update_me(data: UserUpdate, request: Request, current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if data.notification_offset is not None:
        current.notification_offset = data.notification_offset
    if data.timezone is not None:
        current.timezone = data.timezone
    await log_action(request, db, "SETTINGS_UPDATE")
    await db.commit()
    return {"ok": True}

@router.post("/change-password")
async def change_password(data: PasswordChange, request: Request, current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not pwd_context.verify(data.old_password, current.password_hash):
        raise HTTPException(400, "Неверный старый пароль")
    if len(data.new_password) < 6:
        raise HTTPException(400, "Новый пароль слишком короткий")
    
    current.password_hash = pwd_context.hash(data.new_password)
    await log_action(request, db, "PASSWORD_CHANGE")
    await db.commit()
    return {"ok": True}

@router.post("/unlink-telegram")
async def unlink_telegram(request: Request, current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    old_id = current.telegram_id
    current.telegram_id = None
    await log_action(request, db, "TELEGRAM_UNLINK", before_state={"telegram_id": old_id})
    await db.commit()
    return {"ok": True}

@router.post("/link-telegram")
async def link_telegram(data: TelegramLinkRequest, request: Request, current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TelegramLinkCode).where(TelegramLinkCode.code == data.code))
    link_code = result.scalar_one_or_none()
    
    if not link_code:
        raise HTTPException(400, "Неверный или устаревший код")
    
    user_res = await db.execute(select(User).where(User.telegram_id == link_code.telegram_id))
    if user_res.scalar_one_or_none():
        raise HTTPException(400, "Этот Telegram уже привязан к другому аккаунту")

    current.telegram_id = link_code.telegram_id
    await db.delete(link_code)
    await log_action(request, db, "TELEGRAM_LINK")
    await db.commit()
    return {"ok": True, "telegram_id": current.telegram_id}

@router.post("/test-telegram")
async def test_telegram(current: User = Depends(get_current_user)):
    if not current.telegram_id:
        raise HTTPException(400, "Telegram не привязан")
    try:
        if bot:
            try:
                await bot.get_chat(chat_id=current.telegram_id)
            except (TelegramBadRequest, TelegramForbiddenError) as e:
                if "chat not found" in str(e).lower():
                    raise HTTPException(400, "Бот не может написать вам первым. Найдите бота в Telegram и нажмите 'Запустить' (/start).")
                else:
                    raise HTTPException(500, f"Ошибка проверки чата: {str(e)}")
            
            await send_notification(current.telegram_id, "🔔 Это тестовое уведомление от ЕГЭ-Планера! Всё работает отлично.")
        else:
            raise HTTPException(500, "Бот не инициализирован.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Ошибка отправки: {str(e)}")
    return {"ok": True}

@router.post("/share-token")
async def generate_share_token(current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not current.share_token:
        current.share_token = secrets.token_urlsafe(16)
        await db.commit()
    return {"token": current.share_token}

@router.post("/push-subscribe")
async def subscribe_push(data: PushSubscriptionCreate, current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(PushSubscription).where(PushSubscription.endpoint == data.endpoint))
    sub = res.scalar_one_or_none()
    if not sub:
        db.add(PushSubscription(user_id=current.id, endpoint=data.endpoint, p256dh=data.keys.p256dh, auth=data.keys.auth))
    else:
        sub.user_id = current.id
        sub.p256dh = data.keys.p256dh
        sub.auth = data.keys.auth
    await db.commit()
    return {"ok": True}

@router.post("/test-push")
async def test_push(current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    from app.config import settings
    if not settings.vapid_private_key:
        raise HTTPException(500, "VAPID-ключи не настроены на сервере.")
    
    try:
        from pywebpush import webpush, WebPushException
        import json
        
        # Получаем все устройства, привязанные к пользователю
        res = await db.execute(select(PushSubscription).where(PushSubscription.user_id == current.id))
        subs = res.scalars().all()
        
        if not subs:
            raise HTTPException(400, "Нет активных подписок. Разрешите уведомления в настройках.")
        
        sent = 0
        errors = []
        
        for sub in subs:
            try:
                webpush(
                    subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                    data=json.dumps({"title": "ЕГЭ-Планер", "body": "Тестовое уведомление! Работает ✅"}),
                    vapid_private_key=settings.vapid_private_key,
                    vapid_claims={"sub": settings.vapid_subject}
                )
                sent += 1
            except WebPushException as e:
                # Если Apple/Google говорят, что токен устарел или невалиден (410, 404, 401)
                if e.response and e.response.status_code in [401, 403, 404, 410]:
                    await db.delete(sub) # Автоматически удаляем мертвое устройство
                    errors.append("Одно устройство отключено (токен устарел)")
                else:
                    errors.append(str(e))
            except Exception as e:
                errors.append(str(e))
        
        await db.commit() # Сохраняем удаление мертвых токенов
        
        if sent == 0:
            raise HTTPException(400, f"Не удалось отправить. Причины: {'; '.join(errors)}")
            
        return {"ok": True, "sent": sent}
    except ImportError:
        raise HTTPException(500, "pywebpush не установлен")
