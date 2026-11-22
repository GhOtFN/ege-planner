from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from app.db import get_db
from app.models import Task, User, Reminder
from app.schemas import TaskCreate, TaskUpdate
from app.auth.deps import get_current_user, forbid_impersonation
from app.activity.utils import log_action

router = APIRouter(prefix="/tasks", tags=["tasks"])

@router.post("/")
async def create_task(data: TaskCreate, request: Request, current: User = Depends(get_current_user), _=Depends(forbid_impersonation), db: AsyncSession = Depends(get_db)):
    task = Task(
        user_id=current.id, title=data.title, start_at=data.start_at,
        duration_min=data.duration_min, subject_id=data.subject_id,
    )
    db.add(task)
    await db.flush()

    reminder = Reminder(task_id=task.id, offset_min=current.notification_offset, channel="telegram")
    db.add(reminder)
    await log_action(request, db, "TASK_CREATE", entity_type="task", entity_id=str(task.id), after_state={"title": task.title, "start_at": str(task.start_at)})
    await db.commit()
    return {"id": str(task.id)}

@router.get("/")
async def list_tasks(current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task).where(Task.user_id == current.id).order_by(Task.start_at))
    tasks = result.scalars().all()
    return [{"id": str(t.id), "title": t.title, "start_at": t.start_at.isoformat(), "duration_min": t.duration_min, "subject_id": str(t.subject_id) if t.subject_id else None} for t in tasks]

@router.put("/{task_id}")
async def update_task(task_id: UUID, data: TaskUpdate, request: Request, current: User = Depends(get_current_user), _=Depends(forbid_impersonation), db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task or task.user_id != current.id:
        raise HTTPException(404, "Task not found")
    
    before = {"title": task.title, "start_at": str(task.start_at), "duration_min": task.duration_min}
    
    if data.title is not None: task.title = data.title
    if data.start_at is not None: task.start_at = data.start_at
    if data.duration_min is not None: task.duration_min = data.duration_min
    if data.subject_id is not None: task.subject_id = data.subject_id
    if data.status is not None: task.status = data.status
    
    await log_action(request, db, "TASK_UPDATE", entity_type="task", entity_id=str(task.id), before_state=before, after_state={"title": task.title, "start_at": str(task.start_at), "duration_min": task.duration_min})
    await db.commit()
    return {"ok": True}

@router.delete("/{task_id}")
async def delete_task(task_id: UUID, request: Request, current: User = Depends(get_current_user), _=Depends(forbid_impersonation), db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task or task.user_id != current.id:
        raise HTTPException(404, "Task not found")
    
    await log_action(request, db, "TASK_DELETE", entity_type="task", entity_id=str(task.id), before_state={"title": task.title})
    await db.delete(task)
    await db.commit()
    return {"ok": True}
