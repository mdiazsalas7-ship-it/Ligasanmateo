// ─────────────────────────────────────────────────────────────
// useNotifications.ts  →  src/useNotifications.ts
// ─────────────────────────────────────────────────────────────
// Usa el `messaging` ya inicializado en firebase.ts (singleton)
// para no crear instancias duplicadas con getMessaging().
// ─────────────────────────────────────────────────────────────

import { useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, messaging } from './firebase';

// ── Clave VAPID:
//    Firebase Console → liga-de-san-mateo
//    → Project Settings → Cloud Messaging
//    → Web push certificates → Generate key pair → copiar clave pública
const VAPID_KEY = 'BLkExx7QUohS3DljzvySrciQgTLW-oRqye7s1ECl0xd9kh5b2Cqx-V-Oew_pA94x5V8xa4bYlRoKuQ4HoL0WDhE';

const LOGO = 'https://i.postimg.cc/FKgNmFpv/Whats_App_Image_2026_01_25_at_12_07_36_AM.jpg';

export function useNotifications(userId?: string) {
    useEffect(() => {
        // Salir si el navegador no soporta SW/Notifications o si messaging no se pudo init
        if (!('serviceWorker' in navigator)) return;
        if (!('Notification' in window)) return;
        if (!messaging) return;

        const setup = async () => {
            try {
                // 1. Registrar / recuperar Service Worker
                const registration = await navigator.serviceWorker.register(
                    '/firebase-messaging-sw.js',
                    { scope: '/' }
                );
                await navigator.serviceWorker.ready;

                // 2. Pedir permiso (solo si no fue denegado previamente)
                if (Notification.permission === 'denied') return;

                const permission = await Notification.requestPermission();
                if (permission !== 'granted') return;

                // 3. Obtener token FCM
                const token = await getToken(messaging, {
                    vapidKey: VAPID_KEY,
                    serviceWorkerRegistration: registration,
                });

                if (!token) {
                    console.warn('[FCM] No se obtuvo token. Verifica la VAPID key.');
                    return;
                }

                // 4. Guardar / actualizar token en Firestore → fcm_tokens/{token}
                await setDoc(
                    doc(db, 'fcm_tokens', token),
                    {
                        token,
                        userId:    userId ?? 'anonymous',
                        platform:  'web',
                        updatedAt: serverTimestamp(),
                    },
                    { merge: true }  // merge: no sobreescribe createdAt si ya existe
                );

                console.log('[FCM] ✅ Token registrado:', token.slice(0, 20) + '...');

                // 5. Notificaciones cuando la app está en FOREGROUND
                onMessage(messaging, payload => {
                    console.log('[FCM] Foreground:', payload);
                    const { title, body } = payload.notification ?? {};

                    if (Notification.permission === 'granted') {
                        new Notification(title ?? '🏀 Liga Metropolitana', {
                            body:  body  ?? 'Hay novedades en la liga',
                            icon:  LOGO,
                            badge: LOGO,
                        });
                    }
                });

            } catch (err) {
                // Silencioso — el usuario puede tener notificaciones bloqueadas
                console.warn('[FCM] Setup falló:', err);
            }
        };

        setup();
    // userId puede cambiar cuando el usuario hace login
    }, [userId]);
}