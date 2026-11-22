from fastapi import APIRouter, Depends, HTTPException, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta
from uuid import UUID
from app.db import get_db
from app.models import User, Session, ActivityEvent
from app.auth.deps import require_admin, require_superadmin, forbid_impersonation
from app.auth.jwt import create_access_token
from passlib.context import CryptContext

router = APIRouter(prefix="/admin", tags=["admin"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

async def verify_reauth(reauth_token: str, user: User):
    """Упрощённая проверка: в реальности здесь проверка временного токена переподтверждения."""
    if not reauth_token:
        raise HTTPException(403, "Re-authentication required")

@router.post("/impersonate/{user_id}")
async def impersonate(
    user_id: UUID,
    request: Request,
    x_reauth_token: str = Header(...),
    current: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    await verify_reauth(x_reauth_token, current)
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404)
    # Суперадмин может имперсонировать любого
    session = Session(
        user_id=target.id,
        impersonator_id=current.id,
        is_impersonation=True,
        refresh_token_hash="impersonation",  # не используется для refresh
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
    )
    db.add(session)
    # Аудит ДО выдачи токена
    db.add(ActivityEvent(
        actor_id=current.id,
        effective_user_id=target.id,
        action="IMPERSONATION_START",
        is_impersonation=True,
        ip_address=request.client.host if request.client else None,
    ))
    await db.commit()
    token = create_access_token(str(target.id))
    return {"impersonation_token": token, "target_user": {"id": str(target.id), "email": target.email}}

@router.post("/grant-admin/{user_id}")
async def grant_admin(
    user_id: UUID,
    x_reauth_token: str = Header(...),
    current: User = Depends(require_superadmin),
    db: AsyncSession = Depends(get_db),
):
    await verify_reauth(x_reauth_token, current)
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(404)
    target.role = "admin"
    db.add(ActivityEvent(
        actor_id=current.id,
        effective_user_id=target.id,
        action="ADMIN_GRANT",
    ))
    await db.commit()
    return {"ok": True}
