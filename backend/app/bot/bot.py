import random
from aiogram import Bot, Dispatcher, Router
from aiogram.filters import CommandStart
from aiogram.types import Message
from sqlalchemy import select
from app.config import settings
from app.db import async_session
from app.models import User, TelegramLinkCode

router = Router()
bot = Bot(token=settings.telegram_bot_token) if settings.telegram_bot_token else None
dp = Dispatcher()
dp.include_router(router)

@router.message(CommandStart())
async def cmd_start(message: Message):
    async with async_session() as db:
        # Проверяем, не привязан ли уже этот Telegram к кому-то
        res = await db.execute(select(User).where(User.telegram_id == message.from_user.id))
        if res.scalar_one_or_none():
            await message.answer("✅ Этот Telegram уже привязан к аккаунту на сайте ЕГЭ-Планер.")
            return
            
        # Генерируем уникальный 6-значный код
        code = str(random.randint(100000, 999999))
        
        # На всякий случай проверяем, нет ли уже такого кода в базе
        existing_code = await db.execute(select(TelegramLinkCode).where(TelegramLinkCode.code == code))
        if existing_code.scalar_one_or_none():
            code = str(random.randint(100000, 999999))

        new_code = TelegramLinkCode(code=code, telegram_id=message.from_user.id)
        db.add(new_code)
        await db.commit()

        await message.answer(
            f"👋 Привет! Твой код для привязки Telegram к аккаунту:\n\n"
            f"<b>{code}</b>\n\n"
            f"Введи его в настройках на сайте ЕГЭ-Планер.",
            parse_mode="HTML"
        )

async def send_notification(telegram_id: int, text: str):
    if bot:
        try:
            await bot.send_message(telegram_id, text)
        except Exception as e:
            print(f"Ошибка отправки в Telegram: {e}")
