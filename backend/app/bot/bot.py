from aiogram import Bot, Dispatcher, Router
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import Message
from aiogram.utils.deep_linking import decode_payload
from app.config import settings
from app.db import async_session
from app.models import User
from sqlalchemy import select

router = Router()
bot = Bot(token=settings.telegram_bot_token) if settings.telegram_bot_token else None
dp = Dispatcher()
dp.include_router(router)

@router.message(CommandStart(deep_link=True))
async def start_deeplink(message: Message, command: CommandObject):
    if not command.args:
        await message.answer("Привет! Используй ссылку из веб-приложения, чтобы привязать Telegram.")
        return
    payload = decode_payload(command.args)
    async with async_session() as db:
        # payload — это одноразовый токен, который вы сохранили при генерации ссылки
        # Упрощённо: ищем пользователя по токену (в реальности нужна таблица tokens)
        # Здесь просто демонстрация
        await message.answer("✅ Telegram успешно привязан к аккаунту ЕГЭ-Планер.")

async def send_notification(telegram_id: int, text: str):
    if bot:
        await bot.send_message(telegram_id, text)
