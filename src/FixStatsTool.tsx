// ─────────────────────────────────────────────────────────────
// src/FixStatsTool.tsx
// Herramienta TEMPORAL para reparar stats mal asignadas
// del partido 1U9yELiDzxchqNZVzg1v (U16M):
//   YORMAN ASTUDILLO (no jugó) → MAXIMILIANO CASTRO (sí jugó)
//
// Uso:
//   1) Pegar este archivo en /src
//   2) Importar en App.tsx temporalmente:
//        import FixStatsTool from './FixStatsTool';
//        ... <FixStatsTool onClose={() => setShowFix(false)} />
//   3) Botón "VISTA PREVIA" → mostrar diff sin escribir
//   4) Botón "EJECUTAR FIX" → aplica todo en un batch atómico
//   5) Eliminar el componente y su import después de usarlo
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { db } from './firebase';
import {
    doc, getDoc, getDocs, query, where,
    collection, writeBatch,
} from 'firebase/firestore';

// ===== CONFIGURACIÓN — verificar antes de ejecutar =====
const PARTIDO_ID    = '1U9yELiDzxchqNZVzg1v';
const CATEGORIA_COL = 'jugadores_U16M';      // colección de jugadores
const ID_VIEJO      = 'awxuLiuGfstqUxWMKWg3';  // YORMAN (no jugó) — quitar stats
const ID_NUEVO      = '6NCViq8L7trdUCEGkjR2';  // MAXIMILIANO (sí jugó) — poner stats
const NOMBRE_NUEVO  = 'MAXIMILIANO CASTRO';
const NUMERO_NUEVO  = 11;
// =======================================================

type Log = { kind: 'info' | 'ok' | 'warn' | 'err'; msg: string };

const FixStatsTool: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [logs, setLogs]   = useState<Log[]>([]);
    const [busy, setBusy]   = useState(false);

    const add = (l: Log) => setLogs(prev => [...prev, l]);

    // ── Lee Firestore y devuelve el plan de cambios sin aplicar ──
    const buildPlan = async () => {
        const plan: {
            statsPartidoMove: { oldDocId: string; newDocId: string; data: any } | null;
            jugadasUpdate: { id: string; oldData: any }[];
            playerOldDecrement: { id: string; current: any; subtract: any } | null;
            playerNewIncrement: { id: string; current: any; add: any } | null;
        } = {
            statsPartidoMove: null,
            jugadasUpdate: [],
            playerOldDecrement: null,
            playerNewIncrement: null,
        };

        // ── 1) Verificar que ambos jugadores existen
        const playerOldRef = doc(db, CATEGORIA_COL, ID_VIEJO);
        const playerNewRef = doc(db, CATEGORIA_COL, ID_NUEVO);
        const [playerOldSnap, playerNewSnap] = await Promise.all([
            getDoc(playerOldRef), getDoc(playerNewRef),
        ]);
        if (!playerOldSnap.exists()) {
            add({ kind: 'err', msg: `Jugador VIEJO no existe: ${ID_VIEJO}` });
            return null;
        }
        if (!playerNewSnap.exists()) {
            add({ kind: 'err', msg: `Jugador NUEVO no existe: ${ID_NUEVO}` });
            return null;
        }
        const playerOld = playerOldSnap.data();
        const playerNew = playerNewSnap.data();
        add({ kind: 'info', msg: `Viejo: ${playerOld.nombre} #${playerOld.numero} (eq: ${playerOld.equipoNombre})` });
        add({ kind: 'info', msg: `Nuevo: ${playerNew.nombre} #${playerNew.numero} (eq: ${playerNew.equipoNombre})` });

        // ── 2) Documento stats_partido del jugador viejo
        const statsOldRef = doc(db, 'stats_partido', `${PARTIDO_ID}_${ID_VIEJO}`);
        const statsOldSnap = await getDoc(statsOldRef);
        if (statsOldSnap.exists()) {
            const data = statsOldSnap.data();
            add({ kind: 'ok', msg: `stats_partido/${PARTIDO_ID}_${ID_VIEJO} → existe (puntos:${data.puntos ?? 0}, reb:${data.rebotes ?? 0}, rob:${data.robos ?? 0}, blo:${data.bloqueos ?? 0})` });
            plan.statsPartidoMove = {
                oldDocId: `${PARTIDO_ID}_${ID_VIEJO}`,
                newDocId: `${PARTIDO_ID}_${ID_NUEVO}`,
                data: {
                    ...data,
                    jugadorId: ID_NUEVO,
                    nombre:    NOMBRE_NUEVO,
                    numero:    NUMERO_NUEVO,
                },
            };
            // Verificar si el destino YA existe (raro pero defensivo)
            const statsNewRef = doc(db, 'stats_partido', `${PARTIDO_ID}_${ID_NUEVO}`);
            const statsNewSnap = await getDoc(statsNewRef);
            if (statsNewSnap.exists()) {
                add({ kind: 'warn', msg: `⚠ stats_partido/${PARTIDO_ID}_${ID_NUEVO} ya existe — se va a SOBRESCRIBIR (¿hay stats reales acá?)` });
            }
        } else {
            add({ kind: 'warn', msg: `stats_partido/${PARTIDO_ID}_${ID_VIEJO} NO existe` });
        }

        // ── 3) jugadas_partido con jugadorId del viejo en este partido
        const jugadasSnap = await getDocs(
            query(
                collection(db, 'jugadas_partido'),
                where('partidoId', '==', PARTIDO_ID),
                where('jugadorId', '==', ID_VIEJO)
            )
        );
        add({ kind: 'info', msg: `jugadas_partido a re-asignar: ${jugadasSnap.size}` });
        jugadasSnap.forEach(d => {
            plan.jugadasUpdate.push({ id: d.id, oldData: d.data() });
        });

        // ── 4) Stats acumuladas del jugador viejo (atribuibles a ese partido)
        //     Lo que vamos a restarle = lo que dice su doc en stats_partido del partido
        if (plan.statsPartidoMove) {
            const d = plan.statsPartidoMove.data;
            const subtract = {
                puntos:      d.puntos      ?? 0,
                rebotes:     d.rebotes     ?? 0,
                robos:       d.robos       ?? 0,
                bloqueos:    d.bloqueos    ?? 0,
                tirosLibres: d.tirosLibres ?? 0,
                dobles:      d.dobles      ?? 0,
                triples:     d.triples     ?? 0,
                asistencias: d.asistencias ?? 0,
                faltas:      d.faltas      ?? 0,
                partidosJugados: 1,
            };
            plan.playerOldDecrement = { id: ID_VIEJO, current: playerOld, subtract };
            plan.playerNewIncrement = { id: ID_NUEVO, current: playerNew, add: subtract };

            add({ kind: 'info', msg: `Restar a viejo  (acum actual: ${playerOld.puntos ?? 0}p ${playerOld.rebotes ?? 0}r ${playerOld.robos ?? 0}s ${playerOld.partidosJugados ?? 0}PJ)` });
            add({ kind: 'info', msg: `Sumar a nuevo   (acum actual: ${playerNew.puntos ?? 0}p ${playerNew.rebotes ?? 0}r ${playerNew.robos ?? 0}s ${playerNew.partidosJugados ?? 0}PJ)` });
        } else {
            add({ kind: 'warn', msg: 'Sin doc stats_partido del viejo → no se ajustan acumulados' });
        }

        return plan;
    };

    const handlePreview = async () => {
        setBusy(true); setLogs([]);
        add({ kind: 'info', msg: '━━━ VISTA PREVIA (no escribe nada) ━━━' });
        try {
            const plan = await buildPlan();
            if (plan) add({ kind: 'ok', msg: '✓ Plan generado. Revisá los datos antes de "EJECUTAR FIX".' });
        } catch (e: any) {
            add({ kind: 'err', msg: `Error: ${e.message}` });
        }
        setBusy(false);
    };

    const handleExecute = async () => {
        if (!window.confirm(
            '⚠ Esto modificará Firestore de forma IRREVERSIBLE.\n\n' +
            '¿Confirmás que querés ejecutar el fix?\n\n' +
            `Partido: ${PARTIDO_ID}\nDe: ${ID_VIEJO}\nA:  ${ID_NUEVO}`
        )) return;

        setBusy(true); setLogs([]);
        add({ kind: 'info', msg: '━━━ EJECUTANDO FIX ━━━' });
        try {
            const plan = await buildPlan();
            if (!plan) { setBusy(false); return; }

            const batch = writeBatch(db);

            // 1) Mover stats_partido
            if (plan.statsPartidoMove) {
                batch.set(doc(db, 'stats_partido', plan.statsPartidoMove.newDocId), plan.statsPartidoMove.data);
                batch.delete(doc(db, 'stats_partido', plan.statsPartidoMove.oldDocId));
                add({ kind: 'ok', msg: `→ Re-creado stats_partido/${plan.statsPartidoMove.newDocId} y borrado el viejo` });
            }

            // 2) Actualizar jugadas_partido
            for (const j of plan.jugadasUpdate) {
                batch.update(doc(db, 'jugadas_partido', j.id), {
                    jugadorId:    ID_NUEVO,
                    jugadorNombre: NOMBRE_NUEVO,
                    jugadorNumero: String(NUMERO_NUEVO),
                });
            }
            if (plan.jugadasUpdate.length) {
                add({ kind: 'ok', msg: `→ ${plan.jugadasUpdate.length} jugadas re-asignadas` });
            }

            // 3) Decrementar acumulados del viejo
            if (plan.playerOldDecrement) {
                const cur = plan.playerOldDecrement.current;
                const sub = plan.playerOldDecrement.subtract;
                batch.update(doc(db, CATEGORIA_COL, ID_VIEJO), {
                    puntos:      Math.max(0, (cur.puntos      ?? 0) - sub.puntos),
                    rebotes:     Math.max(0, (cur.rebotes     ?? 0) - sub.rebotes),
                    robos:       Math.max(0, (cur.robos       ?? 0) - sub.robos),
                    bloqueos:    Math.max(0, (cur.bloqueos    ?? 0) - sub.bloqueos),
                    tirosLibres: Math.max(0, (cur.tirosLibres ?? 0) - sub.tirosLibres),
                    dobles:      Math.max(0, (cur.dobles      ?? 0) - sub.dobles),
                    triples:     Math.max(0, (cur.triples     ?? 0) - sub.triples),
                    asistencias: Math.max(0, (cur.asistencias ?? 0) - sub.asistencias),
                    faltas:      Math.max(0, (cur.faltas      ?? 0) - sub.faltas),
                    partidosJugados: Math.max(0, (cur.partidosJugados ?? 0) - 1),
                });
                add({ kind: 'ok', msg: `→ Restadas stats acumuladas del jugador VIEJO` });
            }

            // 4) Incrementar acumulados del nuevo
            if (plan.playerNewIncrement) {
                const cur = plan.playerNewIncrement.current;
                const a   = plan.playerNewIncrement.add;
                batch.update(doc(db, CATEGORIA_COL, ID_NUEVO), {
                    puntos:      (cur.puntos      ?? 0) + a.puntos,
                    rebotes:     (cur.rebotes     ?? 0) + a.rebotes,
                    robos:       (cur.robos       ?? 0) + a.robos,
                    bloqueos:    (cur.bloqueos    ?? 0) + a.bloqueos,
                    tirosLibres: (cur.tirosLibres ?? 0) + a.tirosLibres,
                    dobles:      (cur.dobles      ?? 0) + a.dobles,
                    triples:     (cur.triples     ?? 0) + a.triples,
                    asistencias: (cur.asistencias ?? 0) + a.asistencias,
                    faltas:      (cur.faltas      ?? 0) + a.faltas,
                    partidosJugados: (cur.partidosJugados ?? 0) + 1,
                });
                add({ kind: 'ok', msg: `→ Sumadas stats acumuladas al jugador NUEVO` });
            }

            await batch.commit();
            add({ kind: 'ok', msg: '━━━ FIX APLICADO CORRECTAMENTE ✓ ━━━' });
        } catch (e: any) {
            add({ kind: 'err', msg: `❌ FALLÓ: ${e.message}` });
        }
        setBusy(false);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: '#0f172a', color: 'white', borderRadius: 14, padding: 24, width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto', border: '1px solid #1e293b' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: '1rem', color: '#fbbf24' }}>🔧 Reparar stats mal asignadas</h2>
                <p style={{ margin: '0 0 14px', fontSize: '0.75rem', color: '#94a3b8', lineHeight: 1.5 }}>
                    Partido <code style={{ color: '#fbbf24' }}>{PARTIDO_ID}</code>:<br/>
                    <strong style={{ color: '#f87171' }}>YORMAN</strong> ({ID_VIEJO}) → <strong style={{ color: '#34d399' }}>MAXIMILIANO</strong> ({ID_NUEVO})
                </p>

                <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                    <button onClick={handlePreview} disabled={busy}
                        style={{ flex: 1, padding: '10px', background: '#1e293b', color: '#fbbf24', border: '1px solid #fbbf24', borderRadius: 8, fontWeight: 900, cursor: busy ? 'wait' : 'pointer', fontSize: '0.78rem' }}>
                        VISTA PREVIA
                    </button>
                    <button onClick={handleExecute} disabled={busy}
                        style={{ flex: 1, padding: '10px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, fontWeight: 900, cursor: busy ? 'wait' : 'pointer', fontSize: '0.78rem' }}>
                        EJECUTAR FIX
                    </button>
                </div>

                <div style={{ background: '#020617', padding: 14, borderRadius: 10, minHeight: 220, fontFamily: 'monospace', fontSize: '0.7rem', lineHeight: 1.6 }}>
                    {logs.length === 0 && <span style={{ color: '#475569' }}>Logs aparecen acá. Hacé "VISTA PREVIA" primero.</span>}
                    {logs.map((l, i) => (
                        <div key={i} style={{
                            color: l.kind === 'ok'   ? '#34d399'
                                 : l.kind === 'err'  ? '#f87171'
                                 : l.kind === 'warn' ? '#fbbf24' : '#cbd5e1',
                            wordBreak: 'break-word',
                        }}>{l.msg}</div>
                    ))}
                </div>

                <button onClick={onClose} disabled={busy}
                    style={{ marginTop: 14, width: '100%', padding: 8, background: 'transparent', color: '#94a3b8', border: '1px solid #1e293b', borderRadius: 8, cursor: 'pointer', fontSize: '0.75rem' }}>
                    Cerrar
                </button>
            </div>
        </div>
    );
};

export default FixStatsTool;