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

// ─────────────────────────────────────────────────────────────
// TRIGGER 4: Nuevo partido programado en cualquier calendario
// ─────────────────────────────────────────────────────────────
CALENDARIO_COLS.forEach(colName => {
    const fnName = 'onPartidoCreado_' + colName.replace('calendario', 'cal');

    exports[fnName] = functions
        .region('us-central1')
        .firestore
        .document(`${colName}/{partidoId}`)
        .onCreate(async (snap) => {
            const data = snap.data();

            // Solo notificar partidos programados (no importados como finalizados)
            if (data.estatus === 'finalizado') return;

            const local     = data.equipoLocalNombre     || 'Local';
            const visitante = data.equipoVisitanteNombre || 'Visitante';
            const fecha     = data.fechaAsignada         || '';
            const hora      = data.hora                  ? ` · ${data.hora}` : '';

            const categoria = colName === 'calendario'
                ? 'MASTER40'
                : colName.split('_').slice(1).join('_') || '';

            // Formatear fecha legible
            let fechaFmt = fecha;
            try {
                const [y, m, d] = fecha.split('-').map(Number);
                fechaFmt = new Date(y, m - 1, d).toLocaleDateString('es-ES', {
                    weekday: 'long', day: 'numeric', month: 'long'
                });
            } catch {}

            await sendPush(
                `📅 Nuevo partido · ${categoria}`,
                `${local} vs ${visitante} — ${fechaFmt}${hora}`,
                { type: 'partido_nuevo', id: snap.id, categoria }
            );
        });
});

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

// ─────────────────────────────────────────────────────────────
// TRIGGER 5: Partido EN VIVO (inicio de juego)
// Dispara cuando enVivo pasa de false/undefined → true
// ─────────────────────────────────────────────────────────────
CALENDARIO_COLS.forEach(colName => {
    const fnName = 'onPartidoEnVivo_' + colName.replace('calendario', 'cal');

    exports[fnName] = functions
        .region('us-central1')
        .firestore
        .document(`${colName}/{partidoId}`)
        .onUpdate(async (change) => {
            const before = change.before.data();
            const after  = change.after.data();

            // Solo cuando enVivo pasa de false/undefined a true
            if (before.enVivo === true || after.enVivo !== true) return;

            // Defensa: si ya está finalizado, no notificar
            if (after.estatus === 'finalizado') return;

            const local     = after.equipoLocalNombre     || 'Local';
            const visitante = after.equipoVisitanteNombre || 'Visitante';

            const categoria = colName === 'calendario'
                ? 'MASTER40'
                : colName.split('_').slice(1).join('_') || '';

            // Mensaje distinto si el partido venía de una suspensión
            const esReanudacion = after.reanudado === true;

            await sendPush(
                `🔴 EN VIVO · ${categoria}`,
                `${local} vs ${visitante} — ${esReanudacion ? '¡Se reanudó el juego!' : '¡Comenzó el juego!'}`,
                { type: 'partido_envivo', id: change.after.id, categoria }
            );
        });
});

// ─────────────────────────────────────────────────────────────
// TRIGGER 6: Partido SUSPENDIDO (lluvia, falla eléctrica, etc.)
// Dispara cuando estatus pasa a 'suspendido'
// ─────────────────────────────────────────────────────────────
CALENDARIO_COLS.forEach(colName => {
    const fnName = 'onPartidoSuspendido_' + colName.replace('calendario', 'cal');

    exports[fnName] = functions
        .region('us-central1')
        .firestore
        .document(`${colName}/{partidoId}`)
        .onUpdate(async (change) => {
            const before = change.before.data();
            const after  = change.after.data();

            if (before.estatus === 'suspendido' || after.estatus !== 'suspendido') return;

            const local     = after.equipoLocalNombre     || 'Local';
            const visitante = after.equipoVisitanteNombre || 'Visitante';
            const marcL     = after.marcadorLocal          ?? 0;
            const marcV     = after.marcadorVisitante      ?? 0;

            const categoria = colName === 'calendario'
                ? 'MASTER40'
                : colName.split('_').slice(1).join('_') || '';

            await sendPush(
                `⏸ Partido Suspendido · ${categoria}`,
                `${local} ${marcL} - ${marcV} ${visitante} — Se reanudará en otra fecha`,
                { type: 'partido_suspendido', id: change.after.id, categoria }
            );
        });
});

// ─────────────────────────────────────────────────────────────
// TRIGGER 7: Sincronizar custom claim "admin"
//
// Cuando cambia usuarios/{uid}, se pone/quita el claim admin
// según el campo `rol` (o el email del dueño de la liga).
// Las reglas de Firestore/Storage validan contra este claim,
// así que el rol YA NO puede falsificarse desde el cliente.
//
// Nota: el usuario debe cerrar sesión y volver a entrar (o el
// cliente refrescar el token con getIdToken(true)) para que el
// claim nuevo llegue a su token.
// ─────────────────────────────────────────────────────────────
const OWNER_EMAIL = 'mdiazsalas7@gmail.com';

export const syncAdminClaim = functions
    .region('us-central1')
    .firestore
    .document('usuarios/{uid}')
    .onWrite(async (change, context) => {
        const uid = context.params.uid;

        // Doc borrado → quitar claim
        if (!change.after.exists) {
            try {
                await admin.auth().setCustomUserClaims(uid, { admin: false });
            } catch (e) {
                console.error(`[claims] No se pudo limpiar claim de ${uid}:`, e);
            }
            return;
        }

        const data = change.after.data() || {};

        let email = '';
        try {
            const userRecord = await admin.auth().getUser(uid);
            email = userRecord.email || '';
        } catch (e) {
            console.error(`[claims] Usuario Auth no encontrado para ${uid}:`, e);
            return;
        }

        const debeSerAdmin = data.rol === 'admin' || email === OWNER_EMAIL;

        try {
            await admin.auth().setCustomUserClaims(uid, { admin: debeSerAdmin });
            console.log(`[claims] ${email} (${uid}) → admin: ${debeSerAdmin}`);
        } catch (e) {
            console.error(`[claims] Error asignando claim a ${uid}:`, e);
        }
    });