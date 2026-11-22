from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, timezone
from sqlalchemy import select, func
from app.db import async_session
from app.models import Reminder, Task, User
from app.bot.bot import send_notification

scheduler = AsyncIOScheduler(timezone="UTC")

async def check_reminders():
    async with async_session() as db:
        # Ищем напоминания, время которых пришло.
        # Используем позиционные аргументы для make_interval (годы, месяцы, недели, дни, часы, минуты, секунды)
        due = await db.execute(
            select(Reminder, Task, User)
            .join(Task, Reminder.task_id == Task.id)
            .join(User, Task.user_id == User.id)
            .where(Reminder.sent_at.is_(None))
            .where(
                Task.start_at <= func.now() + func.make_interval(0, 0, 0, 0, 0, Reminder.offset_min, 0)
            )
        )
        for reminder, task, user in due.all():
            if user.telegram_id:
                await send_notification(
                    user.telegram_id,
                    f"🔔 Напоминание: «{task.title}» начнётся в {task.start_at.strftime('%H:%M')}"
                )
            reminder.sent_at = datetime.now(timezone.utc)
        await db.commit()

scheduler.add_job(check_reminders, "interval", minutes=1)
