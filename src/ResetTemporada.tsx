import React, { useState } from 'react';
import { db } from './firebase';
import {
    collection, getDocs, writeBatch, query, where
} from 'firebase/firestore';

// ─────────────────────────────────────────────
// Colección de equipos/calendario según categoría
// ─────────────────────────────────────────────
const getColName = (base: string, cat: string) =>
    cat === 'MASTER40' ? base : `${base}_${cat}`;

interface Props {
    categoria: string;
    onClose: () => void;
}

type Fase = 'confirm1' | 'confirm2' | 'running' | 'done' | 'error';

const ResetTemporada: React.FC<Props> = ({ categoria, onClose }) => {
    const [fase, setFase]         = useState<Fase>('confirm1');
    const [log, setLog]           = useState<string[]>([]);
    const [errorMsg, setErrorMsg] = useState('');

    const addLog = (msg: string) => setLog(prev => [...prev, msg]);

    // ─────────────────────────────────────────────
    // FUNCIÓN NUCLEAR
    // ─────────────────────────────────────────────
    const ejecutarReset = async () => {
        setFase('running');
        setLog([]);

        try {
            const colCal      = getColName('calendario', categoria);
            const colEquipos  = getColName('equipos',    categoria);
            const colJugadores = getColName('jugadores', categoria);

            // ── 1. Leer todos los partidos del calendario de ESTA categoría ──
            addLog(`📅 Leyendo partidos de ${colCal}...`);
            const calSnap = await getDocs(collection(db, colCal));
            const partidoIds = calSnap.docs.map(d => d.id);
            addLog(`   → ${partidoIds.length} partidos encontrados`);

            // ── 2. Borrar partidos en lotes de 500 ──
            addLog('🗑️  Borrando partidos...');
            let batchCal = writeBatch(db);
            let count = 0;
            for (const d of calSnap.docs) {
                batchCal.delete(d.ref);
                count++;
                if (count % 500 === 0) { await batchCal.commit(); batchCal = writeBatch(db); }
            }
            if (count % 500 !== 0) await batchCal.commit();
            addLog(`   ✅ ${count} partidos borrados`);

            // ── 3. Borrar stats_partido SOLO de esta categoría (filtrado por partidoId) ──
            addLog('📊 Borrando estadísticas de partidos...');
            let statsCount = 0;
            const CHUNK = 30; // límite Firestore 'in'
            for (let i = 0; i < partidoIds.length; i += CHUNK) {
                const chunk = partidoIds.slice(i, i + CHUNK);
                const statsSnap = await getDocs(
                    query(collection(db, 'stats_partido'), where('partidoId', 'in', chunk))
                );
                if (statsSnap.empty) continue;
                let batchSt = writeBatch(db);
                let sc = 0;
                for (const d of statsSnap.docs) {
                    batchSt.delete(d.ref);
                    sc++;
                    if (sc % 500 === 0) { await batchSt.commit(); batchSt = writeBatch(db); sc = 0; }
                }
                if (sc > 0) await batchSt.commit();
                statsCount += statsSnap.docs.length;
            }
            addLog(`   ✅ ${statsCount} registros de stats borrados`);

            // ── 4. Borrar jugadas_partido SOLO de esta categoría ──
            addLog('🎮 Borrando jugadas de la mesa técnica...');
            let jugadasCount = 0;
            for (let i = 0; i < partidoIds.length; i += CHUNK) {
                const chunk = partidoIds.slice(i, i + CHUNK);
                const jugSnap = await getDocs(
                    query(collection(db, 'jugadas_partido'), where('partidoId', 'in', chunk))
                );
                if (jugSnap.empty) continue;
                let batchJ = writeBatch(db);
                let jc = 0;
                for (const d of jugSnap.docs) {
                    batchJ.delete(d.ref);
                    jc++;
                    if (jc % 500 === 0) { await batchJ.commit(); batchJ = writeBatch(db); jc = 0; }
                }
                if (jc > 0) await batchJ.commit();
                jugadasCount += jugSnap.docs.length;
            }
            addLog(`   ✅ ${jugadasCount} jugadas borradas`);

            // ── 5. Resetear stats de JUGADORES de esta categoría ──
            addLog(`👤 Reseteando stats de jugadores en ${colJugadores}...`);
            const jugSnap = await getDocs(collection(db, colJugadores));
            let batchJug = writeBatch(db);
            let jc2 = 0;
            for (const d of jugSnap.docs) {
                batchJug.update(d.ref, {
                    puntos: 0, triples: 0, dobles: 0, tirosLibres: 0,
                    rebotes: 0, robos: 0, bloqueos: 0, tapones: 0,
                    partidosJugados: 0,
                });
                jc2++;
                if (jc2 % 500 === 0) { await batchJug.commit(); batchJug = writeBatch(db); jc2 = 0; }
            }
            if (jc2 > 0) await batchJug.commit();
            addLog(`   ✅ ${jugSnap.docs.length} jugadores reseteados`);

            // ── 6. Resetear stats de EQUIPOS de esta categoría ──
            addLog(`🏆 Reseteando estadísticas de equipos en ${colEquipos}...`);
            const equiposSnap = await getDocs(collection(db, colEquipos));
            let batchEq = writeBatch(db);
            let ec = 0;
            for (const d of equiposSnap.docs) {
                batchEq.update(d.ref, {
                    victorias: 0, derrotas: 0, puntos: 0,
                    puntos_favor: 0, puntos_contra: 0,
                });
                ec++;
                if (ec % 500 === 0) { await batchEq.commit(); batchEq = writeBatch(db); ec = 0; }
            }
            if (ec > 0) await batchEq.commit();
            addLog(`   ✅ ${equiposSnap.docs.length} equipos reseteados`);

            addLog('');
            addLog(`✅ ¡${categoria} RESETEADA EXITOSAMENTE!`);
            addLog('   Equipos, jugadores, logos y fotos intactos.');
            addLog('   Otras categorías NO fueron afectadas.');
            setFase('done');

        } catch (e: any) {
            console.error(e);
            setErrorMsg(e.message || 'Error desconocido');
            setFase('error');
        }
    };

    // ─────────────────────────────────────────────
    // UI
    // ─────────────────────────────────────────────
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
        }}>
            <div style={{
                background: '#0f172a', borderRadius: 20, width: '100%', maxWidth: 420,
                border: '2px solid #ef4444', overflow: 'hidden',
                boxShadow: '0 0 40px rgba(239,68,68,0.3)',
            }}>

                {/* Header */}
                <div style={{
                    background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
                    padding: '18px 20px',
                    display: 'flex', alignItems: 'center', gap: 12,
                }}>
                    <span style={{ fontSize: '2rem' }}>☢️</span>
                    <div>
                        <div style={{ color: 'white', fontWeight: 900, fontSize: '1rem' }}>
                            RESET DE TEMPORADA
                        </div>
                        <div style={{ color: '#fca5a5', fontSize: '0.7rem', fontWeight: 700 }}>
                            {categoria} — solo esta categoría
                        </div>
                    </div>
                </div>

                <div style={{ padding: 20 }}>

                    {/* PASO 1 */}
                    {fase === 'confirm1' && (
                        <>
                            <div style={{
                                background: '#1e293b', borderRadius: 12, padding: 16,
                                marginBottom: 20, border: '1px solid #334155',
                            }}>
                                <p style={{ color: '#f1f5f9', fontSize: '0.85rem', margin: '0 0 12px', fontWeight: 700 }}>
                                    Esto borrará SOLO de <span style={{ color: '#fbbf24' }}>{categoria}</span>:
                                </p>
                                {[
                                    '🗑️  Todos los partidos del calendario',
                                    '📊 Estadísticas por partido (stats_partido)',
                                    '🎮 Jugadas de la mesa técnica',
                                    '📈 Stats acumuladas de jugadores (puntos, reb...)',
                                    '🏆 Victorias / derrotas / puntos de equipos',
                                ].map(item => (
                                    <div key={item} style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>
                                        {item}
                                    </div>
                                ))}
                                <div style={{ marginTop: 12, borderTop: '1px solid #334155', paddingTop: 12 }}>
                                    <p style={{ color: '#f1f5f9', fontSize: '0.82rem', margin: '0 0 6px', fontWeight: 700 }}>
                                        Se conserva intacto:
                                    </p>
                                    {[
                                        '✅ Equipos, logos y grupos',
                                        '✅ Roster de jugadores (nombres, fotos, números)',
                                        '✅ LIBRE, INTERINDUSTRIAL, U16 sin tocar',
                                    ].map(item => (
                                        <div key={item} style={{ color: '#4ade80', fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>
                                            {item}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={onClose} style={btnSecondary}>CANCELAR</button>
                                <button onClick={() => setFase('confirm2')} style={btnDanger}>CONTINUAR ⚠️</button>
                            </div>
                        </>
                    )}

                    {/* PASO 2 */}
                    {fase === 'confirm2' && (
                        <>
                            <div style={{
                                background: '#450a0a', borderRadius: 12, padding: 16,
                                marginBottom: 20, border: '1px solid #dc2626', textAlign: 'center',
                            }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>⚠️</div>
                                <p style={{ color: '#fca5a5', fontWeight: 900, fontSize: '0.95rem', margin: 0 }}>
                                    ¿ESTÁS SEGURO?
                                </p>
                                <p style={{ color: '#fca5a5', fontSize: '0.75rem', margin: '8px 0 0', opacity: 0.8 }}>
                                    Se borrará TODA la temporada de <strong>{categoria}</strong>.<br />
                                    Esta acción <strong>NO se puede deshacer</strong>.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={() => setFase('confirm1')} style={btnSecondary}>← ATRÁS</button>
                                <button onClick={ejecutarReset} style={{ ...btnDanger, background: '#7f1d1d', boxShadow: '0 0 20px rgba(239,68,68,0.4)' }}>
                                    ☢️ BORRAR TODO
                                </button>
                            </div>
                        </>
                    )}

                    {/* RUNNING */}
                    {fase === 'running' && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                <div style={{
                                    width: 20, height: 20, borderRadius: '50%',
                                    border: '3px solid #334155', borderTop: '3px solid #ef4444',
                                    animation: 'spin 0.8s linear infinite', flexShrink: 0,
                                }} />
                                <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: '0.85rem' }}>Procesando...</span>
                            </div>
                            <div style={{
                                background: '#020617', borderRadius: 8, padding: 12,
                                fontFamily: 'monospace', fontSize: '0.7rem',
                                maxHeight: 220, overflowY: 'auto',
                            }}>
                                {log.map((l, i) => (
                                    <div key={i} style={{
                                        color: l.startsWith('✅') ? '#4ade80' : l.startsWith('❌') ? '#ef4444' : '#94a3b8',
                                        marginBottom: 3,
                                    }}>{l}</div>
                                ))}
                            </div>
                            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                        </div>
                    )}

                    {/* DONE */}
                    {fase === 'done' && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '3rem', marginBottom: 10 }}>✅</div>
                            <p style={{ color: '#4ade80', fontWeight: 900, fontSize: '1rem', marginBottom: 6 }}>
                                ¡TEMPORADA RESETEADA!
                            </p>
                            <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: 16 }}>
                                {categoria} lista para nueva temporada.
                            </p>
                            <div style={{
                                background: '#020617', borderRadius: 8, padding: 12,
                                fontFamily: 'monospace', fontSize: '0.65rem',
                                maxHeight: 150, overflowY: 'auto', marginBottom: 16, textAlign: 'left',
                            }}>
                                {log.map((l, i) => (
                                    <div key={i} style={{ color: l.startsWith('✅') ? '#4ade80' : '#94a3b8', marginBottom: 2 }}>{l}</div>
                                ))}
                            </div>
                            <button onClick={onClose} style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: '#1e3a8a', color: 'white', fontWeight: 900, fontSize: '0.85rem', cursor: 'pointer' }}>
                                CERRAR
                            </button>
                        </div>
                    )}

                    {/* ERROR */}
                    {fase === 'error' && (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>❌</div>
                            <p style={{ color: '#ef4444', fontWeight: 900, marginBottom: 8 }}>Error durante el reset</p>
                            <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: 20 }}>{errorMsg}</p>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={() => setFase('confirm1')} style={btnSecondary}>REINTENTAR</button>
                                <button onClick={onClose} style={{ ...btnSecondary, background: '#334155', color: 'white', border: 'none' }}>CERRAR</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const btnDanger: React.CSSProperties = {
    flex: 1, padding: '12px', borderRadius: 10, border: 'none',
    background: '#dc2626', color: 'white', fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer',
};
const btnSecondary: React.CSSProperties = {
    flex: 1, padding: '12px', borderRadius: 10, border: '1px solid #334155',
    background: '#1e293b', color: '#94a3b8', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
};

export default ResetTemporada;