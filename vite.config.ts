import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Usamos nuestro SW personalizado (firebase-messaging-sw.js)
      // para no romper FCM
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'firebase-messaging-sw.js',
      injectRegister: false,   // useNotifications.ts ya lo registra
      manifest: false,          // ya tenemos nuestro manifest.json

      injectManifest: {
        // No inyectamos precache manifest en el SW de Firebase
        // para evitar conflictos con importScripts de FCM
        injectionPoint: undefined,
      },

      devOptions: {
        enabled: false,
      },
    }),
  ],
})