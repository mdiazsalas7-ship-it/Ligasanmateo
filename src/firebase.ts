import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: 'AIzaSyAM1IP1iFrWgxvtaskzu40GdNI6cIP5oS8',
  authDomain: 'liga-de-san-mateo.firebaseapp.com',
  projectId: 'liga-de-san-mateo',
  storageBucket: 'liga-de-san-mateo.firebasestorage.app',
  messagingSenderId: '71674005364',
  appId: '1:71674005364:web:6d6e93746ac430b77c4e21',
};

// Singleton para evitar errores de duplicidad en Vite/React
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Inicialización de servicios principales
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app); // <--- Este es el encargado de recibir las fotos de las planillas

// Inicialización segura de Mensajería (Notificaciones)
let messaging: any = null;
isSupported().then((supported) => {
  if (supported) {
    messaging = getMessaging(app);
  }
}).catch(err => console.error("Messaging no soportado:", err));

export { auth, db, storage, messaging };