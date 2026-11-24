import random
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from aiogram import Bot, Dispatcher, Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from sqlalchemy import select, func
from app.config import settings
from app.db import async_session
from app.models import User, TelegramLinkCode, Subject, Task

router = Router()
bot = Bot(token=settings.telegram_bot_token) if settings.telegram_bot_token else None
dp = Dispatcher()
dp.include_router(router)

WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

def main_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="➕ Создать занятие", callback_data="create_start")],
        [InlineKeyboardButton(text="📅 Расписание", callback_data="schedule_start")],
        [InlineKeyboardButton(text="📊 Статистика", callback_data="stats_menu")],
    ])

def back_btn():
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="⬅️ В меню", callback_data="menu_main")]])

def get_user_tz(user):
    try:
        return ZoneInfo(user.timezone or "Europe/Moscow")
    except Exception:
        return ZoneInfo("Europe/Moscow")

@router.message(CommandStart())
async def cmd_start(message: Message):
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == message.from_user.id))
        user = res.scalar_one_or_none()
        if user:
            await message.answer(f"👋 Привет, {user.email}!\nВыбери действие:", reply_markup=main_menu())
            return
        code = str(random.randint(100000, 999999))
        db.add(TelegramLinkCode(code=code, telegram_id=message.from_user.id))
        await db.commit()
        await message.answer(f"👋 Привет! Твой код для привязки:\n\n<b>{code}</b>\n\nВведи его в настройках на сайте.", parse_mode="HTML")

@router.callback_query(F.data == "menu_main")
async def back_to_menu(callback: CallbackQuery):
    await callback.message.edit_text("Главное меню:", reply_markup=main_menu())

# ===== СОЗДАНИЕ =====
@router.callback_query(F.data == "create_start")
async def create_start(callback: CallbackQuery):
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == callback.from_user.id))
        user = res.scalar_one_or_none()
        if not user:
            return await callback.answer("Напиши /start", show_alert=True)
        subs = await db.execute(select(Subject).where(Subject.user_id == user.id))
        subjects = subs.scalars().all()
        if not subjects:
            return await callback.answer("Добавь предметы в настройках на сайте!", show_alert=True)
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text=s.name, callback_data=f"csub_{s.id}")] for s in subjects
        ] + [[InlineKeyboardButton(text="⬅️ Назад", callback_data="menu_main")]])
        await callback.message.edit_text("Выбери предмет:", reply_markup=kb)

@router.callback_query(F.data.startswith("csub_"))
async def create_subject(callback: CallbackQuery):
    sub_id = callback.data.split("_")[1]
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == callback.from_user.id))
        user = res.scalar_one()
    tz = get_user_tz(user)
    now_local = datetime.now(tz)
    kb = []
    for i in range(7):
        d = now_local + timedelta(days=i)
        kb.append([InlineKeyboardButton(
            text=f"{WEEKDAYS[d.weekday()]}, {d.strftime('%d.%m')}",
            callback_data=f"cday_{i}_{sub_id}"
        )])
    kb.append([InlineKeyboardButton(text="⬅️ Назад", callback_data="create_start")])
    await callback.message.edit_text("Выбери день (на неделю вперёд):", reply_markup=InlineKeyboardMarkup(inline_keyboard=kb))

@router.callback_query(F.data.startswith("cday_"))
async def create_day(callback: CallbackQuery):
    _, days, sub_id = callback.data.split("_")
    kb = []
    hours = list(range(6, 24))  # 6:00 - 23:00
    for i in range(0, len(hours), 4):
        row = [InlineKeyboardButton(text=f"{h:02d}:00", callback_data=f"chour_{days}_{sub_id}_{h}") for h in hours[i:i+4]]
        kb.append(row)
    kb.append([InlineKeyboardButton(text="⬅️ Назад", callback_data=f"csub_{sub_id}")])
    await callback.message.edit_text("Выбери время начала:", reply_markup=InlineKeyboardMarkup(inline_keyboard=kb))

@router.callback_query(F.data.startswith("chour_"))
async def create_hour(callback: CallbackQuery):
    _, days, sub_id, hour = callback.data.split("_")
    kb = [[InlineKeyboardButton(text=f"{d} ч", callback_data=f"cdur_{days}_{sub_id}_{hour}_{d}")] for d in range(1, 6)]
    kb.append([InlineKeyboardButton(text="⬅️ Назад", callback_data=f"cday_{days}_{sub_id}")])
    await callback.message.edit_text("Выбери длительность:", reply_markup=InlineKeyboardMarkup(inline_keyboard=kb))

@router.callback_query(F.data.startswith("cdur_"))
async def create_duration(callback: CallbackQuery):
    _, days, sub_id, hour, dur = callback.data.split("_")
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == callback.from_user.id))
        user = res.scalar_one()
        tz = get_user_tz(user)
        now_local = datetime.now(tz)
        target_local = (now_local + timedelta(days=int(days))).replace(hour=int(hour), minute=0, second=0, microsecond=0)
        dt_utc = target_local.astimezone(timezone.utc)
        
        db.add(Task(user_id=user.id, title="Занятие", start_at=dt_utc, duration_min=int(dur)*60, subject_id=sub_id))
        await db.commit()
    await callback.message.edit_text(
        f"✅ Создано: {target_local.strftime('%d.%m %H:%M')} ({dur} ч)",
        reply_markup=back_btn()
    )

# ===== РАСПИСАНИЕ =====
@router.callback_query(F.data == "schedule_start")
async def schedule_start(callback: CallbackQuery):
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == callback.from_user.id))
        user = res.scalar_one_or_none()
        if not user:
            return await callback.answer("Напиши /start")
    tz = get_user_tz(user)
    now_local = datetime.now(tz)
    kb = []
    for i in range(7):
        d = now_local + timedelta(days=i)
        kb.append([InlineKeyboardButton(
            text=f"{WEEKDAYS[d.weekday()]}, {d.strftime('%d.%m')}",
            callback_data=f"view_{i}"
        )])
    kb.append([InlineKeyboardButton(text="⬅️ Назад", callback_data="menu_main")])
    await callback.message.edit_text("Выбери день:", reply_markup=InlineKeyboardMarkup(inline_keyboard=kb))

@router.callback_query(F.data.startswith("view_"))
async def view_day(callback: CallbackQuery):
    days = int(callback.data.split("_")[1])
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == callback.from_user.id))
        user = res.scalar_one()
        tz = get_user_tz(user)
        now_local = datetime.now(tz)
        target_day = (now_local + timedelta(days=days)).replace(hour=0, minute=0, second=0, microsecond=0)
        start_utc = target_day.astimezone(timezone.utc)
        end_utc = (target_day + timedelta(days=1)).astimezone(timezone.utc)
        
        tasks_res = await db.execute(
            select(Task, Subject.name).join(Subject, Task.subject_id == Subject.id, isouter=True)
            .where(Task.user_id == user.id, Task.start_at >= start_utc, Task.start_at < end_utc)
            .order_by(Task.start_at)
        )
        rows = tasks_res.all()
    
    text = f"📅 <b>{target_day.strftime('%d.%m.%Y')}</b>\n\n"
    buttons = []
    if not rows:
        text += "На этот день занятий нет."
    for t, sub_name in rows:
        local_dt = t.start_at.astimezone(tz)
        status = "✅" if t.status == "done" else "⏳"
        text += f"{status} {local_dt.strftime('%H:%M')} — {sub_name or 'Без предмета'} ({t.duration_min} мин)\n"
        if t.status != "done":
            buttons.append([InlineKeyboardButton(text=f"✅ Отметить {local_dt.strftime('%H:%M')}", callback_data=f"markdone_{t.id}_{days}")])
    buttons.append([InlineKeyboardButton(text="⬅️ Назад", callback_data="schedule_start")])
    
    await callback.message.edit_text(text, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons))

@router.callback_query(F.data.startswith("markdone_"))
async def mark_done(callback: CallbackQuery):
    parts = callback.data.split("_")
    task_id, days = parts[1], parts[2]
    async with async_session() as db:
        task = await db.get(Task, task_id)
        if task:
            task.status = "done"
            await db.commit()
    await callback.answer("✅ Отмечено!")
    callback.data = f"view_{days}"
    await view_day(callback)

# ===== СТАТИСТИКА =====
@router.callback_query(F.data == "stats_menu")
async def stats_menu(callback: CallbackQuery):
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="За день", callback_data="stats_day")],
        [InlineKeyboardButton(text="За неделю", callback_data="stats_week")],
        [InlineKeyboardButton(text="За месяц", callback_data="stats_month")],
        [InlineKeyboardButton(text="⬅️ Назад", callback_data="menu_main")],
    ])
    await callback.message.edit_text("Выбери период:", reply_markup=kb)

async def build_stats_text(user, period):
    async with async_session() as db:
        query = select(Subject.name, func.sum(Task.duration_min).label("total"))
        if period == "day":
            query = query.where(Task.start_at >= func.now() - func.make_interval(0, 0, 0, 1))
        elif period == "week":
            query = query.where(Task.start_at >= func.now() - func.make_interval(0, 0, 0, 7))
        else:
            query = query.where(Task.start_at >= func.now() - func.make_interval(0, 1))
        query = query.join(Task, Task.subject_id == Subject.id).where(Task.user_id == user.id, Task.status == "done").group_by(Subject.id)
        res = await db.execute(query)
        rows = res.all()
        if not rows:
            return "Нет выполненных задач за этот период."
        total = sum(r.total for r in rows) / 60
        text = f"📊 <b>Статистика ({period})</b>\n\nВсего: <b>{round(total, 1)} ч</b>\n\n"
        for r in rows:
            text += f"• {r.name}: {round(r.total/60, 1)} ч\n"
        return text

@router.callback_query(F.data.in_({"stats_day", "stats_week", "stats_month"}))
async def show_stats(callback: CallbackQuery):
    period = callback.data.split("_")[1]
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == callback.from_user.id))
        user = res.scalar_one()
    text = await build_stats_text(user, period)
    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="⬅️ Назад", callback_data="stats_menu")]])
    await callback.message.edit_text(text, parse_mode="HTML", reply_markup=kb)

async def send_notification(telegram_id: int, text: str):
    if bot:
        try:
            await bot.send_message(telegram_id, text)
        except Exception:
            pass
