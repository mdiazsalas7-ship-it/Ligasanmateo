import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
// 1. NUEVA IMPORTACIÓN PARA NOTIFICACIONES
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: 'AIzaSyAM1IP1iFrWgxvtaskzu40GdNI6cIP5oS8',
  authDomain: 'liga-de-san-mateo.firebaseapp.com',
  projectId: 'liga-de-san-mateo',
  storageBucket: 'liga-de-san-mateo.firebasestorage.app',
  messagingSenderId: '71674005364',
  appId: '1:71674005364:web:6d6e93746ac430b77c4e21',
};

// Lógica Singleton para evitar errores de reinicialización
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Inicializar servicios existentes
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// 2. INICIALIZAR MESSAGING DE FORMA SEGURA
// Usamos isSupported() porque Messaging necesita Service Workers (no funciona en modo incógnito a veces o navegadores muy viejos)
let messaging: any = null;

isSupported()
  .then((yes) => {
    if (yes) {
      messaging = getMessaging(app);
    }
  })
  .catch((err) => {
    console.log('Firebase Messaging no es soportado en este navegador:', err);
  });

// 3. EXPORTAR SERVICIOS (Agregamos messaging al final)
export { auth, db, storage, messaging };
