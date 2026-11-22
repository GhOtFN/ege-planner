from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from app.db import get_db
from app.models import Subject, User
from app.schemas import SubjectCreate
from app.auth.deps import get_current_user

router = APIRouter(prefix="/subjects", tags=["subjects"])

@router.get("/")
async def list_subjects(current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Subject).where(Subject.user_id == current.id))
    return [{"id": str(s.id), "name": s.name, "color": s.color} for s in res.scalars().all()]

@router.post("/")
async def create_subject(data: SubjectCreate, current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Проверка на дубликат
    existing = await db.execute(select(Subject).where(Subject.user_id == current.id, Subject.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Предмет уже существует")
        
    subject = Subject(user_id=current.id, name=data.name, color=data.color)
    db.add(subject)
    await db.commit()
    return {"id": str(subject.id), "name": subject.name}

@router.post("/bulk")
async def create_subjects_bulk(data: list[SubjectCreate], current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Получаем имена уже существующих предметов
    existing_res = await db.execute(select(Subject.name).where(Subject.user_id == current.id))
    existing_names = set(existing_res.scalars().all())

    for item in data:
        if item.name not in existing_names:
            db.add(Subject(user_id=current.id, name=item.name, color=item.color))
    
    await db.commit()
    return {"ok": True}

@router.delete("/{subject_id}")
async def delete_subject(subject_id: UUID, current: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Subject).where(Subject.id == subject_id, Subject.user_id == current.id))
    subject = res.scalar_one_or_none()
    if not subject:
        raise HTTPException(404, "Subject not found")
    await db.delete(subject)
    await db.commit()
    return {"ok": True}
