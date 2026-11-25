import random
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from aiogram import Bot, Dispatcher, Router, F
from aiogram.filters import CommandStart
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from sqlalchemy import select, func
from app.config import settings
from app.db import async_session
from app.models import User, TelegramLinkCode, Subject, Task

router = Router()
bot = Bot(token=settings.telegram_bot_token) if settings.telegram_bot_token else None
dp = Dispatcher()
dp.include_router(router)

WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

# ==========================================
# СОСТОЯНИЯ (FSM)
# ==========================================
class AddTaskStates(StatesGroup):
    choosing_subject = State()

class TestStates(StatesGroup):
    answering = State()

# ==========================================
# БАЗА ВОПРОСОВ ДЛЯ МИНИ-ТЕСТОВ
# ==========================================
QUESTIONS = {
    "Математика": [
        {"q": "Чему равна производная x^2?", "opts": ["x", "2x", "x^3"], "ans": "2x"},
        {"q": "Сколько будет sin(90°)?", "opts": ["0", "1", "-1"], "ans": "1"},
        {"q": "Решите уравнение: 2x = 10", "opts": ["2", "5", "10"], "ans": "5"},
        {"q": "Чему равен логарифм log_2(8)?", "opts": ["2", "3", "4"], "ans": "3"},
        {"q": "Сколько градусов в сумме углов треугольника?", "opts": ["90", "180", "360"], "ans": "180"},
    ],
    "Русский язык": [
        {"q": "В каком слове ударение на последний слог?", "opts": ["звОнит", "тОрты", "жалюзИ"], "ans": "жалюзИ"},
        {"q": "Сколько букв в русском алфавите?", "opts": ["31", "33", "35"], "ans": "33"},
        {"q": "Какое слово пишется с двумя Н?", "opts": ["варё_ый", "купле_ый", "серебря_ый"], "ans": "купле_ый"},
        {"q": "Какой падеж отвечает на вопрос 'Кому?'", "opts": ["Родительный", "Дательный", "Винительный"], "ans": "Дательный"},
        {"q": "Найдите причастие", "opts": ["бегающий", "бегать", "бегом"], "ans": "бегающий"},
    ],
    "Информатика": [
        {"q": "Сколько бит в одном байте?", "opts": ["4", "8", "16"], "ans": "8"},
        {"q": "Что означает аббревиатура CPU?", "opts": ["Оперативная память", "Процессор", "Жесткий диск"], "ans": "Процессор"},
        {"q": "В какой системе счисления 10 = 2 в десятичной?", "opts": ["Двоичная", "Восьмеричная", "Шестнадцатеричная"], "ans": "Двоичная"},
        {"q": "Какой логической операции соответствует И?", "opts": ["OR", "AND", "NOT"], "ans": "AND"},
        {"q": "Что такое IP-адрес?", "opts": ["Номер телефона", "Уникальный адрес устройства в сети", "Название сайта"], "ans": "Уникальный адрес устройства в сети"},
    ]
}

# ==========================================
# ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
# ==========================================
def main_menu():
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="➕ Создать занятие", callback_data="create_start")],
        [InlineKeyboardButton(text="📅 Расписание", callback_data="schedule_start")],
        [InlineKeyboardButton(text="🧠 Мини-тест", callback_data="test_start")],
        [InlineKeyboardButton(text="📊 Статистика", callback_data="stats_menu")],
    ])

def back_btn():
    return InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="⬅️ В меню", callback_data="menu_main")]])

def get_user_tz(user: User):
    try:
        return ZoneInfo(user.timezone or "Europe/Moscow")
    except Exception:
        return ZoneInfo("Europe/Moscow")

# ==========================================
# СТАРТ И ГЛАВНОЕ МЕНЮ
# ==========================================
@router.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
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
async def back_to_menu(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.message.edit_text("Главное меню:", reply_markup=main_menu())

# ==========================================
# 1. СОЗДАНИЕ ЗАНЯТИЯ (Кнопки)
# ==========================================
@router.callback_query(F.data == "create_start")
async def create_start(callback: CallbackQuery):
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == callback.from_user.id))
        user = res.scalar_one_or_none()
        if not user: return await callback.answer("Напиши /start")
        
        subs = await db.execute(select(Subject).where(Subject.user_id == user.id))
        subjects = subs.scalars().all()
        if not subjects: return await callback.answer("Добавь предметы на сайте!", show_alert=True)
        
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text=s.name, callback_data=f"csub_{s.id}")] for s in subjects] + [[InlineKeyboardButton(text="⬅️ Назад", callback_data="menu_main")]])
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
        kb.append([InlineKeyboardButton(text=f"{WEEKDAYS[d.weekday()]}, {d.strftime('%d.%m')}", callback_data=f"cday_{i}_{sub_id}")])
    kb.append([InlineKeyboardButton(text="⬅️ Назад", callback_data="create_start")])
    await callback.message.edit_text("Выбери день (на неделю вперёд):", reply_markup=InlineKeyboardMarkup(inline_keyboard=kb))

@router.callback_query(F.data.startswith("cday_"))
async def create_day(callback: CallbackQuery):
    _, days, sub_id = callback.data.split("_")
    kb = []
    hours = list(range(6, 24))
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
    await callback.message.edit_text(f"✅ Создано: {target_local.strftime('%d.%m %H:%M')} ({dur} ч)", reply_markup=back_btn())

# ==========================================
# 2. РАСПИСАНИЕ
# ==========================================
@router.callback_query(F.data == "schedule_start")
async def schedule_start(callback: CallbackQuery):
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == callback.from_user.id))
        user = res.scalar_one_or_none()
        if not user: return await callback.answer("Напиши /start")
    tz = get_user_tz(user)
    now_local = datetime.now(tz)
    kb = []
    for i in range(7):
        d = now_local + timedelta(days=i)
        kb.append([InlineKeyboardButton(text=f"{WEEKDAYS[d.weekday()]}, {d.strftime('%d.%m')}", callback_data=f"view_{i}")])
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
    if not rows: text += "На этот день занятий нет."
    for t, sub_name in rows:
        local_dt = t.start_at.astimezone(tz)
        status = "✅" if t.status == "done" else "⏳"
        text += f"{status} {local_dt.strftime('%H:%M')} — {sub_name or 'Без предмета'} ({t.duration_min} мин)\n"
        
        row_btns = []
        if t.status != "done":
            row_btns.append(InlineKeyboardButton(text=f"✅ Выполнено", callback_data=f"markdone_{t.id}_{days}"))
        row_btns.append(InlineKeyboardButton(text=f"🗑 Удалить", callback_data=f"del_{t.id}_{days}"))
        buttons.append(row_btns)
        
    buttons.append([InlineKeyboardButton(text="⬅️ Назад", callback_data="schedule_start")])
    await callback.message.edit_text(text, parse_mode="HTML", reply_markup=InlineKeyboardMarkup(inline_keyboard=buttons))

@router.callback_query(F.data.startswith("markdone_"))
async def mark_done(callback: CallbackQuery):
    _, task_id, days = callback.data.split("_")
    async with async_session() as db:
        task = await db.get(Task, task_id)
        if task:
            task.status = "done"
            await db.commit()
    await callback.answer("✅ Отмечено!")
    callback.data = f"view_{days}"
    await view_day(callback)

@router.callback_query(F.data.startswith("del_"))
async def delete_task(callback: CallbackQuery):
    _, task_id, days = callback.data.split("_")
    async with async_session() as db:
        task = await db.get(Task, task_id)
        if task:
            await db.delete(task)
            await db.commit()
    await callback.answer("🗑 Удалено!")
    callback.data = f"view_{days}"
    await view_day(callback)

# ==========================================
# 3. СТАТИСТИКА
# ==========================================
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
        if period == "day": query = query.where(Task.start_at >= func.now() - func.make_interval(0, 0, 0, 1))
        elif period == "week": query = query.where(Task.start_at >= func.now() - func.make_interval(0, 0, 0, 7))
        else: query = query.where(Task.start_at >= func.now() - func.make_interval(0, 1))
        
        query = query.join(Task, Task.subject_id == Subject.id).where(Task.user_id == user.id, Task.status == "done").group_by(Subject.id)
        res = await db.execute(query)
        rows = res.all()
        if not rows: return "Нет выполненных задач за этот период."
        total = sum(r.total for r in rows) / 60
        text = f"📊 <b>Статистика</b>\n\nВсего: <b>{round(total, 1)} ч</b>\n\n"
        for r in rows: text += f"• {r.name}: {round(r.total/60, 1)} ч\n"
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

# ==========================================
# 4. МИНИ-ТЕСТЫ
# ==========================================
@router.callback_query(F.data == "test_start")
async def test_start(callback: CallbackQuery):
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=sub, callback_data=f"test_sub_{sub}")] for sub in QUESTIONS.keys()
    ] + [[InlineKeyboardButton(text="⬅️ Назад", callback_data="menu_main")]])
    await callback.message.edit_text("Выбери предмет для мини-теста (5 вопросов):", reply_markup=kb)

@router.callback_query(F.data.startswith("test_sub_"))
async def test_start_subject(callback: CallbackQuery, state: FSMContext):
    sub = callback.data.replace("test_sub_", "")
    q_list = random.sample(QUESTIONS.get(sub, []), min(5, len(QUESTIONS[sub])))
    
    if not q_list:
        return await callback.answer("Вопросы для этого предмета пока не добавлены.", show_alert=True)

    await state.update_data(sub=sub, questions=q_list, current_q=0, score=0)
    await state.set_state(TestStates.answering)
    await send_question(callback.message, state)

async def send_question(message: Message, state: FSMContext):
    data = await state.get_data()
    idx = data["current_q"]
    questions = data["questions"]
    
    if idx >= len(questions):
        # Тест окончен
        score = data["score"]
        total = len(questions)
        await message.edit_text(f"🏁 Тест завершен!\nТвой результат: <b>{score} из {total}</b>", parse_mode="HTML", reply_markup=InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="В меню", callback_data="menu_main")]]))
        await state.clear()
        return

    q = questions[idx]
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=opt, callback_data=f"ans_{opt}")] for opt in q["opts"]
    ])
    await message.edit_text(f"Вопрос {idx+1}/{len(questions)}:\n\n<b>{q['q']}</b>", parse_mode="HTML", reply_markup=kb)

@router.callback_query(F.data.startswith("ans_"), TestStates.answering)
async def handle_answer(callback: CallbackQuery, state: FSMContext):
    answer = callback.data.replace("ans_", "")
    data = await state.get_data()
    q = data["questions"][data["current_q"]]
    
    if answer == q["ans"]:
        await callback.answer("✅ Верно!", show_alert=False)
        await state.update_data(score=data["score"] + 1)
    else:
        await callback.answer(f"❌ Ошибка. Правильно: {q['ans']}", show_alert=True)
        
    await state.update_data(current_q=data["current_q"] + 1)
    await send_question(callback.message, state)

# ==========================================
# 5. УМНЫЕ НАПОМИНАНИЯ (Фоновая функция)
# ==========================================
async def send_smart_reminders():
    async with async_session() as db:
        users = await db.execute(select(User))
        for user in users.scalars().all():
            if not user.telegram_id: continue
            
            # Ищем предметы, по которым не было выполнений > 5 дней
            subs = await db.execute(select(Subject).where(Subject.user_id == user.id))
            for sub in subs.scalars().all():
                last_done = await db.execute(
                    select(func.max(Task.start_at)).where(
                        Task.user_id == user.id, 
                        Task.subject_id == sub.id, 
                        Task.status == "done"
                    )
                )
                last_date = last_done.scalar()
                
                if not last_date or (datetime.now(timezone.utc) - last_date).days >= 5:
                    kb = InlineKeyboardMarkup(inline_keyboard=[
                        [InlineKeyboardButton(text="Запланировать на завтра", callback_data=f"remind_{sub.id}")]
                    ])
                    try:
                        await bot.send_message(user.telegram_id, f"😴 Ты не занимался предметом <b>{sub.name}</b> уже более 5 дней. Пора наверстать!", parse_mode="HTML", reply_markup=kb)
                    except Exception: pass

@router.callback_query(F.data.startswith("remind_"))
async def handle_remind(callback: CallbackQuery):
    sub_id = callback.data.replace("remind_", "")
    async with async_session() as db:
        res = await db.execute(select(User).where(User.telegram_id == callback.from_user.id))
        user = res.scalar_one()
        tz = get_user_tz(user)
        
        target_local = (datetime.now(tz) + timedelta(days=1)).replace(hour=18, minute=0, second=0, microsecond=0)
        dt_utc = target_local.astimezone(timezone.utc)
        
        db.add(Task(user_id=user.id, title="Занятие", start_at=dt_utc, duration_min=60, subject_id=sub_id))
        await db.commit()
    
    await callback.message.edit_text("✅ Отлично! Занятие добавлено на завтра на 18:00.")

# ==========================================
# ВСПОМОГАТЕЛЬНЫЕ
# ==========================================
async def send_notification(telegram_id: int, text: str):
    if bot:
        try: await bot.send_message(telegram_id, text)
        except Exception: pass
