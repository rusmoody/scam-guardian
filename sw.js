/**
 * Сервис-воркер.
 *
 * Задача одна: после первого визита приложение должно работать
 * вообще без сети. Это не оптимизация — для человека, которому
 * прямо сейчас звонит «служба безопасности», связь может быть
 * плохой, а телефон дешёвым.
 *
 * Стратегия — cache-first: ничего из закешированного в сеть не ходит.
 * Версию поднимаем при любом изменении файлов ниже.
 */

const VERSION = 'guardian-v1';

const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/web/app.js',
  '/web/extract.js',
  '/web/patterns.js',
  '/web/vendor/guardrails/index.js',
  '/web/vendor/guardrails/intent.js',
  '/web/vendor/guardrails/verdict.js',
  '/web/vendor/guardrails/policy.js',
  '/web/vendor/guardrails/rules.js',
  '/web/vendor/guardrails/engine.js',
  '/data/patterns_en.json',
  '/data/patterns_ru.json',
  '/data/known_bad.json',
  '/web/icons/icon-192.png',
  '/web/icons/icon-512.png',
  '/web/icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // Отдельными запросами: один недоступный файл не должен
      // ронять установку целиком.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;

      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          // Офлайн и нет в кеше: для перехода по адресу отдаём страницу.
          if (request.mode === 'navigate') return caches.match('/index.html');
          throw new Error('offline and not cached');
        });
    }),
  );
});
