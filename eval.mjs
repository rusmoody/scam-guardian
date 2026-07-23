/**
 * Оценка качества на размеченном корпусе data/evals.json.
 *
 * Запуск:  node eval.mjs
 * Выход 1, если пропущен скам или есть ложная тревога — пригодно для CI.
 */

import { readFileSync } from 'node:fs';
import { extract } from './web/extract.js';
import { createPatternRule } from './web/patterns.js';
import { Action, Actor, Engine, InMemorySink, intent, policy, ScamReportsRule }
  from './web/vendor/guardrails/index.js';

const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const suite = load('./data/evals.json');
const engines = {};

for (const lang of ['ru', 'en']) {
  const rule = createPatternRule(load(`./data/patterns_${lang}.json`));
  engines[lang] = new Engine([rule, new ScamReportsRule()], policy(), new InMemorySink());
}

const misses = [];
const falseAlarms = [];
let caught = 0, quiet = 0;
const flagged = suite.cases.filter((c) => c.expect === 'flag').length;
const clean = suite.cases.length - flagged;

for (const c of suite.cases) {
  const verdict = engines[c.lang].evaluate(intent({
    actor: Actor.COUNTERPARTY,
    action: Action.INBOUND_MESSAGE,
    artifacts: extract(c.text),
  }));
  const raised = verdict.decision !== 'allow';

  if (c.expect === 'flag' && raised) caught++;
  else if (c.expect === 'flag') misses.push(c);
  else if (!raised) quiet++;
  else falseAlarms.push({ ...c, signals: verdict.signals.map((s) => s.code) });
}

console.log(`скам-кейсы:  поймано ${caught}/${flagged}`);
console.log(`чистые:      тишина  ${quiet}/${clean}`);

if (misses.length) {
  console.log('\nПРОПУЩЕНО:');
  for (const c of misses) console.log(`  [${c.lang}] ${c.text}`);
}
if (falseAlarms.length) {
  console.log('\nЛОЖНЫЕ ТРЕВОГИ:');
  for (const c of falseAlarms) console.log(`  [${c.lang}] ${c.text}\n         сработало: ${c.signals.join(', ')}`);
}

process.exit(misses.length || falseAlarms.length ? 1 : 0);
