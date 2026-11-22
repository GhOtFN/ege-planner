from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
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
    subject = Subject(user_id=current.id, name=data.name, color=data.color)
    db.add(subject)
    await db.commit()
    return {"id": str(subject.id), "name": subject.name}
