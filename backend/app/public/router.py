from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_db
from app.models import User
from app.tasks.router import _build_stats

router = APIRouter(prefix="/public", tags=["public"])

@router.get("/stats/{token}")
async def public_stats(token: str, period: str = "month", db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).where(User.share_token == token))
    user = res.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Статистика не найдена")
    
    stats = await _build_stats(user.id, period, db)
    return {"email": user.email, "stats": stats}
