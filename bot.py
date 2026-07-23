"""Бот-страж: пересылаешь подозрительное — получаешь разбор.

Приватность: тексты сообщений не сохраняются. В лог идёт только
решение и типы найденных артефактов, без содержимого.
"""

from __future__ import annotations

import asyncio
import logging
import os

from aiogram import Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import CommandStart
from aiogram.types import Message

from guardrails import Action, Actor, Engine, InMemorySink, Intent, Policy
from guardrails.rules import FreshDomainRule, ScamReportsRule
from guardian import DatasetPressureRule, enrich, extract, render

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("guardian")

GREETING = (
    "Привет. Я помогаю разобраться, похоже ли сообщение на мошенничество.\n\n"
    "<b>Как пользоваться:</b> перешлите мне подозрительное сообщение, "
    "или пришлите ссылку, адрес кошелька, номер телефона.\n\n"
    "Я разберу, какие признаки в нём есть, и объясню человеческим языком.\n\n"
    "<i>Я не храню тексты ваших сообщений. И я не даю гарантий — "
    "только подсказки, решение всегда за вами.</i>"
)

EMPTY = (
    "Не нашёл, что проверить. Перешлите сообщение целиком "
    "или пришлите текст, ссылку либо адрес кошелька."
)

engine = Engine(
    rules=(DatasetPressureRule("ru"), FreshDomainRule(), ScamReportsRule()),
    policy=Policy(),
    sink=InMemorySink(),
)

dp = Dispatcher()


@dp.message(CommandStart())
async def on_start(message: Message) -> None:
    await message.answer(GREETING)


@dp.message(F.text | F.caption)
async def on_check(message: Message) -> None:
    text = message.text or message.caption or ""
    artifacts = extract(text)

    if len(artifacts) <= 1 and len(text.strip()) < 12:
        await message.answer(EMPTY)
        return

    artifacts = await enrich(artifacts)
    intent = Intent(
        actor=Actor.COUNTERPARTY,
        action=Action.INBOUND_MESSAGE,
        artifacts=tuple(artifacts),
        source="telegram",
    )
    verdict = engine.evaluate(intent)

    # В лог — только форма, не содержимое.
    kinds = sorted({a.kind.value for a in artifacts})
    log.info("decision=%s score=%.2f kinds=%s", verdict.decision.value, verdict.score, kinds)

    await message.answer(render(verdict))


@dp.message()
async def on_other(message: Message) -> None:
    await message.answer(EMPTY)


async def main() -> None:
    token = os.getenv("BOT_TOKEN")
    if not token:
        raise SystemExit("Не задан BOT_TOKEN. Скопируйте .env.example в .env и заполните.")

    bot = Bot(token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    log.info("Страж запущен")
    await dp.start_polling(bot)


if __name__ == "__main__":
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass
    asyncio.run(main())
