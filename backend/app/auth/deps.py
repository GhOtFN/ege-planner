from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_db
from app.models import User
from app.auth.jwt import decode_access
from uuid import UUID

security = HTTPBearer(auto_error=False)

async def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = creds.credentials if creds else request.cookies.get("access_token")
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_access(token)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    
    user = await db.get(User, payload["sub"])
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    
    # Сохраняем контекст в request.state
    request.state.user_id = user.id
    request.state.impersonator_id = payload.get("impersonator_id")
    
    # Если это имперсонация, возвращаем целевого пользователя
    return user

async def require_admin(current: User = Depends(get_current_user)) -> User:
    if current.role not in ("admin", "superadmin"):
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return current

async def require_superadmin(current: User = Depends(get_current_user)) -> User:
    if current.role != "superadmin":
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return current

async def forbid_impersonation(request: Request):
    """Блокирует опасные операции в режиме имперсонации."""
    if getattr(request.state, "impersonator_id", None):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Action forbidden in impersonation mode")
