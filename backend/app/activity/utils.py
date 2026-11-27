from app.models import ActivityEvent
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID

async def log_action(
    request: Request, db: AsyncSession, action: str,
    entity_type: str = None, entity_id: str = None,
    before_state: dict = None, after_state: dict = None
):
    # Если есть impersonator_id, значит действие совершает админ от имени юзера
    actor_id = getattr(request.state, "impersonator_id", None) or getattr(request.state, "user_id", None)
    effective_user_id = getattr(request.state, "user_id", None)
    is_impersonation = bool(getattr(request.state, "impersonator_id", None))
    ip = request.client.host if request.client else None

    if not actor_id:
        return

    # Конвертируем строку в UUID, если она передана (иначе SQLAlchemy упадет с ошибкой)
    final_entity_id = None
    if entity_id:
        try:
            final_entity_id = UUID(str(entity_id))
        except ValueError:
            pass

    event = ActivityEvent(
        actor_id=actor_id, 
        effective_user_id=effective_user_id,
        action=action, 
        entity_type=entity_type, 
        entity_id=final_entity_id, # <--- ИСПОЛЬЗУЕМ КОНВЕРТИРОВАННЫЙ UUID
        before_state=before_state, 
        after_state=after_state,
        is_impersonation=is_impersonation, 
        ip_address=ip,
        user_agent=request.headers.get("User-Agent")
    )
    db.add(event)
