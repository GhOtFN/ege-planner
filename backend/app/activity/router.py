from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_db
from app.models import ActivityEvent, User, Task
from app.auth.deps import get_current_user
from uuid import UUID
from datetime import datetime, timezone

router = APIRouter(prefix="/activity", tags=["activity"])

@router.get("/")
async def list_activity(current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ActivityEvent)
        .where(ActivityEvent.effective_user_id == current.id)
        .order_by(ActivityEvent.created_at.desc())
        .limit(100)
    )
    events = result.scalars().all()
    return [
        {
            "id": str(e.id),
            "action": e.action,
            "entity_type": e.entity_type,
            "created_at": e.created_at.isoformat(),
            "is_impersonation": e.is_impersonation,
        }
        for e in events
    ]

@router.post("/{event_id}/rollback")
async def rollback(
    event_id: UUID,
    current: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(ActivityEvent, event_id)
    if not event or event.effective_user_id != current.id:
        raise HTTPException(404)
    if not event.before_state or event.action == "ROLLBACK":
        raise HTTPException(400, "Cannot rollback this event")

    # Пример отката для задачи
    if event.entity_type == "task" and event.entity_id:
        task = await db.get(Task, event.entity_id)
        if task:
            before = event.before_state
            task.title = before.get("title", task.title)
            # здесь можно восстановить другие поля
            db.add(ActivityEvent(
                actor_id=current.id,
                effective_user_id=current.id,
                action="ROLLBACK",
                entity_type="task",
                entity_id=task.id,
                before_state=None,
                after_state=before,
                ip_address=None,
            ))
    await db.commit()
    return {"ok": True}
