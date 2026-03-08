// ─────────────────────────────────────────────────────────────
// /public/firebase-messaging-sw.js
// ─────────────────────────────────────────────────────────────
// FUSIONA el SW existente del proyecto con el de FCM Messaging.
// Reemplaza el archivo actual en /public/ con este.
// ─────────────────────────────────────────────────────────────

importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// ── Config real del proyecto ──
firebase.initializeApp({
    apiKey:            'AIzaSyAM1IP1iFrWgxvtaskzu40GdNI6cIP5oS8',
    authDomain:        'liga-de-san-mateo.firebaseapp.com',
    projectId:         'liga-de-san-mateo',
    storageBucket:     'liga-de-san-mateo.firebasestorage.app',
    messagingSenderId: '71674005364',
    appId:             '1:71674005364:web:6d6e93746ac430b77c4e21',
});

const messaging = firebase.messaging();

// Logos
const LOGO_LIGA  = 'https://i.postimg.cc/FKgNmFpv/Whats_App_Image_2026_01_25_at_12_07_36_AM.jpg';

// ─────────────────────────────────────────────────────────────
// 1. CICLO DE VIDA PWA (install / activate / fetch)
//    Mantenemos el comportamiento del sw.js original del proyecto
// ─────────────────────────────────────────────────────────────
self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});

// ─────────────────────────────────────────────────────────────
// 2. NOTIFICACIONES EN BACKGROUND (app cerrada o minimizada)
// ─────────────────────────────────────────────────────────────
messaging.onBackgroundMessage(payload => {
    console.log('[SW] Notificación en background:', payload);

    // Prioridad: notification > data
    const titulo = payload.notification?.title
        ?? payload.data?.title
        ?? '🏀 Liga Metropolitana';

    const cuerpo = payload.notification?.body
        ?? payload.data?.body
        ?? 'Hay novedades en la liga';

    const imagen = payload.notification?.image
        ?? payload.data?.image
        ?? null;

    const tipo   = payload.data?.type ?? '';   // 'noticia' | 'partido'
    const link   = payload.data?.url  ?? '/';

    // Elegir icono según el tipo de notificación
    const icon = LOGO_LIGA;

    return self.registration.showNotification(titulo, {
        body:    cuerpo,
        icon,
        badge:   LOGO_LIGA,
        image:   imagen,            // foto de la noticia si viene
        data:    { url: link, tipo },
        vibrate: [200, 100, 200],
        tag:     `liga-${tipo}`,    // evita duplicados del mismo tipo
        renotify: true,
    });
});

// ─────────────────────────────────────────────────────────────
// 3. CLIC EN LA NOTIFICACIÓN → abrir / enfocar la app
// ─────────────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
    event.notification.close();

    const url = event.notification.data?.url ?? '/';

    event.waitUntil(
        clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then(list => {
                // Si la app ya está abierta en alguna pestaña, ponle foco
                const existing = list.find(c =>
                    c.url.startsWith(self.location.origin) && 'focus' in c
                );
                if (existing) return existing.focus();
                // Si no, abre nueva ventana
                if (clients.openWindow) return clients.openWindow(url);
            })
    );
});