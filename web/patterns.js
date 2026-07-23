/**
 * Правило на основе открытого датасета + поиск позиций для подсветки.
 *
 * Само правило ведёт себя точно как guardian/patterns.py: один сигнал
 * на группу, эскалация min(0.9, severity * (1 + 0.1 * (hits - 1))).
 * Позиции считаются отдельно — они нужны только интерфейсу.
 */

import { Action, ArtifactKind, artifactsOf, signal } from './vendor/guardrails/index.js';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createPatternRule(dataset) {
  const groups = dataset.groups.map((g) => ({
    id: g.id,
    title: g.title,
    explanation: g.explanation,
    severity: Number(g.severity),
    markers: g.markers,
  }));

  return {
    code: 'pressure_dataset',
    groups,

    appliesTo(intentObj) {
      return intentObj.action === Action.INBOUND_MESSAGE
        || intentObj.action === Action.INBOUND_CALL;
    },

    evaluate(intentObj) {
      const texts = artifactsOf(intentObj, ArtifactKind.TEXT).map((a) => a.value.toLowerCase());
      if (texts.length === 0) return [];
      const blob = texts.join('\n');

      const out = [];
      for (const group of groups) {
        const hits = group.markers.filter((m) => blob.includes(m.toLowerCase()));
        if (hits.length === 0) continue;
        out.push(signal({
          code: `pressure_dataset:${group.id}`,
          severity: Math.min(0.9, group.severity * (1 + 0.1 * (hits.length - 1))),
          explanation: `${group.title}. ${group.explanation}`,
          source: 'dataset',
        }));
      }
      return out;
    },
  };
}

/**
 * Где именно в тексте сработали маркеры. Регулярка идёт по ОРИГИНАЛУ
 * с флагом i — так индексы верны даже там, где регистр меняет длину строки.
 * @returns {Array<{start: number, end: number, groupId: string}>}
 */
export function findSpans(text, groups) {
  const spans = [];
  for (const group of groups) {
    for (const marker of group.markers) {
      const re = new RegExp(escapeRe(marker), 'gi');
      let match;
      while ((match = re.exec(text)) !== null) {
        spans.push({ start: match.index, end: match.index + match[0].length, groupId: group.id });
        if (match.index === re.lastIndex) re.lastIndex += 1;
      }
    }
  }

  // Перекрытия схлопываем: побеждает более длинное совпадение.
  spans.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const merged = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start < last.end) continue;
    merged.push(span);
  }
  return merged;
}
