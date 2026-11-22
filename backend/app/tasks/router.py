from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_db
from app.models import Task, User, ActivityEvent
from app.schemas import TaskCreate
from app.auth.deps import get_current_user, forbid_impersonation
from uuid import UUID

router = APIRouter(prefix="/tasks", tags=["tasks"])

async def log_event(db, actor_id, effective_id, action, entity_type, entity_id, before, after, ip, is_imp=False):
    event = ActivityEvent(
        actor_id=actor_id,
        effective_user_id=effective_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before_state=before,
        after_state=after,
        is_impersonation=is_imp,
        ip_address=ip,
    )
    db.add(event)

@router.post("/")
async def create_task(
    data: TaskCreate,
    request: Request,
    current: User = Depends(get_current_user),
    _=Depends(forbid_impersonation),
    db: AsyncSession = Depends(get_db),
):
    task = Task(
        user_id=current.id,
        title=data.title,
        description=data.description,
        start_at=data.start_at,
        duration_min=data.duration_min,
        priority=data.priority,
        subject_id=data.subject_id,
        recurrence_rule=data.recurrence_rule,
    )
    db.add(task)
    await db.flush()
    await log_event(db, current.id, current.id, "TASK_CREATE", "task", task.id,
                    None, {"title": task.title, "start_at": str(task.start_at)},
                    request.client.host if request.client else None)
    await db.commit()
    return {"id": str(task.id)}

@router.get("/")
async def list_tasks(current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task).where(Task.user_id == current.id).order_by(Task.start_at))
    tasks = result.scalars().all()
    return [{"id": str(t.id), "title": t.title, "start_at": t.start_at.isoformat(), "status": t.status} for t in tasks]
