from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from datetime import datetime, timezone, timedelta, date
from zoneinfo import ZoneInfo
from app.db import get_db
from app.models import Task, User, Reminder, Subject, MockExam
from app.schemas import TaskCreate, TaskUpdate, MockExamCreate, ApplyTemplateRequest
from app.auth.deps import get_current_user, forbid_impersonation
from app.activity.utils import log_action

router = APIRouter(prefix="/tasks", tags=["tasks"])

# ==========================================
# 1. УПРАВЛЕНИЕ ЗАДАЧАМИ
# ==========================================

@router.post("/")
async def create_task(
    data: TaskCreate, 
    request: Request, 
    current: User = Depends(get_current_user), 
    _=Depends(forbid_impersonation), 
    db: AsyncSession = Depends(get_db)
):
    task = Task(
        user_id=current.id, 
        title=data.title, 
        start_at=data.start_at, 
        duration_min=data.duration_min, 
        subject_id=data.subject_id,
        notes=data.notes,
        recurrence_rule=data.recurrence_rule if hasattr(data, 'recurrence_rule') else None,
        is_deadline=data.is_deadline
    )
    db.add(task)
    await db.flush()

    # Создаем несколько напоминаний (если это не дедлайн)
    if not data.is_deadline:
        offsets = data.reminder_offsets if data.reminder_offsets else [current.notification_offset]
        for off in offsets:
            reminder = Reminder(task_id=task.id, offset_min=off, channel="telegram")
            db.add(reminder)
        
    await log_action(request, db, "TASK_CREATE", entity_type="task", entity_id=str(task.id))
    await db.commit()
    return {"id": str(task.id)}

@router.get("/")
async def list_tasks(current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task).where(Task.user_id == current.id).order_by(Task.start_at))
    tasks = result.scalars().all()
    return [{
        "id": str(t.id), 
        "title": t.title, 
        "start_at": t.start_at.isoformat(), 
        "duration_min": t.duration_min, 
        "status": t.status, 
        "subject_id": str(t.subject_id) if t.subject_id else None,
        "notes": t.notes,
        "is_deadline": t.is_deadline,
        "recurrence_rule": t.recurrence_rule
    } for t in tasks]

@router.put("/{task_id}")
async def update_task(
    task_id: UUID, 
    data: TaskUpdate, 
    request: Request, 
    current: User = Depends(get_current_user), 
    _=Depends(forbid_impersonation), 
    db: AsyncSession = Depends(get_db)
):
    task = await db.get(Task, task_id)
    if not task or task.user_id != current.id:
        raise HTTPException(404, "Task not found")
    
    old_status = task.status

    if data.title is not None: task.title = data.title
    if data.start_at is not None: task.start_at = data.start_at
    if data.duration_min is not None: task.duration_min = data.duration_min
    if data.subject_id is not None: task.subject_id = data.subject_id
    if data.status is not None: task.status = data.status
    if data.notes is not None: task.notes = data.notes
    
    # === ЛОГИКА СТРИКА (Огонька) ===
    if data.status == "done" and old_status != "done":
        today = date.today()
        if current.last_active_date == today:
            pass # Уже занимались сегодня
        elif current.last_active_date == today - timedelta(days=1):
            current.streak_days += 1 # Продолжаем серию
            current.last_active_date = today
        else:
            current.streak_days = 1 # Начинаем новую
            current.last_active_date = today

    await log_action(request, db, "TASK_UPDATE", entity_type="task", entity_id=str(task.id))
    await db.commit()
    return {"ok": True, "streak": current.streak_days}

@router.delete("/{task_id}")
async def delete_task(
    task_id: UUID, 
    request: Request, 
    current: User = Depends(get_current_user), 
    _=Depends(forbid_impersonation), 
    db: AsyncSession = Depends(get_db)
):
    task = await db.get(Task, task_id)
    if not task or task.user_id != current.id:
        raise HTTPException(404, "Task not found")
    
    await log_action(request, db, "TASK_DELETE", entity_type="task", entity_id=str(task.id))
    await db.delete(task)
    await db.commit()
    return {"ok": True}

# ==========================================
# 2. ШАБЛОНЫ РАСПИСАНИЯ (Календарь)
# ==========================================

@router.post("/apply-template")
async def apply_template(
    data: ApplyTemplateRequest, 
    current: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    try: 
        tz = ZoneInfo(current.timezone or "Europe/Moscow")
    except: 
        tz = ZoneInfo("Europe/Moscow")
    
    now_local = datetime.now(tz)
    # Находим понедельник текущей недели
    monday = now_local - timedelta(days=now_local.weekday())
    monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)
    
    created = 0
    for week in range(data.weeks):
        for slot in data.slots:
            # Вычисляем дату и время для слота
            target_local = (monday + timedelta(days=week*7 + slot.day_of_week)).replace(hour=slot.hour)
            target_utc = target_local.astimezone(timezone.utc)
            
            # Не создаем в прошлом
            if target_utc < datetime.now(timezone.utc): 
                continue
            
            task = Task(
                user_id=current.id, 
                subject_id=slot.subject_id,
                title="Занятие", 
                start_at=target_utc, 
                duration_min=slot.duration_min
            )
            db.add(task)
            await db.flush()
            
            # Базовое напоминание
            db.add(Reminder(task_id=task.id, offset_min=current.notification_offset))
            created += 1
    
    await db.commit()
    return {"ok": True, "created": created}

# ==========================================
# 3. ПРОБНЫЕ ЭКЗАМЕНЫ (Mock Exams)
# ==========================================

@router.post("/mock-exams")
async def create_mock_exam(
    data: MockExamCreate, 
    current: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    exam = MockExam(
        user_id=current.id, 
        subject_id=data.subject_id, 
        date=data.date, 
        score=data.score, 
        max_score=data.max_score
    )
    db.add(exam)
    await db.commit()
    return {"ok": True, "id": str(exam.id)}

@router.get("/mock-exams")
async def get_mock_exams(
    current: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(MockExam, Subject.name)
        .join(Subject, MockExam.subject_id == Subject.id)
        .where(MockExam.user_id == current.id)
        .order_by(MockExam.date)
    )
    return [
        {
            "id": str(e.id), 
            "date": e.date.isoformat(), 
            "score": e.score, 
            "max": e.max_score, 
            "subject": s_name
        } for e, s_name in res.all()
    ]

# ==========================================
# 4. СТАТИСТИКА
# ==========================================

async def _build_stats(user_id: UUID, period: str, db: AsyncSession):
    query = select(Subject.name, Subject.color, func.sum(Task.duration_min).label("total_minutes"))
    
    if period == "day":
        query = query.where(Task.start_at >= func.now() - func.make_interval(0, 0, 0, 1))
    elif period == "week":
        query = query.where(Task.start_at >= func.now() - func.make_interval(0, 0, 0, 7))
    elif period == "month":
        query = query.where(Task.start_at >= func.now() - func.make_interval(0, 1))

    query = query.join(Task, Task.subject_id == Subject.id).where(Task.user_id == user_id, Task.status == "done").group_by(Subject.id)
    
    result = await db.execute(query)
    stats = result.all()
    total_user_minutes = sum([s.total_minutes for s in stats]) if stats else 0
    
    # Анонимное сравнение
    all_users_query = select(func.sum(Task.duration_min)).where(
        Task.status == "done",
        Task.start_at >= func.now() - func.make_interval(0, 0, 0, 7 if period == 'week' else 30)
    )
    total_all_users = await db.execute(all_users_query)
    global_minutes = total_all_users.scalar() or 1
    
    if total_user_minutes == 0:
        percentile = 0
    else:
        percentile = min(99, max(1, round((total_user_minutes / global_minutes) * 100)))

    return {
        "total_hours": round(total_user_minutes / 60, 1),
        "percentile": percentile,
        "subjects": [
            {"name": s.name, "color": s.color, "hours": round(s.total_minutes / 60, 1)} 
            for s in stats
        ]
    }

@router.get("/stats")
async def get_stats(
    period: str = "week", 
    current: User = Depends(get_current_user), 
    db: AsyncSession = Depends(get_db)
):
    return await _build_stats(current.id, period, db)
