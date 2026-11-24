from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, timezone
from sqlalchemy import select, func
from app.db import async_session
from app.models import Reminder, Task, User, PushSubscription
from app.bot.bot import send_notification
from app.config import settings
import json

try:
    from pywebpush import webpush, WebPushException
except ImportError:
    webpush = None

scheduler = AsyncIOScheduler(timezone="UTC")

async def send_push_to_user(user_id, title, body):
    if not webpush or not settings.vapid_private_key:
        return
    async with async_session() as db:
        res = await db.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))
        for sub in res.scalars().all():
            try:
                webpush(
                    subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                    data=json.dumps({"title": title, "body": body}),
                    vapid_private_key=settings.vapid_private_key,
                    vapid_claims={"sub": settings.vapid_subject}
                )
            except Exception as e:
                print(f"Push error: {e}")

async def check_reminders():
    async with async_session() as db:
        due = await db.execute(
            select(Reminder, Task, User)
            .join(Task, Reminder.task_id == Task.id)
            .join(User, Task.user_id == User.id)
            .where(Reminder.sent_at.is_(None))
            .where(Task.start_at >= func.now())  # только будущие
            .where(Task.start_at <= func.now() + func.make_interval(0, 0, 0, 0, 0, Reminder.offset_min, 0))
        )
        for reminder, task, user in due.all():
            msg = f"🔔 Скоро: «{task.title}» в {task.start_at.strftime('%H:%M')} UTC"
            if user.telegram_id:
                await send_notification(user.telegram_id, msg)
            await send_push_to_user(user.id, "Напоминание", f"{task.title} начнётся в {task.start_at.strftime('%H:%M')}")
            reminder.sent_at = datetime.now(timezone.utc)
        await db.commit()

scheduler.add_job(check_reminders, "interval", minutes=1)
