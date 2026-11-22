from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime

class UserRegister(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: dict

class RefreshRequest(BaseModel):
    refresh_token: str

class UserUpdate(BaseModel):
    notification_offset: int | None = None
    telegram_id: int | None = None

class SubjectCreate(BaseModel):
    name: str
    color: str

class TaskCreate(BaseModel):
    title: str
    start_at: datetime
    duration_min: int = 60
    subject_id: UUID | None = None

class TaskUpdate(BaseModel):
    title: str | None = None
    start_at: datetime | None = None
    duration_min: int | None = None
    subject_id: UUID | None = None
    status: str | None = None
