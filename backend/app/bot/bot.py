import random
from aiogram import Bot, Dispatcher, Router, F
from aiogram.filters import CommandStart, Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from sqlalchemy import select
from datetime import datetime, timezone
from app.config import settings
from app.db import async_session
from app.models import User, TelegramLinkCode, Subject, Task, Reminder

router = Router()
bot = Bot(token=settings.telegram_bot_token) if settings.telegram_bot_token else None
dp = Dispatcher()
dp.include_router(router)

class AddTaskStates(StatesGroup):
    choosing_subject = State()
    entering_time = State()

@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == message.from_user.id))
        user = res.scalar_one_or_none()
        
        if user:
            # Приветствие для авторизованных
            await message.answer(
                f"👋 Привет, {user.email}! Готов к подготовке к ЕГЭ?\n\n"
                "Используй /add, чтобы добавить занятие, или /stats для просмотра прогресса."
            )
            return
            
        # Логика привязки
        code = str(random.randint(100000, 999999))
        existing = await db.execute(select(TelegramLinkCode).where(TelegramLinkCode.code == code))
        if existing.scalar_one_or_none():
            code = str(random.randint(100000, 999999))
        
        db.add(TelegramLinkCode(code=code, telegram_id=message.from_user.id))
        await db.commit()
        await message.answer(f"👋 Привет! Твой код для привязки:\n\n<b>{code}</b>\n\nВведи его в настройках на сайте.", parse_mode="HTML")

@router.message(Command("add"))
async def cmd_add_task(message: Message, state: FSMContext):
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == message.from_user.id))
        user = res.scalar_one_or_none()
        if not user: return await message.answer("Сначала привяжи аккаунт через /start.")
        
        subs = await db.execute(select(Subject).where(Subject.user_id == user.id))
        subjects = subs.scalars().all()
        if not subjects: return await message.answer("У тебя нет предметов. Добавь их в настройках на сайте.")
        
        # Создаем кнопки с предметами
        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text=s.name, callback_data=f"sub_{s.id}")] for s in subjects
        ])
        await message.answer("Выбери предмет:", reply_markup=kb)
        await state.set_state(AddTaskStates.choosing_subject)

@router.callback_query(AddTaskStates.choosing_subject, F.data.startswith("sub_"))
async def process_subject(callback: CallbackQuery, state: FSMContext):
    subject_id = callback.data.split("_")[1]
    await state.update_data(subject_id=subject_id)
    await callback.message.edit_text("Введи дату и время начала (например: 24.11 15:30):")
    await state.set_state(AddTaskStates.entering_time)

@router.message(AddTaskStates.entering_time)
async def process_time(message: Message, state: FSMContext):
    try:
        # Парсим дату
        dt = datetime.strptime(f"{datetime.now().year}.{message.text}", "%Y.%d.%m %H:%M")
        dt = dt.replace(tzinfo=timezone.utc)
        data = await state.get_data()
        
        async with async_session() as db:
            res = await db.execute(select(User).where(User.telegram_id == message.from_user.id))
            user = res.scalar_one()
            
            task = Task(user_id=user.id, title="Занятие из Telegram", start_at=dt, duration_min=60, subject_id=data['subject_id'])
            db.add(task)
            await db.flush()
            db.add(Reminder(task_id=task.id, offset_min=user.notification_offset))
            await db.commit()

        await message.answer("✅ Занятие успешно добавлено в расписание!")
        await state.clear()
    except ValueError:
        await message.answer("❌ Неверный формат. Напиши так: 24.11 15:30")

@router.message(Command("stats"))
async def cmd_stats(message: Message):
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == message.from_user.id))
        user = res.scalar_one_or_none()
        if not user: return await message.answer("Сначала привяжи аккаунт через /start.")
        
        # Простая статистика текстом
        stats_res = await db.execute(
            select(Task).where(Task.user_id == user.id, Task.status == "done")
        )
        tasks = stats_res.scalars().all()
        total_hours = sum([t.duration_min for t in tasks]) / 60
        await message.answer(f"📊 Твоя статистика:\n\nВыполнено занятий: {len(tasks)}\nВсего часов: {round(total_hours, 1)}")

async def send_notification(telegram_id: int, text: str):
    if bot:
        try:
            await bot.send_message(telegram_id, text)
        except Exception:
            pass
