import random
from datetime import datetime, timezone, timedelta
from aiogram import Bot, Dispatcher, Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from sqlalchemy import select
from app.config import settings
from app.db import async_session
from app.models import User, TelegramLinkCode, Subject, Task

router = Router()
bot = Bot(token=settings.telegram_bot_token) if settings.telegram_bot_token else None
dp = Dispatcher()
dp.include_router(router)

def get_main_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📝 Создать занятие", callback_data="create_start")],
        [InlineKeyboardButton(text="📅 Мои занятия на сегодня", callback_data="list_today")],
        [InlineKeyboardButton(text="📊 Статистика", callback_data="stats_week")]
    ])

@router.message(CommandStart())
async def cmd_start(message: Message):
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == message.from_user.id))
        user = res.scalar_one_or_none()
        
        if user:
            await message.answer(f"👋 Привет, {user.email}!\nВыбери действие:", reply_markup=get_main_menu())
            return
            
        code = str(random.randint(100000, 999999))
        db.add(TelegramLinkCode(code=code, telegram_id=message.from_user.id))
        await db.commit()
        await message.answer(f"👋 Привет! Твой код для привязки:\n\n<b>{code}</b>\n\nВведи его в настройках на сайте.", parse_mode="HTML")

@router.callback_query(F.data == "menu_main")
async def back_to_menu(callback: CallbackQuery):
    await callback.message.edit_text("Главное меню:", reply_markup=get_main_menu())

@router.callback_query(F.data == "create_start")
async def create_start(callback: CallbackQuery):
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == callback.from_user.id))
        user = res.scalar_one_or_none()
        if not user: return await callback.answer("Ошибка. Напиши /start")
        
        subs = await db.execute(select(Subject).where(Subject.user_id == user.id))
        subjects = subs.scalars().all()
        if not subjects: return await callback.answer("Сначала добавь предметы на сайте!", show_alert=True)
        
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text=s.name, callback_data=f"csub_{s.id}")] for s in subjects] + [[InlineKeyboardButton(text="⬅️ Назад", callback_data="menu_main")]])
        await callback.message.edit_text("Выбери предмет:", reply_markup=kb)

@router.callback_query(F.data.startswith("csub_"))
async def create_subject(callback: CallbackQuery):
    sub_id = callback.data.split("_")[1]
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Сегодня", callback_data=f"cdate_0_{sub_id}"), InlineKeyboardButton(text="Завтра", callback_data=f"cdate_1_{sub_id}")],
        [InlineKeyboardButton(text="⬅️ Назад", callback_data="create_start")]
    ])
    await callback.message.edit_text("На какой день?", reply_markup=kb)

@router.callback_query(F.data.startswith("cdate_"))
async def create_date(callback: CallbackQuery):
    _, days, sub_id = callback.data.split("_")
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="10:00", callback_data=f"ctime_{days}_{sub_id}_10"), InlineKeyboardButton(text="14:00", callback_data=f"ctime_{days}_{sub_id}_14"), InlineKeyboardButton(text="18:00", callback_data=f"ctime_{days}_{sub_id}_18")],
        [InlineKeyboardButton(text="⬅️ Назад", callback_data=f"csub_{sub_id}")]
    ])
    await callback.message.edit_text("Во сколько?", reply_markup=kb)

@router.callback_query(F.data.startswith("ctime_"))
async def create_time(callback: CallbackQuery):
    _, days, sub_id, hour = callback.data.split("_")
    dt = datetime.now(timezone.utc) + timedelta(days=int(days))
    dt = dt.replace(hour=int(hour), minute=0, second=0, microsecond=0)
    
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == callback.from_user.id))
        user = res.scalar_one()
        db.add(Task(user_id=user.id, title="Занятие", start_at=dt, duration_min=60, subject_id=sub_id))
        await db.commit()

    kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="В главное меню", callback_data="menu_main")]])
    await callback.message.edit_text("✅ Занятие успешно создано! Оно уже появилось на сайте.", reply_markup=kb)

@router.callback_query(F.data == "list_today")
async def list_today(callback: CallbackQuery):
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == callback.from_user.id))
        user = res.scalar_one()
        
        tasks = await db.execute(
            select(Task, Subject.name).join(Subject, isouter=True)
            .where(Task.user_id == user.id, Task.start_at >= func.date_trunc('day', func.now()), Task.start_at < func.date_trunc('day', func.now() + text("interval '1 day'")))
            .order_by(Task.start_at)
        )
        
        buttons = []
        text = "📅 <b>Твои занятия на сегодня:</b>\n\n"
        for t, sub_name in tasks.all():
            status = "✅" if t.status == "done" else "⏳"
            text += f"{status} {t.start_at.strftime('%H:%M')} - {sub_name or 'Без предмета'}\n"
            if t.status != "done":
                buttons.append([InlineKeyboardButton(text=f"Отметить {t.start_at.strftime('%H:%M')} выполненным", callback_data=f"done_{t.id}")])
        
        if not buttons: text += "Нет активных задач."
        buttons.append([InlineKeyboardButton(text="⬅️ Назад", callback_data="menu_main")])
        
        await callback.message.edit_text(text, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons))

@router.callback_query(F.data.startswith("done_"))
async def mark_done(callback: CallbackQuery):
    task_id = callback.data.split("_")[1]
    async with async_session() as db:
        task = await db.get(Task, task_id)
        if task:
            task.status = "done"
            await db.commit()
    await callback.answer("✅ Отмечено выполненным!", show_alert=True)
    await list_today(callback)

async def send_notification(telegram_id: int, text: str):
    if bot:
        try: await bot.send_message(telegram_id, text)
        except Exception: pass
