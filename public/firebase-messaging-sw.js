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

// Mantenemos esto porque tu sistema lo necesita para despertar
messaging.onBackgroundMessage(function(payload) {
  console.log('Mensaje recibido en background:', payload);
  
  // OJO: Aquí leemos de 'data' o 'notification' para asegurar compatibilidad
  const titulo = payload.notification?.title || payload.data?.title || "Notificación";
  const cuerpo = payload.notification?.body || payload.data?.body || "Nueva información";
  
  const notificationOptions = {
    body: cuerpo,
    icon: 'https://i.postimg.cc/Hx1t81vH/FORMA-21-MORICHAL.jpg' // Tu logo fijo
  };

  self.registration.showNotification(titulo, notificationOptions);
});