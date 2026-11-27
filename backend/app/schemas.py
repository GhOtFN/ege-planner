from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime, date

# --- Авторизация и пользователи ---
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
    timezone: str | None = None
    exam_dates: dict | None = None

class PasswordChange(BaseModel):
    old_password: str
    new_password: str

class TelegramLinkRequest(BaseModel):
    code: str

# --- Админка ---
class AdminActionRequest(BaseModel):
    password: str

class ImpersonateResponse(BaseModel):
    access_token: str
    target_user: dict

# --- Предметы ---
class SubjectCreate(BaseModel):
    name: str
    color: str

# --- Задачи ---
class TaskCreate(BaseModel):
    title: str
    start_at: datetime
    duration_min: int = 60
    subject_id: UUID | None = None
    notes: str | None = None
    recurrence_rule: str | None = None
    is_deadline: bool = False
    reminder_offsets: list[int] = []
    
class TaskUpdate(BaseModel):
    title: str | None = None
    start_at: datetime | None = None
    duration_min: int | None = None
    subject_id: UUID | None = None
    status: str | None = None
    notes: str | None = None

# --- Пробники (Mock Exams) ---
class MockExamCreate(BaseModel):
    subject_id: UUID
    date: date
    score: int
    max_score: int = 100

# --- Push-уведомления ---
class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str

class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys

# В конец
class ReminderOffsets(BaseModel):
    offsets: list[int] = []

class TaskCreateV2(BaseModel):
    title: str
    start_at: datetime
    duration_min: int = 60
    subject_id: UUID | None = None
    notes: str | None = None
    is_deadline: bool = False
    reminder_offsets: list[int] = []  # Список интервалов в минутах [1440, 120, 30]

class TemplateSlot(BaseModel):
    day_of_week: int  # 0=Пн..6=Вс
    hour: int
    subject_id: UUID
    duration_min: int

class ApplyTemplateRequest(BaseModel):
    slots: list[TemplateSlot]
    weeks: int = 4

class AdminPushReq(BaseModel):
    title: str
    body: str

class AdminTelegramReq(BaseModel):
    text: str
