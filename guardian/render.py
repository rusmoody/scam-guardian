"""Превращаем Verdict в сообщение для человека.

Правило языка: никогда не утверждаем "безопасно". Максимум —
"признаков не нашёл", и сразу оговорка, что это не гарантия.
"""

from __future__ import annotations

from guardrails import Decision, Verdict

HEADLINE = {
    Decision.BLOCK: "🔴 <b>Очень похоже на мошенничество</b>",
    Decision.CONFIRM: "🟡 <b>Есть тревожные признаки</b>",
    Decision.ALLOW: "⚪️ <b>Явных признаков не нашёл</b>",
}

ADVICE = {
    Decision.BLOCK: (
        "Не переводите деньги и не сообщайте коды. Если речь про банк — "
        "положите трубку и позвоните сами по номеру с обратной стороны карты."
    ),
    Decision.CONFIRM: (
        "Не торопитесь. Проверьте собеседника по официальному каналу, "
        "который нашли сами, а не по тому, что прислали вам."
    ),
    Decision.ALLOW: (
        "Проверка видит только известные признаки — новые схемы она может "
        "не узнать. Решение остаётся за вами."
    ),
}

FOOTER = (
    "<i>Это подсказка, а не заключение. Если сомневаетесь — "
    "посоветуйтесь с тем, кому доверяете.</i>"
)


def render(verdict: Verdict) -> str:
    lines = [HEADLINE[verdict.decision], ""]

    if verdict.signals:
        lines.append("<b>Что насторожило:</b>")
        for signal in verdict.sorted_signals:
            lines.append(f"• {signal.explanation}")
        lines.append("")

    lines.append(ADVICE[verdict.decision])
    lines.append("")
    lines.append(FOOTER)
    return "\n".join(lines)
