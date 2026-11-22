from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_db
from app.models import User, Session
from app.auth.jwt import decode_access

security = HTTPBearer(auto_error=False)

async def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    # Access token может приходить в заголовке Authorization
    token = creds.credentials if creds else request.cookies.get("access_token")
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_access(token)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    user = await db.get(User, payload["sub"])
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    request.state.user_id = user.id
    return user

async def require_admin(current: User = Depends(get_current_user)) -> User:
    if current.role not in ("admin", "superadmin"):
        raise HTTPException(status.HTTP_404_NOT_FOUND)  # скрываем существование
    return current

async def require_superadmin(current: User = Depends(get_current_user)) -> User:
    if current.role != "superadmin":
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return current

async def forbid_impersonation(request: Request, db: AsyncSession = Depends(get_db)):
    """Блокирует опасные операции в режиме имперсонации."""
    # Проверяем, не является ли текущая сессия имперсонацией
    # В реальном коде здесь нужно достать session_id из токена или заголовка
    # Для упрощения: проверяем наличие заголовка X-Impersonation
    if request.headers.get("X-Impersonation") == "true":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Action forbidden in impersonation mode")
