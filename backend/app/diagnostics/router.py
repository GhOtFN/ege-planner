from fastapi import APIRouter, Depends
from sqlalchemy import text, select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import get_db
from app.models import User, Task, Session, ActivityEvent, Reminder
from app.bot.bot import bot
from app.scheduler import scheduler
from app.config import settings, APP_START_TIME
import time

router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])

@router.get("/")
async def get_diagnostics(db: AsyncSession = Depends(get_db)):
    results: dict = {
        "uptime_seconds": round(time.time() - APP_START_TIME, 1),
    }

    # --- База данных ---
    try:
        start = time.time()
        await db.execute(text("SELECT 1"))
        latency = round((time.time() - start) * 1000, 2)

        counts = {}
        for name, model in [
            ("users", User),
            ("tasks", Task),
            ("sessions", Session),
            ("activity_events", ActivityEvent),
            ("reminders", Reminder),
        ]:
            try:
                r = await db.execute(select(func.count()).select_from(model))
                counts[name] = r.scalar()
            except Exception as e:
                counts[name] = f"error: {e}"

        results["database"] = {
            "status": "ok",
            "latency_ms": latency,
            "tables": counts,
        }
    except Exception as e:
        results["database"] = {"status": "error", "error": str(e)}

    # --- Telegram ---
    if bot:
        try:
            me = await bot.get_me()
            results["telegram"] = {
                "status": "ok",
                "bot_username": me.username,
                "bot_id": me.id,
            }
        except Exception as e:
            results["telegram"] = {"status": "error", "error": str(e)}
    else:
        results["telegram"] = {
            "status": "not_configured",
            "reason": "TELEGRAM_BOT_TOKEN не задан в переменных окружения",
        }

    # --- Планировщик ---
    try:
        jobs = scheduler.get_jobs()
        results["scheduler"] = {
            "status": "ok" if scheduler.running else "stopped",
            "jobs": [
                {
                    "id": j.id,
                    "next_run": j.next_run_time.isoformat() if j.next_run_time else None,
                }
                for j in jobs
            ],
        }
    except Exception as e:
        results["scheduler"] = {"status": "error", "error": str(e)}

    # --- Окружение (без секретов!) ---
    results["environment"] = {
        "frontend_url": settings.frontend_url,
        "has_jwt_secret": bool(settings.jwt_secret),
        "has_refresh_secret": bool(settings.refresh_secret),
        "has_telegram_token": bool(settings.telegram_bot_token),
        "has_bootstrap_admin": bool(settings.bootstrap_superadmin_email),
        "database_url_uses_pooler": ("6543" in settings.database_url)
        or ("pooler" in settings.database_url),
    }

    return results
