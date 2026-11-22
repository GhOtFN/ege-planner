from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from app.config import settings

ACCESS_EXPIRE_MIN = 15
REFRESH_EXPIRE_DAYS = 30

def create_access_token(user_id: str, impersonator_id: str | None = None) -> str:
    payload = {
        "sub": user_id,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_EXPIRE_MIN),
    }
    if impersonator_id:
        payload["impersonator_id"] = impersonator_id
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

# create_refresh_token, decode_access, decode_refresh остаются без изменений
def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_EXPIRE_DAYS),
    }
    return jwt.encode(payload, settings.refresh_secret, algorithm="HS256")

def decode_access(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None

def decode_refresh(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.refresh_secret, algorithms=["HS256"])
        if payload.get("type") != "refresh":
            return None
        return payload
    except JWTError:
        return None
