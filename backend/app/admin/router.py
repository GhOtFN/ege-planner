from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.context import CryptContext
from uuid import UUID
from datetime import datetime, timezone, timedelta
from app.db import get_db
from app.models import User, Session, ActivityEvent
from app.auth.deps import require_admin, require_superadmin
from app.auth.jwt import create_access_token
from app.schemas import AdminActionRequest
from app.activity.utils import log_action

router = APIRouter(prefix="/admin", tags=["admin"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def verify_password(password: str, user: User):
    if not pwd_context.verify(password, user.password_hash):
        raise HTTPException(403, "Неверный пароль")

@router.get("/users")
async def list_users(current: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()
    return [{"id": str(u.id), "email": u.email, "role": u.role, "telegram_id": u.telegram_id} for u in users]

@router.get("/logs")
async def get_logs(current: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    # Достаем последние 200 событий с именами пользователей
    result = await db.execute(
        select(ActivityEvent)
        .order_by(ActivityEvent.created_at.desc())
        .limit(200)
    )
    logs = result.scalars().all()
    
    # Получаем всех юзеров для маппинга ID -> Email
    users_res = await db.execute(select(User))
    users_map = {str(u.id): u.email for u in users_res.scalars().all()}
    
    return [
        {
            "id": str(log.id),
            "action": log.action,
            "actor_email": users_map.get(str(log.actor_id), "Unknown"),
            "effective_email": users_map.get(str(log.effective_user_id), "Unknown"),
            "is_impersonation": log.is_impersonation,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "created_at": log.created_at.isoformat(),
            "entity_type": log.entity_type,
            "before_state": log.before_state,
            "after_state": log.after_state,
        }
        for log in logs
    ]

@router.post("/impersonate/{user_id}")
async def impersonate(user_id: UUID, data: AdminActionRequest, request: Request, current: User = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    await verify_password(data.password, current)
    target = await db.get(User, user_id)
    if not target: raise HTTPException(404, "Пользователь не найден")
    if current.role == "admin" and target.role != "user": raise HTTPException(403, "Админ может входить только под обычными пользователями")
    if current.id == target.id: raise HTTPException(400, "Нельзя войти под самим собой")

    session = Session(
        user_id=target.id, impersonator_id=current.id, is_impersonation=True,
        refresh_token_hash="impersonation", expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    )
    db.add(session)
    await log_action(request, db, "IMPERSONATION_START", entity_id=str(target.id))
    await db.commit()
    
    token = create_access_token(str(target.id), impersonator_id=str(current.id))
    return {"access_token": token, "target_user": {"id": str(target.id), "email": target.email}}

@router.post("/grant-admin/{user_id}")
async def grant_admin(user_id: UUID, data: AdminActionRequest, request: Request, current: User = Depends(require_superadmin), db: AsyncSession = Depends(get_db)):
    await verify_password(data.password, current)
    target = await db.get(User, user_id)
    if not target: raise HTTPException(404)
    if target.role == "superadmin": raise HTTPException(400, "Нельзя менять роль суперадмина")
    
    target.role = "admin"
    await log_action(request, db, "ADMIN_GRANT", entity_id=str(target.id))
    await db.commit()
    return {"ok": True}

@router.post("/revoke-admin/{user_id}")
async def revoke_admin(user_id: UUID, data: AdminActionRequest, request: Request, current: User = Depends(require_superadmin), db: AsyncSession = Depends(get_db)):
    await verify_password(data.password, current)
    target = await db.get(User, user_id)
    if not target: raise HTTPException(404)
    if target.role == "superadmin": raise HTTPException(400, "Нельзя менять роль суперадмина")
    
    target.role = "user"
    await log_action(request, db, "ADMIN_REVOKE", entity_id=str(target.id))
    await db.commit()
    return {"ok": True}
