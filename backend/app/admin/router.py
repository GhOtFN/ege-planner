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

@router.post("/impersonate/{user_id}")
async def impersonate(
    user_id: UUID,
    data: AdminActionRequest,
    request: Request,
    current: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await verify_password(data.password, current)
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404, "Пользователь не найден")
    
    if current.role == "admin" and target.role != "user":
        raise HTTPException(403, "Админ может входить только под обычными пользователями")
    if current.id == target.id:
        raise HTTPException(400, "Нельзя войти под самим собой")

    session = Session(
        user_id=target.id,
        impersonator_id=current.id,
        is_impersonation=True,
        refresh_token_hash="impersonation", 
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    )
    db.add(session)
    
    db.add(ActivityEvent(
        actor_id=current.id,
        effective_user_id=target.id,
        action="IMPERSONATION_START",
        is_impersonation=True,
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    
    token = create_access_token(str(target.id), impersonator_id=str(current.id))
    return {"access_token": token, "target_user": {"id": str(target.id), "email": target.email}}

@router.post("/grant-admin/{user_id}")
async def grant_admin(
    user_id: UUID,
    data: AdminActionRequest,
    request: Request,
    current: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    await verify_password(data.password, current)
    target = await db.get(User, user_id)
    if not target: raise HTTPException(404)
    if target.role == "superadmin": raise HTTPException(400, "Нельзя менять роль суперадмина")
    
    target.role = "admin"
    db.add(ActivityEvent(actor_id=current.id, effective_user_id=target.id, action="ADMIN_GRANT"))
    await db.commit()
    return {"ok": True}

@router.post("/revoke-admin/{user_id}")
async def revoke_admin(
    user_id: UUID,
    data: AdminActionRequest,
    request: Request,
    current: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    await verify_password(data.password, current)
    target = await db.get(User, user_id)
    if not target: raise HTTPException(404)
    if target.role == "superadmin": raise HTTPException(400, "Нельзя менять роль суперадмина")
    
    target.role = "user"
    db.add(ActivityEvent(actor_id=current.id, effective_user_id=target.id, action="ADMIN_REVOKE"))
    await db.commit()
    return {"ok": True}
