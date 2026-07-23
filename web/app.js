/**
 * Веб-адаптер: текст → артефакты → движок → размеченный разбор.
 *
 * Ни одного сетевого запроса после загрузки страницы.
 * Проверяемый текст не покидает вкладку.
 */

import {
  Action, Actor, ArtifactKind, artifact, intent,
  Engine, InMemorySink, policy, ScamReportsRule,
} from './vendor/guardrails/index.js';
import { extract } from './extract.js';
import { createPatternRule, findSpans } from './patterns.js';

const STRINGS = {
  en: {
    tagline: 'Check a suspicious message without sending it anywhere.',
    lead: 'Paste a message you are not sure about. It is checked here, in this tab — nothing you paste leaves your device.',
    placeholder: 'Paste the message here…',
    check: 'Check this message',
    examplesLabel: 'Or try one:',
    empty: 'Paste a message first, then run the check.',
    headline: {
      block: 'This looks like a scam',
      confirm: 'Some warning signs here',
      allow: 'No known warning signs',
    },
    advice: {
      block: 'Do not send money and do not share any codes. If this claims to be your bank, end the conversation and call the number printed on your card.',
      confirm: 'Slow down. Verify through a channel you found yourself — a number from the official site or the back of your card — not one they gave you.',
      allow: 'This looks for patterns already known to us, so a new approach can pass it unnoticed. Your own doubt is still worth acting on.',
    },
    whatsHappening: 'What is happening in this message',
    whatToDo: 'What to do now',
    alsoFound: 'Also found in the message',
    technical: 'Technical detail',
    kinds: { url: 'link', domain: 'domain', address: 'wallet address', phone: 'phone number' },
    reportsNote: 'appears in a known-reports list',
    privacy: 'Runs entirely in your browser. No requests, no logging, no account.',
    hint: 'Click a highlighted phrase to jump to its explanation.',
  },
  ru: {
    tagline: 'Проверьте подозрительное сообщение, никуда его не отправляя.',
    lead: 'Вставьте сообщение, в котором сомневаетесь. Проверка идёт здесь, в этой вкладке — текст не покидает ваше устройство.',
    placeholder: 'Вставьте сообщение сюда…',
    check: 'Проверить сообщение',
    examplesLabel: 'Или попробуйте пример:',
    empty: 'Сначала вставьте сообщение, потом запускайте проверку.',
    headline: {
      block: 'Очень похоже на мошенничество',
      confirm: 'Есть тревожные признаки',
      allow: 'Известных признаков не нашли',
    },
    advice: {
      block: 'Не переводите деньги и не сообщайте коды. Если собеседник представляется банком — прекратите разговор и позвоните сами по номеру с обратной стороны карты.',
      confirm: 'Не торопитесь. Проверьте через канал, который нашли сами — номер с официального сайта или с карты, а не тот, что прислали вам.',
      allow: 'Проверка ищет уже известные нам приёмы, поэтому новая схема может пройти незамеченной. Если вам всё равно не по себе — это повод остановиться.',
    },
    whatsHappening: 'Что происходит в этом сообщении',
    whatToDo: 'Что делать сейчас',
    alsoFound: 'Ещё найдено в сообщении',
    technical: 'Технические детали',
    kinds: { url: 'ссылка', domain: 'домен', address: 'адрес кошелька', phone: 'телефон' },
    reportsNote: 'встречается в реестре жалоб',
    privacy: 'Работает полностью в браузере. Ни запросов, ни логов, ни аккаунта.',
    hint: 'Нажмите на подсвеченную фразу, чтобы перейти к объяснению.',
  },
};

const EXAMPLES = {
  en: [
    {
      label: 'Bank impersonation',
      text: 'This is the fraud department at your bank. Suspicious activity detected on your card and your account has been suspended. Act now — confirm the code we sent you and do not tell anyone, this is a confidential investigation.',
    },
    {
      label: 'Gift card request',
      text: 'Hi, it\'s your manager. I\'m in a meeting and need a favour urgently. Please buy 4 Apple gift cards, scratch off the back and send me the code on the card. I\'ll reimburse you today. Keep this confidential for now.',
    },
    {
      label: 'Crypto airdrop',
      text: 'Congratulations! You are eligible for a free airdrop. Connect your wallet to receive your tokens at token-claim-portal.xyz before it\'s too late. Guaranteed returns for early holders. Send to 0x9f2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d',
    },
  ],
  ru: [
    {
      label: 'Звонок «из банка»',
      text: 'Здравствуйте, служба безопасности банка. Зафиксирована подозрительная операция, счёт заблокирован. Срочно переведите средства на безопасный счёт и продиктуйте код из смс. Никому не сообщайте, это тайна следствия.',
    },
    {
      label: 'Удалённый доступ',
      text: 'Вам звонит специалист банка. Для отмены операции установите приложение AnyDesk, я помогу настроить. Не кладите трубку, оставайтесь на линии.',
    },
    {
      label: 'Раздача монет',
      text: 'Бесплатная раздача! Подключите кошелек для получения токенов на sber-airdrop.top. Гарантированный доход для первых участников. Успейте, осталось несколько минут.',
    },
  ],
};

const state = {
  lang: 'en',
  datasets: {},
  knownBad: {},
  strings: STRINGS.en,
};

const $ = (id) => document.getElementById(id);

async function loadLanguage(lang) {
  if (!state.datasets[lang]) {
    const response = await fetch(`/data/patterns_${lang}.json`);
    state.datasets[lang] = await response.json();
  }
  state.lang = lang;
  state.strings = STRINGS[lang];
  document.documentElement.lang = lang;
}

async function loadKnownBad() {
  try {
    const response = await fetch('/data/known_bad.json');
    const raw = await response.json();
    state.knownBad = Object.fromEntries(
      Object.entries(raw.entries ?? {}).map(([k, v]) => [k.toLowerCase(), Number(v)]),
    );
  } catch {
    state.knownBad = {};
  }
}

function severityTier(severity) {
  if (severity >= 0.7) return 'high';
  if (severity >= 0.45) return 'mid';
  return 'low';
}

function analyse(text) {
  const dataset = state.datasets[state.lang];
  const rule = createPatternRule(dataset);

  const artifacts = extract(text).map((a) => {
    const reports = state.knownBad[a.value.toLowerCase()];
    return reports ? artifact(a.kind, a.value, { scam_reports: reports }) : a;
  });

  const engine = new Engine([rule, new ScamReportsRule()], policy(), new InMemorySink());
  const verdict = engine.evaluate(intent({
    actor: Actor.COUNTERPARTY,
    action: Action.INBOUND_MESSAGE,
    artifacts,
    source: 'web',
  }));

  return { verdict, artifacts, groups: rule.groups };
}

function renderSpecimen(text, groups, container) {
  container.textContent = '';
  const byId = new Map(groups.map((g) => [g.id, g]));
  const spans = findSpans(text, groups);

  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      container.append(document.createTextNode(text.slice(cursor, span.start)));
    }
    const group = byId.get(span.groupId);
    const mark = document.createElement('button');
    mark.type = 'button';
    mark.className = `mark mark--${severityTier(group.severity)}`;
    mark.dataset.group = span.groupId;
    mark.textContent = text.slice(span.start, span.end);
    mark.title = group.title;
    mark.addEventListener('click', () => {
      const card = document.querySelector(`[data-card="${span.groupId}"]`);
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.remove('finding--flash');
      void card.offsetWidth;
      card.classList.add('finding--flash');
    });
    container.append(mark);
    cursor = span.end;
  }
  if (cursor < text.length) container.append(document.createTextNode(text.slice(cursor)));
}

function renderFindings(verdict, groups, container) {
  container.textContent = '';
  const byId = new Map(groups.map((g) => [g.id, g]));

  for (const sig of [...verdict.signals].sort((a, b) => b.severity - a.severity)) {
    const groupId = sig.code.startsWith('pressure_dataset:') ? sig.code.split(':')[1] : null;
    const group = groupId ? byId.get(groupId) : null;

    const card = document.createElement('article');
    card.className = `finding finding--${severityTier(sig.severity)}`;
    if (groupId) card.dataset.card = groupId;

    const title = document.createElement('h3');
    title.className = 'finding__title';
    title.textContent = group ? group.title : sig.code;

    const body = document.createElement('p');
    body.className = 'finding__body';
    body.textContent = group ? group.explanation : sig.explanation;

    card.append(title, body);
    container.append(card);
  }
}

function renderArtifacts(artifacts, container, section) {
  const listed = artifacts.filter((a) => a.kind !== ArtifactKind.TEXT);
  section.hidden = listed.length === 0;
  container.textContent = '';

  for (const a of listed) {
    const row = document.createElement('li');
    row.className = 'artifact';

    const kind = document.createElement('span');
    kind.className = 'artifact__kind';
    kind.textContent = state.strings.kinds[a.kind] ?? a.kind;

    const value = document.createElement('span');
    value.className = 'artifact__value';
    value.textContent = a.value;

    row.append(kind, value);

    if (a.facts.scam_reports) {
      const note = document.createElement('span');
      note.className = 'artifact__note';
      note.textContent = state.strings.reportsNote;
      row.append(note);
    }
    container.append(row);
  }
}

function run() {
  const text = $('input').value.trim();
  const result = $('result');
  const s = state.strings;

  if (!text) {
    $('status').textContent = s.empty;
    result.hidden = true;
    return;
  }
  $('status').textContent = '';

  const { verdict, artifacts, groups } = analyse(text);
  const level = verdict.decision;

  result.hidden = false;
  result.className = `result result--${level}`;
  $('verdict-headline').textContent = s.headline[level];
  $('advice').textContent = s.advice[level];

  renderSpecimen(text, groups, $('specimen'));
  renderFindings(verdict, groups, $('findings'));
  renderArtifacts(artifacts, $('artifacts'), $('artifacts-section'));

  const hasSignals = verdict.signals.length > 0;
  $('findings-section').hidden = !hasSignals;
  $('specimen-section').hidden = !hasSignals;

  $('technical-body').textContent = JSON.stringify({
    decision: verdict.decision,
    score: Number(verdict.score.toFixed(4)),
    signals: verdict.signals.map((x) => ({ code: x.code, severity: Number(x.severity.toFixed(3)) })),
  }, null, 2);

  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function paintStatic() {
  const s = state.strings;
  $('tagline').textContent = s.tagline;
  $('lead').textContent = s.lead;
  $('input').placeholder = s.placeholder;
  $('input').setAttribute('aria-label', s.placeholder);
  $('check').textContent = s.check;
  $('examples-label').textContent = s.examplesLabel;
  $('whats-happening').textContent = s.whatsHappening;
  $('what-to-do').textContent = s.whatToDo;
  $('also-found').textContent = s.alsoFound;
  $('technical-summary').textContent = s.technical;
  $('privacy').textContent = s.privacy;
  $('hint').textContent = s.hint;

  const box = $('examples');
  box.textContent = '';
  for (const example of EXAMPLES[state.lang]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'example';
    button.textContent = example.label;
    button.addEventListener('click', () => {
      $('input').value = example.text;
      run();
    });
    box.append(button);
  }
}

async function switchLanguage(lang) {
  await loadLanguage(lang);
  paintStatic();
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === lang));
  }
  $('result').hidden = true;
  $('status').textContent = '';
}

async function init() {
  await Promise.all([loadLanguage('en'), loadKnownBad()]);
  paintStatic();
  $('check').addEventListener('click', run);
  $('input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) run();
  });
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.addEventListener('click', () => switchLanguage(button.dataset.lang));
  }
  document.querySelector('[data-lang="en"]').setAttribute('aria-pressed', 'true');

  // Офлайн-режим. Регистрация не влияет на первую загрузку:
  // всё нужное уже здесь, воркер лишь готовит следующий визит.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Локально по file:// воркеры недоступны — это нормально.
    });
  }
}

init();
