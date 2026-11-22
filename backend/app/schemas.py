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

class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    start_at: datetime
    duration_min: int = 60
    priority: int = 2
    subject_id: UUID | None = None
    recurrence_rule: str | None = None
