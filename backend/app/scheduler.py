from apscheduler.schedulers.asyncio import AsyncIOScheduler
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
                if e.response and e.response.status_code in [401, 403, 404, 410]:
                    await db.delete(sub)
            except Exception:
                pass
        await db.commit()

async def check_reminders():
    async with async_session() as db:
        now = datetime.now(timezone.utc)
        
        # 1. НАПОМИНАНИЯ ЗА N МИНУТ ДО НАЧАЛА
        due = await db.execute(
            select(Reminder, Task, User)
            .join(Task, Reminder.task_id == Task.id)
            .join(User, Task.user_id == User.id)
            .where(Reminder.sent_at.is_(None))
            .where(Task.start_at >= now)
            .where(Task.start_at <= now + func.make_interval(0, 0, 0, 0, 0, Reminder.offset_min, 0))
        )
        for reminder, task, user in due.all():
            tz = get_user_tz(user)
            time_str = task.start_at.astimezone(tz).strftime('%H:%M')
            msg = f"🔔 Скоро: «{task.title}» в {time_str}"
            if user.telegram_id: await send_notification(user.telegram_id, msg)
            await send_push_to_user(user.id, "Напоминание", f"{task.title} начнётся в {time_str}")
            reminder.sent_at = now
            
        # 2. УВЕДОМЛЕНИЕ ПОСЛЕ ОКОНЧАНИЯ (Спрашиваем, выполнено ли)
        # Ищем задачи, которые закончились 5 минут назад, и по ним еще не было уведомления
        just_ended = await db.execute(
            select(Task, User)
            .join(User, Task.user_id == User.id)
            .where(Task.status == "planned")
            .where(Task.start_at + func.make_interval(0, 0, 0, 0, 0, Task.duration_min, 0) <= now)
            .where(Task.start_at + func.make_interval(0, 0, 0, 0, 0, Task.duration_min, 0) >= now - func.make_interval(0, 0, 0, 0, 0, 5, 0))
        )
        
        for task, user in just_ended.all():
            await send_push_to_user(
                user.id, 
                "Как успехи?", 
                f"Занятие «{task.title}» закончилось. Не забудьте отметить его выполненным в планере!"
            )
            if user.telegram_id:
                kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="✅ Выполнено", callback_data=f"markdone_{task.id}_0")]])
                try: await bot.send_message(user.telegram_id, f"Занятие «{task.title}» закончилось. Отметить?", reply_markup=kb)
                except Exception: pass
                
        await db.commit()

scheduler.add_job(check_reminders, "interval", minutes=1)
