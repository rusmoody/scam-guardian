"""Обогащение артефактов внешними фактами.

Ядро в сеть не ходит — это делает адаптер и кладёт результат
в Artifact.facts. Здесь же живёт вся деградация: если источник
недоступен, артефакт просто остаётся без факта, а не роняет проверку.
"""

from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from guardrails import Artifact, ArtifactKind

DENYLIST_PATH = Path(__file__).resolve().parents[1] / "data" / "known_bad.json"
RDAP_URL = "https://rdap.org/domain/{domain}"
TIMEOUT = 6.0


def _load_denylist() -> dict[str, int]:
    """value -> количество подтверждённых жалоб."""
    if not DENYLIST_PATH.exists():
        return {}
    raw = json.loads(DENYLIST_PATH.read_text(encoding="utf-8"))
    return {k.lower(): int(v) for k, v in raw.get("entries", {}).items()}


_DENYLIST = _load_denylist()


async def _domain_age_days(domain: str) -> int | None:
    """Возраст домена через RDAP. Без ключей и регистрации."""
    try:
        import aiohttp
    except ImportError:
        return None

    try:
        timeout = aiohttp.ClientTimeout(total=TIMEOUT)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(RDAP_URL.format(domain=domain)) as response:
                if response.status != 200:
                    return None
                data = await response.json(content_type=None)
    except Exception:
        return None

    for event in data.get("events", []):
        if event.get("eventAction") != "registration":
            continue
        stamp = event.get("eventDate", "")
        stamp = re.sub(r"Z$", "+00:00", stamp)
        try:
            registered = datetime.fromisoformat(stamp)
        except ValueError:
            return None
        if registered.tzinfo is None:
            registered = registered.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - registered).days
    return None


async def enrich(artifacts: list[Artifact]) -> list[Artifact]:
    """Возвращает НОВЫЙ список артефактов с заполненным facts."""
    domains = [a for a in artifacts if a.kind is ArtifactKind.DOMAIN]
    ages = await asyncio.gather(
        *(_domain_age_days(a.value) for a in domains), return_exceptions=True
    )
    age_by_domain = {
        a.value: age
        for a, age in zip(domains, ages)
        if isinstance(age, int)
    }

    enriched: list[Artifact] = []
    for artifact in artifacts:
        facts = dict(artifact.facts)

        reports = _DENYLIST.get(artifact.value.lower())
        if reports:
            facts["scam_reports"] = reports

        if artifact.kind is ArtifactKind.DOMAIN and artifact.value in age_by_domain:
            facts["domain_age_days"] = age_by_domain[artifact.value]

        enriched.append(Artifact(artifact.kind, artifact.value, facts))
    return enriched
