from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.bot.bot import send_notification, send_smart_reminders
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
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

def get_user_tz(user: User):
    try:
        return ZoneInfo(user.timezone or "Europe/Moscow")
    except Exception:
        return ZoneInfo("Europe/Moscow")

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
            except WebPushException as e:
                # Если токен устарел, удаляем его из базы, чтобы не мешал
                if e.response and e.response.status_code in [401, 403, 404, 410]:
                    await db.delete(sub)
            except Exception as e:
                print(f"Push error: {e}")
        await db.commit()

async def check_reminders():
    async with async_session() as db:
        # Ищем напоминания, которые нужно отправить
        due = await db.execute(
            select(Reminder, Task, User)
            .join(Task, Reminder.task_id == Task.id)
            .join(User, Task.user_id == User.id)
            .where(Reminder.sent_at.is_(None))
            .where(Task.start_at >= func.now())  # только будущие задачи
            .where(Task.start_at <= func.now() + func.make_interval(0, 0, 0, 0, 0, Reminder.offset_min, 0))
        )
        
        for reminder, task, user in due.all():
            # ВОТ ЗДЕСЬ МЫ ПЕРЕВОДИМ ВРЕМЯ В ЧАСОВОЙ ПОЯС ПОЛЬЗОВАТЕЛЯ
            tz = get_user_tz(user)
            local_time = task.start_at.astimezone(tz)
            time_str = local_time.strftime('%H:%M')
            
            msg_text = f"🔔 Скоро: «{task.title}» начнётся в {time_str}"
            
            # Отправляем в Telegram
            if user.telegram_id:
                await send_notification(user.telegram_id, msg_text)
                
            # Отправляем Push на iPhone/Android
            await send_push_to_user(user.id, "Напоминание", f"{task.title} начнётся в {time_str}")
            
            reminder.sent_at = datetime.now(timezone.utc)
            
        await db.commit()

scheduler.add_job(check_reminders, "interval", minutes=1)
scheduler.add_job(send_smart_reminders, "cron", hour=10, minute=0)
