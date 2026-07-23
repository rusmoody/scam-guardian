"""Достаём из текста сообщения то, что можно проверить.

Только артефакты схемы: ссылки, домены, адреса кошельков, телефоны, сам текст.
Личности не извлекаем и не ищем — см. принцип "artifacts, not identities".
"""

from __future__ import annotations

import re
from urllib.parse import urlparse

from guardrails import Artifact, ArtifactKind

URL_RE = re.compile(r"\bhttps?://[^\s<>\"'()]+", re.IGNORECASE)
BARE_DOMAIN_RE = re.compile(
    r"\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b", re.IGNORECASE
)
EVM_RE = re.compile(r"\b0x[a-fA-F0-9]{40}\b")
TRON_RE = re.compile(r"\bT[1-9A-HJ-NP-Za-km-z]{33}\b")
BTC_RE = re.compile(
    r"\b(?:bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b"
)
PHONE_RE = re.compile(r"(?:\+7|\b8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}\b")

# Расширения файлов и подобное — чтобы "demo.py" не уехало в домены.
NOT_A_TLD = {
    "py", "js", "ts", "md", "txt", "json", "toml", "yml", "yaml", "png", "jpg",
    "jpeg", "gif", "pdf", "zip", "exe", "csv", "html", "css", "sh", "log",
}


def _domain_of(url: str) -> str | None:
    try:
        host = urlparse(url).hostname
    except ValueError:
        return None
    return host.lower() if host else None


def extract(text: str) -> list[Artifact]:
    """Возвращает артефакты, найденные в тексте. Порядок стабильный."""
    if not text or not text.strip():
        return []

    artifacts: list[Artifact] = [Artifact(ArtifactKind.TEXT, text)]
    seen: set[str] = set()

    def add(kind: ArtifactKind, value: str) -> None:
        key = f"{kind.value}:{value.lower()}"
        if key not in seen:
            seen.add(key)
            artifacts.append(Artifact(kind, value))

    # Ссылки целиком + их домены.
    urls = URL_RE.findall(text)
    for url in urls:
        add(ArtifactKind.URL, url.rstrip(".,;:!?"))
        domain = _domain_of(url)
        if domain:
            add(ArtifactKind.DOMAIN, domain)

    # Домены, написанные без схемы. Вырезаем уже найденные ссылки,
    # чтобы не разбирать их второй раз.
    residual = URL_RE.sub(" ", text)
    for candidate in BARE_DOMAIN_RE.findall(residual):
        tld = candidate.rsplit(".", 1)[-1].lower()
        if tld in NOT_A_TLD:
            continue
        add(ArtifactKind.DOMAIN, candidate.lower())

    for pattern, kind in (
        (EVM_RE, ArtifactKind.ADDRESS),
        (TRON_RE, ArtifactKind.ADDRESS),
        (BTC_RE, ArtifactKind.ADDRESS),
    ):
        for match in pattern.findall(text):
            add(kind, match)

    for match in PHONE_RE.findall(text):
        add(ArtifactKind.PHONE, re.sub(r"[\s\-()]", "", match))

    return artifacts
