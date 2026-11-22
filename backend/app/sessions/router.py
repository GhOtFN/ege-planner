from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_db
from app.models import Session, User
from app.auth.deps import get_current_user, forbid_impersonation
from uuid import UUID

router = APIRouter(prefix="/sessions", tags=["sessions"])

@router.get("/")
async def list_sessions(current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Session).where(
            Session.user_id == current.id,
            Session.revoked_at.is_(None),
            Session.is_impersonation.is_(False),
        )
    )
    sessions = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "device_name": s.device_name,
            "ip_address": s.ip_address,
            "created_at": s.created_at.isoformat(),
            "last_active_at": s.last_active_at.isoformat(),
        }
        for s in sessions
    ]

@router.delete("/{session_id}")
async def revoke_session(
    session_id: UUID,
    current: User = Depends(get_current_user),
    _=Depends(forbid_impersonation),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(Session, session_id)
    if not session or session.user_id != current.id:
        raise HTTPException(404)
    from datetime import datetime, timezone
    session.revoked_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}
