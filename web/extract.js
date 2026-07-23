/**
 * Достаём из текста то, что можно проверить.
 * Порт guardian/extract.py — семантика та же.
 */

import { artifact, ArtifactKind } from './vendor/guardrails/index.js';

const URL_RE = /\bhttps?:\/\/[^\s<>"'()]+/gi;
const BARE_DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b/gi;
const EVM_RE = /\b0x[a-fA-F0-9]{40}\b/g;
const TRON_RE = /\bT[1-9A-HJ-NP-Za-km-z]{33}\b/g;
const BTC_RE = /\b(?:bc1[ac-hj-np-z02-9]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g;
const PHONE_RE = /(?:\+\d{1,3}|\b8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}\b/g;

const NOT_A_TLD = new Set([
  'py', 'js', 'ts', 'md', 'txt', 'json', 'toml', 'yml', 'yaml', 'png', 'jpg',
  'jpeg', 'gif', 'pdf', 'zip', 'exe', 'csv', 'html', 'css', 'sh', 'log',
]);

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function extract(text) {
  if (!text || !text.trim()) return [];

  const out = [artifact(ArtifactKind.TEXT, text)];
  const seen = new Set();

  const add = (kind, value) => {
    const key = `${kind}:${value.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(artifact(kind, value));
  };

  const urls = text.match(URL_RE) ?? [];
  for (const raw of urls) {
    const url = raw.replace(/[.,;:!?]+$/, '');
    add(ArtifactKind.URL, url);
    const host = hostOf(url);
    if (host) add(ArtifactKind.DOMAIN, host);
  }

  const residual = text.replace(URL_RE, ' ');
  for (const candidate of residual.match(BARE_DOMAIN_RE) ?? []) {
    const tld = candidate.split('.').pop().toLowerCase();
    if (NOT_A_TLD.has(tld)) continue;
    add(ArtifactKind.DOMAIN, candidate.toLowerCase());
  }

  for (const re of [EVM_RE, TRON_RE, BTC_RE]) {
    for (const match of text.match(re) ?? []) add(ArtifactKind.ADDRESS, match);
  }

  for (const match of text.match(PHONE_RE) ?? []) {
    add(ArtifactKind.PHONE, match.replace(/[\s\-()]/g, ''));
  }

  return out;
}
