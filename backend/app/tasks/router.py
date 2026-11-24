from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from app.db import get_db
from app.models import Task, User, Reminder, Subject
from app.schemas import TaskCreate, TaskUpdate
from app.auth.deps import get_current_user, forbid_impersonation
from app.activity.utils import log_action

router = APIRouter(prefix="/tasks", tags=["tasks"])

@router.post("/")
async def create_task(data: TaskCreate, request: Request, current: User = Depends(get_current_user), _=Depends(forbid_impersonation), db: AsyncSession = Depends(get_db)):
    task = Task(user_id=current.id, title=data.title, start_at=data.start_at, duration_min=data.duration_min, subject_id=data.subject_id)
    db.add(task); await db.flush()
    db.add(Reminder(task_id=task.id, offset_min=current.notification_offset, channel="telegram"))
    await log_action(request, db, "TASK_CREATE", entity_type="task", entity_id=str(task.id))
    await db.commit()
    return {"id": str(task.id)}

@router.get("/")
async def list_tasks(current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task).where(Task.user_id == current.id).order_by(Task.start_at))
    return [{"id": str(t.id), "title": t.title, "start_at": t.start_at.isoformat(), "duration_min": t.duration_min, "status": t.status, "subject_id": str(t.subject_id) if t.subject_id else None} for t in result.scalars().all()]

@router.put("/{task_id}")
async def update_task(task_id: UUID, data: TaskUpdate, current: User = Depends(get_current_user), _=Depends(forbid_impersonation), db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task or task.user_id != current.id: raise HTTPException(404)
    if data.title is not None: task.title = data.title
    if data.start_at is not None: task.start_at = data.start_at
    if data.duration_min is not None: task.duration_min = data.duration_min
    if data.status is not None: task.status = data.status
    await db.commit()
    return {"ok": True}

@router.delete("/{task_id}")
async def delete_task(task_id: UUID, current: User = Depends(get_current_user), _=Depends(forbid_impersonation), db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task or task.user_id != current.id: raise HTTPException(404)
    await db.delete(task); await db.commit()
    return {"ok": True}

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
    total = sum([s.total_minutes for s in stats]) if stats else 0
    
    return {
        "total_hours": round(total / 60, 1),
        "subjects": [{"name": s.name, "color": s.color, "hours": round(s.total_minutes / 60, 1)} for s in stats]
    }

@router.get("/stats")
async def get_stats(period: str = "week", current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _build_stats(current.id, period, db)
