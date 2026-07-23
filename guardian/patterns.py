"""Правило на основе открытого датасета.

Ядро везёт минимальный набор маркеров. Продукт подгружает
расширяемый датасет — он и есть открытый вклад в экосистему.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from guardrails import Action, ArtifactKind, Intent, Signal

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


@dataclass(frozen=True)
class PatternGroup:
    id: str
    title: str
    explanation: str
    severity: float
    markers: tuple[str, ...]

    def matches(self, lowered: str) -> tuple[str, ...]:
        return tuple(m for m in self.markers if m in lowered)


def load_groups(language: str = "ru") -> tuple[PatternGroup, ...]:
    path = DATA_DIR / f"patterns_{language}.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    return tuple(
        PatternGroup(
            id=g["id"],
            title=g["title"],
            explanation=g["explanation"],
            severity=float(g["severity"]),
            markers=tuple(m.lower() for m in g["markers"]),
        )
        for g in raw["groups"]
    )


class DatasetPressureRule:
    """Один сигнал на группу — не на каждый маркер.

    Иначе три синонима подряд накручивали бы score втрое,
    хотя это одна и та же уловка.
    """

    code = "pressure_dataset"

    def __init__(self, language: str = "ru") -> None:
        self.groups = load_groups(language)

    def applies_to(self, intent: Intent) -> bool:
        return intent.action in (Action.INBOUND_MESSAGE, Action.INBOUND_CALL)

    def evaluate(self, intent: Intent) -> list[Signal]:
        texts = [a.value.lower() for a in intent.artifacts_of(ArtifactKind.TEXT)]
        if not texts:
            return []
        blob = "\n".join(texts)

        signals: list[Signal] = []
        for group in self.groups:
            hits = group.matches(blob)
            if not hits:
                continue
            # Несколько маркеров одной группы — чуть выше уверенность, но не втрое.
            severity = min(0.9, group.severity * (1 + 0.1 * (len(hits) - 1)))
            signals.append(
                Signal(
                    code=f"{self.code}:{group.id}",
                    severity=severity,
                    explanation=f"{group.title}. {group.explanation}",
                    source="dataset",
                )
            )
        return signals
