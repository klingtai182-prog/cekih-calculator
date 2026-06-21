/* ============================================================
   SCORE CEKIH — Service Worker — Sadewa Corp
   ============================================================ */
'use strict';

const CACHE_NAME = 'score-cekih-v10';

const BASE = '';

const ASSETS_TO_CACHE = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/style.css',
  BASE + '/app.js',
  BASE + '/manifest.json',

  BASE + '/images/background.png',
  BASE + '/images/joker-192.png',
  BASE + '/images/joker-512.png',
  BASE + '/images/border_1.png',
  BASE + '/images/border_2.png',
  BASE + '/images/border_3.png',
  BASE + '/images/border_4.png',
  BASE + '/images/animal_1.png',
  BASE + '/images/animal_2.png',
  BASE + '/images/animal_3.png',
  BASE + '/images/animal_4.png',

  BASE + '/audio/casino_bg.mp3',
  BASE + '/audio/mulai_dari_0_ya_bapak.wav',
  BASE + '/audio/kok_minus_terus_sih_gamau_menang.wav',
  BASE + '/audio/klik.wav',

  BASE + '/video/dragon.mp4',
  BASE + '/video/tiger.mp4',
  BASE + '/video/eagle.mp4',
  BASE + '/video/cobra.mp4'
];

// INSTALL — cache all assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache one by one to avoid failing entire install if one asset is missing
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url =>
          cache.add(url).catch(err => {
            console.warn('[SW] Failed to cache:', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ACTIVATE — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// FETCH — cache-first strategy with network fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and non-http requests
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        // Cache valid responses
        if (response && response.status === 200 && response.type !== 'opaque') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Return offline fallback for HTML
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/index.html');
        }
      });
    })
  );
});