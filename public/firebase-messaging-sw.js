importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyAM1IP1iFrWgxvtaskzu40GdNI6cIP5oS8",
  authDomain: "liga-de-san-mateo.firebaseapp.com",
  projectId: "liga-de-san-mateo",
  storageBucket: "liga-de-san-mateo.firebasestorage.app",
  messagingSenderId: "71674005364",
  appId: "1:71674005364:web:6d6e93746ac430b77c4e21"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

// 1. MANEJAR NOTIFICACIÓN EN SEGUNDO PLANO
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Notificación recibida:', payload);

  const titulo = payload.notification?.title || payload.data?.title || "Nueva Noticia";
  const cuerpo = payload.notification?.body || payload.data?.body || "Tienes nueva información en la Liga.";
  const imagen = payload.notification?.image || payload.data?.image || null;

  const notificationOptions = {
    body: cuerpo,
    icon: 'https://i.postimg.cc/Hx1t81vH/FORMA-21-MORICHAL.jpg', // Tu logo fijo
    image: imagen, // Si la noticia trae foto, se muestra grande
    data: {
      url: payload.data?.link || '/' // Guardamos el link para usarlo al hacer clic
    }
  };

  return self.registration.showNotification(titulo, notificationOptions);
});

// 2. ABRIR LA APP AL TOCAR LA NOTIFICACIÓN (IMPORTANTE)
self.addEventListener('notificationclick', function(event) {
  console.log('Notificación tocada.');
  event.notification.close(); // Cierra la notificación

  // Intenta abrir la ventana de la app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Si la app ya está abierta, ponle el foco
      for (let client of windowClients) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no está abierta, abre una nueva ventana
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});