// ─────────────────────────────────────────────────────────────
// functions/src/index.ts
// ─────────────────────────────────────────────────────────────
// Cloud Functions que envían notificaciones push automáticas:
//
//  1. onNoticiaCreada      → cuando se crea un doc en `noticias`
//  2. onVideoPublicado     → cuando se crea un doc en `entrevistas`
//  3. onPartidoFinalizado  → cuando estatus → 'finalizado' en
//     cualquier colección de calendario
//
// DEPLOY:
//   cd functions
//   npm install
//   firebase deploy --only functions
// ─────────────────────────────────────────────────────────────

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

const db  = admin.firestore();
const fcm = admin.messaging();

// ─────────────────────────────────────────────────────────────
// HELPER: obtener todos los tokens FCM registrados
// ─────────────────────────────────────────────────────────────
async function getTokens(): Promise<string[]> {
    const snap = await db.collection('fcm_tokens').get();
    return snap.docs
        .map(d => d.data().token as string)
        .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────
// HELPER: enviar push a todos los tokens en lotes de 500
// (límite de FCM sendEachForMulticast)
// ─────────────────────────────────────────────────────────────
async function sendPush(
    title: string,
    body: string,
    data: Record<string, string> = {}
) {
    const tokens = await getTokens();
    if (tokens.length === 0) {
        console.log('No hay tokens registrados');
        return;
    }

    // Lotes de 500
    const BATCH = 500;
    for (let i = 0; i < tokens.length; i += BATCH) {
        const batch = tokens.slice(i, i + BATCH);
        // Data-only: sin campo "notification" para que solo el SW muestre una notif
        const response = await fcm.sendEachForMulticast({
            tokens: batch,
            data: {
                ...data,
                title,
                body,
                icon: 'https://i.postimg.cc/FKgNmFpv/Whats_App_Image_2026_01_25_at_12_07_36_AM.jpg',
            },
            android: { priority: 'high' },
            apns: {
                payload: { aps: { contentAvailable: true } },
                headers: { 'apns-priority': '5' },
            },
        });

        // Limpiar tokens inválidos automáticamente
        const toDelete: Promise<any>[] = [];
        response.responses.forEach((r, idx) => {
            if (!r.success) {
                const code = r.error?.code;
                if (
                    code === 'messaging/invalid-registration-token' ||
                    code === 'messaging/registration-token-not-registered'
                ) {
                    toDelete.push(
                        db.collection('fcm_tokens').doc(batch[idx]).delete()
                    );
                }
            }
        });
        await Promise.all(toDelete);

        console.log(
            `[FCM] Lote ${i / BATCH + 1}: ` +
            `${response.successCount} OK, ${response.failureCount} fallidos`
        );
    }
}

// ─────────────────────────────────────────────────────────────
// TRIGGER 1: Nueva noticia publicada
// Colección: noticias
// ─────────────────────────────────────────────────────────────
export const onNoticiaCreada = functions
    .region('us-central1')
    .firestore
    .document('noticias/{noticiaId}')
    .onCreate(async (snap) => {
        const data = snap.data();
        const titulo = data.titulo || 'Nueva noticia';

        await sendPush(
            '📢 Liga Metropolitana Eje Este',
            titulo,
            { type: 'noticia', id: snap.id }
        );
    });

// ─────────────────────────────────────────────────────────────
// TRIGGER 2: Video / Entrevista publicada
// ─────────────────────────────────────────────────────────────
exports.onVideoPublicado = functions
    .region('us-central1')
    .firestore
    .document('entrevistas/{videoId}')
    .onCreate(async (snap) => {
        const data  = snap.data();
        const titulo = data.titulo || data.title || 'Nuevo video';
        const desc   = data.descripcion || data.description || 'Mira el nuevo contenido de la liga';

        await sendPush(
            '🎥 Nuevo Video · Liga Metropolitana',
            `${titulo} — ${desc}`,
            { type: 'video', id: snap.id }
        );
    });

// ─────────────────────────────────────────────────────────────
// TRIGGER 3: Partido finalizado
// Cubre: calendario, calendario_LIBRE, calendario_INTERINDUSTRIAL
// ─────────────────────────────────────────────────────────────
const CALENDARIO_COLS = [
    'calendario',
    'calendario_LIBRE',
    'calendario_INTERINDUSTRIAL',
    'calendario_U16_FEMENINO',
    'calendario_U16M',
];

CALENDARIO_COLS.forEach(colName => {
    const fnName = 'onPartidoFinalizado_' + colName.replace('calendario', 'cal');

    exports[fnName] = functions
        .region('us-central1')
        .firestore
        .document(`${colName}/{partidoId}`)
        .onUpdate(async (change) => {
            const before = change.before.data();
            const after  = change.after.data();

            // Solo cuando cambia a 'finalizado'
            if (before.estatus === 'finalizado' || after.estatus !== 'finalizado') return;

            const local    = after.equipoLocalNombre     || 'Local';
            const visitante = after.equipoVisitanteNombre || 'Visitante';
            const marcL    = after.marcadorLocal          ?? '?';
            const marcV    = after.marcadorVisitante      ?? '?';

            // Detectar categoría desde el nombre de la colección
            const categoria = colName === 'calendario'
                ? 'MASTER40'
                : colName.split('_')[1] || '';

            await sendPush(
                `🏀 Resultado Final · ${categoria}`,
                `${local} ${marcL} - ${marcV} ${visitante}`,
                { type: 'partido', id: change.after.id, categoria }
            );
        });
});