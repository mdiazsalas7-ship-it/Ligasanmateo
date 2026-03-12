// ─────────────────────────────────────────────────────────────
// /public/firebase-messaging-sw.js
// Service Worker unificado:
//   - PWA: caché del app shell para funcionar offline
//   - FCM: notificaciones push en background
// ─────────────────────────────────────────────────────────────

importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey:            'AIzaSyAM1IP1iFrWgxvtaskzu40GdNI6cIP5oS8',
    authDomain:        'liga-de-san-mateo.firebaseapp.com',
    projectId:         'liga-de-san-mateo',
    storageBucket:     'liga-de-san-mateo.firebasestorage.app',
    messagingSenderId: '71674005364',
    appId:             '1:71674005364:web:6d6e93746ac430b77c4e21',
});

const messaging = firebase.messaging();
const LOGO_LIGA = 'https://i.postimg.cc/FKgNmFpv/Whats_App_Image_2026_01_25_at_12_07_36_AM.jpg';

// ─────────────────────────────────────────────────────────────
// CACHE — App Shell (recursos que funcionan offline)
// ─────────────────────────────────────────────────────────────
const CACHE_NAME   = 'limebal-v1';
const OFFLINE_URL  = '/offline.html';

// Recursos que se cachean al instalar el SW
const APP_SHELL = [
    '/',
    '/offline.html',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/apple-touch-icon.png',
];

// ─────────────────────────────────────────────────────────────
// INSTALL — guarda el app shell en caché
// ─────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
    );
});

// ─────────────────────────────────────────────────────────────
// ACTIVATE — limpia cachés viejas
// ─────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(k => k !== CACHE_NAME)
                    .map(k => caches.delete(k))
            )
        ).then(() => clients.claim())
    );
});

// ─────────────────────────────────────────────────────────────
// FETCH — estrategia: Network first, fallback a caché
// Para Firestore/Firebase: siempre red (datos en tiempo real)
// Para assets estáticos: caché si la red falla
// ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Firestore, Storage, FCM → siempre red, nunca caché
    if (
        url.hostname.includes('firestore.googleapis.com') ||
        url.hostname.includes('firebasestorage.googleapis.com') ||
        url.hostname.includes('fcm.googleapis.com') ||
        url.hostname.includes('identitytoolkit.googleapis.com')
    ) {
        return; // deja que el navegador maneje normalmente
    }

    // Para navegación (páginas HTML): network first, fallback offline
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(OFFLINE_URL))
        );
        return;
    }

    // Para el resto (JS, CSS, imágenes): network first, luego caché
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Guardar en caché si es exitoso
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

// ─────────────────────────────────────────────────────────────
// FCM — Notificaciones en background
// ─────────────────────────────────────────────────────────────
messaging.onBackgroundMessage(payload => {
    const titulo = payload.notification?.title ?? payload.data?.title ?? '🏀 Liga Metropolitana';
    const cuerpo = payload.notification?.body  ?? payload.data?.body  ?? 'Hay novedades en la liga';
    const imagen = payload.notification?.image ?? payload.data?.image ?? null;
    const tipo   = payload.data?.type ?? '';
    const link   = payload.data?.url  ?? '/';

    return self.registration.showNotification(titulo, {
        body:     cuerpo,
        icon:     LOGO_LIGA,
        badge:    LOGO_LIGA,
        image:    imagen,
        data:     { url: link, tipo },
        vibrate:  [200, 100, 200],
        tag:      `liga-${tipo}`,
        renotify: true,
    });
});

// ─────────────────────────────────────────────────────────────
// CLIC en la notificación → abrir / enfocar la app
// ─────────────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = event.notification.data?.url ?? '/';
    event.waitUntil(
        clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then(list => {
                const existing = list.find(c =>
                    c.url.startsWith(self.location.origin) && 'focus' in c
                );
                if (existing) return existing.focus();
                if (clients.openWindow) return clients.openWindow(url);
            })
    );
});