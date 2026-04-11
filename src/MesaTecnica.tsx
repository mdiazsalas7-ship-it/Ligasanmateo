import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { db } from './firebase';
import {
    doc, updateDoc, onSnapshot, collection, query,
    getDocs, setDoc, increment, where, writeBatch,
    limit, orderBy, addDoc, deleteDoc, getDoc
} from 'firebase/firestore';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
type Team = 'local' | 'visitante';

interface Player {
    id: string;
    nombre: string;
    numero?: string | number;
    equipoId?: string;
}

interface StatMap {
    puntos?: number;
    rebotes?: number;
    robos?: number;
    bloqueos?: number;
    triples?: number;
    dobles?: number;
    tirosLibres?: number;
}

interface Jugada {
    id: string;
    partidoId: string;
    jugadorId: string;
    jugadorNombre: string;
    jugadorNumero: string;
    equipo: Team;
    accion: string;
    puntos: number;
    timestamp: number;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const getColName = (base: string, categoria: string) => {
    const cat = categoria.trim().toUpperCase();
    return (cat === 'MASTER40' || cat === 'MASTER') ? base : `${base}_${cat}`;
};

const puntosDeAccion = (accion: string) =>
    accion === 'tirosLibres' ? 1 : accion === 'dobles' ? 2 : accion === 'triples' ? 3 : 0;

// ─────────────────────────────────────────────
// COMPONENTE: Modal de confirmación (reemplaza window.confirm)
// ─────────────────────────────────────────────
const ConfirmModal: React.FC<{
    mensaje: string;
    onConfirm: () => void;
    onCancel: () => void;
}> = ({ mensaje, onConfirm, onCancel }) => (
    <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
        <div style={{
            background: '#1e293b', borderRadius: 16, padding: 28,
            maxWidth: 320, width: '100%', border: '1px solid #334155',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>
            <p style={{ color: 'white', fontWeight: 700, fontSize: '0.95rem', textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
                {mensaje}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={onCancel} style={{
                    flex: 1, padding: '12px 0', background: '#334155', color: '#94a3b8',
                    border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer',
                }}>CANCELAR</button>
                <button onClick={onConfirm} style={{
                    flex: 1, padding: '12px 0', background: '#10b981', color: 'white',
                    border: 'none', borderRadius: 10, fontWeight: 900, fontSize: '0.8rem', cursor: 'pointer',
                }}>CONFIRMAR</button>
            </div>
        </div>
    </div>
);

// ─────────────────────────────────────────────
// COMPONENTE: Toast de feedback visual
// ─────────────────────────────────────────────
const Toast: React.FC<{ msg: string; color: string }> = ({ msg, color }) => (
    <div style={{
        position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
        background: color, color: 'white', padding: '10px 22px',
        borderRadius: 30, fontWeight: 900, fontSize: '0.85rem',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 8000,
        animation: 'toastIn 0.2s ease',
        whiteSpace: 'nowrap',
    }}>
        {msg}
    </div>
);

// ─────────────────────────────────────────────
// COMPONENTE: Fila de jugador con botones grandes
// ─────────────────────────────────────────────
const PlayerRow = memo(({
    player, team, stats, onStat, onSub, flashing,
}: {
    player: Player;
    team: Team;
    stats: StatMap;
    onStat: (player: Player, team: Team, accion: string, val: number) => void;
    onSub: (id: string) => void;
    flashing: string | null; // accion que acaba de registrarse
}) => {
    const s = stats ?? {};
    const teamColor = team === 'local' ? '#3b82f6' : '#ef4444';

    const StatBtn = ({
        accion, label, count, bg,
    }: { accion: string; label: string; count: number; bg: string }) => {
        const isFlashing = flashing === accion;
        return (
            <button
                onClick={() => onStat(player, team, accion, 1)}
                style={{
                    padding: '12px 4px',
                    background: isFlashing ? '#ffffff' : bg,
                    border: 'none', borderRadius: 8,
                    color: isFlashing ? bg : 'white',
                    fontWeight: 900, fontSize: '0.72rem',
                    cursor: 'pointer',
                    transform: isFlashing ? 'scale(0.93)' : 'scale(1)',
                    transition: 'transform 0.15s, background 0.15s',
                    lineHeight: 1.3,
                    boxShadow: isFlashing ? `0 0 0 2px ${bg}` : 'none',
                }}
            >
                {label}<br />
                <span style={{ fontSize: '0.9rem' }}>{count}</span>
            </button>
        );
    };

    return (
        <div style={{
            marginBottom: 8, padding: '10px 10px 8px',
            borderRadius: 12, background: '#1a1a1a',
            border: `1px solid #2d2d2d`,
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}>
            {/* Nombre y número */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{
                        background: teamColor, color: 'white',
                        padding: '3px 8px', borderRadius: 6,
                        fontWeight: 900, fontSize: '0.85rem',
                        minWidth: 28, textAlign: 'center', flexShrink: 0,
                    }}>
                        {player.numero ?? '??'}
                    </span>
                    <span style={{
                        fontWeight: 800, color: 'white', fontSize: '0.82rem',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                        {player.nombre}
                    </span>
                </div>
                <button
                    onClick={() => onSub(player.id)}
                    style={{
                        background: '#334155', color: '#60a5fa',
                        border: 'none', borderRadius: 6,
                        padding: '5px 10px', fontSize: '0.65rem',
                        cursor: 'pointer', fontWeight: 700, flexShrink: 0,
                    }}
                >
                    🔄 CAMBIO
                </button>
            </div>

            {/* Botones de stat — más grandes */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                <StatBtn accion="tirosLibres" label="+1 TL" count={s.tirosLibres ?? 0} bg="#475569" />
                <StatBtn accion="dobles"      label="+2 PT" count={s.dobles ?? 0}      bg="#1e40af" />
                <StatBtn accion="triples"     label="+3 PT" count={s.triples ?? 0}     bg="#7c3aed" />
                <StatBtn accion="rebotes"     label="REB"   count={s.rebotes ?? 0}     bg="#047857" />
                <StatBtn accion="robos"       label="ROBO"  count={s.robos ?? 0}       bg="#b45309" />
                <StatBtn accion="bloqueos"    label="BLOQ"  count={s.bloqueos ?? 0}    bg="#991b1b" />
            </div>
        </div>
    );
});

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
const MesaTecnica: React.FC<{ categoria: string; onClose: () => void }> = ({ categoria, onClose }) => {
    const [matches, setMatches] = useState<any[]>([]);
    const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
    const [matchData, setMatchData] = useState<any | null>(null);
    const [logos, setLogos] = useState({ local: '', visitante: '' });

    const [playersLocal, setPlayersLocal] = useState<Player[]>([]);
    const [playersVisitante, setPlayersVisitante] = useState<Player[]>([]);

    const [presentLocal, setPresentLocal] = useState<string[]>([]);
    const [presentVisitante, setPresentVisitante] = useState<string[]>([]);
    const [checkInDone, setCheckInDone] = useState(false);
    const [startersDone, setStartersDone] = useState(false);

    const [onCourtLocal, setOnCourtLocal] = useState<string[]>([]);
    const [onCourtVisitante, setOnCourtVisitante] = useState<string[]>([]);

    const [subModal, setSubModal] = useState<{ team: Team; replacingId: string | null; isOpen: boolean }>({
        team: 'local', replacingId: null, isOpen: false,
    });

    const [confirmModal, setConfirmModal] = useState<{ msg: string; onConfirm: () => void } | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [statsCache, setStatsCache] = useState<Record<string, StatMap>>({});
    const [recentPlays, setRecentPlays] = useState<Jugada[]>([]);

    // Toast
    const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Flash por jugador+accion para el feedback visual del botón
    const [flashMap, setFlashMap] = useState<Record<string, string | null>>({});

    // null = verificando Firestore | false = sin estado guardado | true = estado restaurado
    const [estadoRestaurado, setEstadoRestaurado] = useState<boolean | null>(null);
    const [cuartoActual, setCuartoActual] = useState<string>('Q1');

    const DEFAULT_LOGO = 'https://cdn-icons-png.flaticon.com/512/166/166344.png';

    const colCal = getColName('calendario', categoria);
    const colPlayers = getColName('jugadores', categoria);
    const colTeams = getColName('equipos', categoria);

    // Persiste el estado de la mesa en mesa_estado/{matchId}
    const saveEstado = useCallback(async (payload: Partial<{
        presentLocal: string[];
        presentVisitante: string[];
        onCourtLocal: string[];
        onCourtVisitante: string[];
        checkInDone: boolean;
        startersDone: boolean;
        cuartoActual: string;
    }>) => {
        if (!selectedMatchId) return;
        try {
            await setDoc(
                doc(db, 'mesa_estado', selectedMatchId),
                { ...payload, updatedAt: Date.now() },
                { merge: true },
            );
        } catch (e) {
            console.error('Error guardando estado mesa:', e);
        }
    }, [selectedMatchId]);

    const showToast = useCallback((msg: string, color = '#10b981') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ msg, color });
        toastTimer.current = setTimeout(() => setToast(null), 1800);
    }, []);

    const showConfirm = (msg: string, onConfirm: () => void) => {
        setConfirmModal({ msg, onConfirm });
    };

    // ── Carga de partidos del día ──
    useEffect(() => {
        const now = new Date();
        const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString().split('T')[0];
        const q = query(
            collection(db, colCal),
            where('fechaAsignada', '==', localDate),
            where('estatus', '==', 'programado'),
        );
        return onSnapshot(q, snap =>
            setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );
    }, [categoria]);

    // ── Restaurar estado guardado al seleccionar un partido ──
    useEffect(() => {
        if (!selectedMatchId) return;
        setEstadoRestaurado(null); // volvemos a "verificando"
        const fetchEstado = async () => {
            try {
                const snap = await getDoc(doc(db, 'mesa_estado', selectedMatchId));
                if (snap.exists()) {
                    const d = snap.data();
                    // Solo restauramos si el partido no terminó
                    if (d.startersDone) {
                        if (d.presentLocal)     setPresentLocal(d.presentLocal);
                        if (d.presentVisitante) setPresentVisitante(d.presentVisitante);
                        if (d.onCourtLocal)     setOnCourtLocal(d.onCourtLocal);
                        if (d.onCourtVisitante) setOnCourtVisitante(d.onCourtVisitante);
                        setCheckInDone(true);
                        setStartersDone(true);
                        setEstadoRestaurado(true);
                        return;
                    }
                    if (d.checkInDone) {
                        if (d.presentLocal)     setPresentLocal(d.presentLocal);
                        if (d.presentVisitante) setPresentVisitante(d.presentVisitante);
                        setCheckInDone(true);
                        setEstadoRestaurado(false);
                        return;
                    }
                }
                setEstadoRestaurado(false);
            } catch (e) {
                console.error('Error restaurando estado:', e);
                setEstadoRestaurado(false);
            }
        };
        fetchEstado();
    }, [selectedMatchId]);

    // ── Carga de datos del partido seleccionado ──
    useEffect(() => {
        if (!selectedMatchId) return;
        const unsubMatch = onSnapshot(doc(db, colCal, selectedMatchId), async snap => {
            if (!snap.exists()) return;
            const data = { id: snap.id, ...snap.data() } as any;
            setMatchData(data);
            const [lSnap, vSnap] = await Promise.all([
                getDocs(query(collection(db, colTeams), where('nombre', '==', data.equipoLocalNombre))),
                getDocs(query(collection(db, colTeams), where('nombre', '==', data.equipoVisitanteNombre))),
            ]);
            setLogos({
                local: lSnap.docs[0]?.data()?.logoUrl || DEFAULT_LOGO,
                visitante: vSnap.docs[0]?.data()?.logoUrl || DEFAULT_LOGO,
            });
        });

        const unsubPlays = onSnapshot(
            query(collection(db, 'jugadas_partido'), where('partidoId', '==', selectedMatchId), orderBy('timestamp', 'desc'), limit(20)),
            snap => setRecentPlays(snap.docs.map(d => ({ id: d.id, ...d.data() } as Jugada))),
        );

        const unsubStats = onSnapshot(
            query(collection(db, 'stats_partido'), where('partidoId', '==', selectedMatchId)),
            snap => {
                const cache: Record<string, StatMap> = {};
                snap.docs.forEach(d => { cache[d.data().jugadorId] = d.data(); });
                setStatsCache(cache);
            },
        );

        return () => { unsubMatch(); unsubPlays(); unsubStats(); };
    }, [selectedMatchId, categoria]);

    // ── Carga de rosters ──
    useEffect(() => {
        if (!matchData?.equipoLocalId || !matchData?.equipoVisitanteId) return;
        const fetchRosters = async () => {
            const [snapL, snapV] = await Promise.all([
                getDocs(query(collection(db, colPlayers), where('equipoId', '==', matchData.equipoLocalId))),
                getDocs(query(collection(db, colPlayers), where('equipoId', '==', matchData.equipoVisitanteId))),
            ]);
            const sort = (docs: any[]) =>
                docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (parseInt(a.numero) || 0) - (parseInt(b.numero) || 0));
            setPlayersLocal(sort(snapL.docs));
            setPlayersVisitante(sort(snapV.docs));
        };
        fetchRosters();
    }, [matchData?.id, categoria]);

    // ── Registrar stat ──
    const handleStat = useCallback(async (player: Player, team: Team, accion: string, val: number) => {
        if (!matchData) return;
        const pts = puntosDeAccion(accion);

        // Flash visual en el botón
        setFlashMap(prev => ({ ...prev, [`${player.id}_${accion}`]: accion }));
        setTimeout(() => setFlashMap(prev => ({ ...prev, [`${player.id}_${accion}`]: null })), 300);

        // Toast de confirmación
        const labels: Record<string, string> = {
            tirosLibres: '🎯 +1 TL', dobles: '🏀 +2 PTS', triples: '🔥 +3 PTS',
            rebotes: '🖐 REBOTE', robos: '🛡 ROBO', bloqueos: '🚫 BLOQUEO',
        };
        showToast(`${player.nombre.split(' ')[0]} — ${labels[accion] ?? accion}`,
            pts > 0 ? '#3b82f6' : '#10b981');

        try {
            // 1. Jugada en historial
            await addDoc(collection(db, 'jugadas_partido'), {
                partidoId: matchData.id,
                jugadorId: player.id,
                jugadorNombre: player.nombre,
                jugadorNumero: player.numero ?? '??',
                equipo: team,
                accion,
                puntos: pts,
                timestamp: Date.now(),
                cuarto: cuartoActual,
            });

            // 2. Marcador
            if (pts > 0) {
                const cuartoField = team === 'local'
                    ? `cuartosLocal.${cuartoActual}`
                    : `cuartosVisitante.${cuartoActual}`;
                await updateDoc(doc(db, colCal, matchData.id), {
                    [team === 'local' ? 'marcadorLocal' : 'marcadorVisitante']: increment(pts),
                    [cuartoField]: increment(pts),
                });
            }

            // 3. Stats acumuladas del jugador en este partido
            await setDoc(
                doc(db, 'stats_partido', `${matchData.id}_${player.id}`),
                {
                    partidoId: matchData.id,
                    jugadorId: player.id,
                    nombre: player.nombre,
                    numero: player.numero ?? '??',
                    equipo: team === 'local' ? matchData.equipoLocalNombre : matchData.equipoVisitanteNombre,
                    [accion]: increment(val),
                    ...(pts > 0 ? { puntos: increment(pts) } : {}),
                },
                { merge: true },
            );
        } catch (e) {
            showToast('Error al guardar ⚠️', '#ef4444');
            console.error(e);
        }
    }, [matchData, colCal, showToast]);

    // ── DESHACER jugada (cualquiera del historial) ──
    const handleDeleteJugada = useCallback(async (jugada: Jugada) => {
        if (!matchData) return;

        showConfirm(
            `¿Borrar "${jugada.accion.toUpperCase()}" de ${jugada.jugadorNombre}?`,
            async () => {
                try {
                    const pts = jugada.puntos ?? 0;

                    // 1. Borrar del historial
                    await deleteDoc(doc(db, 'jugadas_partido', jugada.id));

                    // 2. Restar del marcador si tenía puntos
                    if (pts > 0) {
                        await updateDoc(doc(db, colCal, matchData.id), {
                            [jugada.equipo === 'local' ? 'marcadorLocal' : 'marcadorVisitante']: increment(-pts),
                        });
                    }

                    // 3. Restar de stats_partido
                    const statRef = doc(db, 'stats_partido', `${matchData.id}_${jugada.jugadorId}`);
                    const statSnap = await getDoc(statRef);
                    if (statSnap.exists()) {
                        const updates: Record<string, any> = { [jugada.accion]: increment(-1) };
                        if (pts > 0) updates.puntos = increment(-pts);
                        await updateDoc(statRef, updates);
                    }

                    showToast('↩️ Jugada borrada', '#f59e0b');
                } catch (e) {
                    showToast('Error al borrar ⚠️', '#ef4444');
                    console.error(e);
                }
            }
        );
    }, [matchData, colCal, showToast]);

    // Atajo para el botón ↩️ DESHACER (borra la última)
    const handleUndo = useCallback(() => {
        const ultima = recentPlays[0];
        if (!ultima) { showToast('No hay jugadas para deshacer', '#f59e0b'); return; }
        handleDeleteJugada(ultima);
    }, [recentPlays, handleDeleteJugada, showToast]);

    // ── Finalizar partido ──
    const handleFinalize = useCallback(() => {
        if (!matchData) return;
        showConfirm('¿FINALIZAR PARTIDO Y ACTUALIZAR TABLAS?', async () => {
            try {
                const batch = writeBatch(db);
                const localGana = matchData.marcadorLocal > matchData.marcadorVisitante;
                const visitanteGana = matchData.marcadorVisitante > matchData.marcadorLocal;

                const lRef = doc(db, colTeams, matchData.equipoLocalId);
                const vRef = doc(db, colTeams, matchData.equipoVisitanteId);

                if (localGana) {
                    batch.update(lRef, { victorias: increment(1), puntos: increment(2), puntos_favor: increment(matchData.marcadorLocal), puntos_contra: increment(matchData.marcadorVisitante) });
                    batch.update(vRef, { derrotas: increment(1), puntos: increment(1), puntos_favor: increment(matchData.marcadorVisitante), puntos_contra: increment(matchData.marcadorLocal) });
                } else if (visitanteGana) {
                    batch.update(vRef, { victorias: increment(1), puntos: increment(2), puntos_favor: increment(matchData.marcadorVisitante), puntos_contra: increment(matchData.marcadorLocal) });
                    batch.update(lRef, { derrotas: increment(1), puntos: increment(1), puntos_favor: increment(matchData.marcadorLocal), puntos_contra: increment(matchData.marcadorVisitante) });
                } else {
                    // Empate (no debería pasar en basquetbol pero lo manejamos)
                    batch.update(lRef, { puntos_favor: increment(matchData.marcadorLocal), puntos_contra: increment(matchData.marcadorVisitante) });
                    batch.update(vRef, { puntos_favor: increment(matchData.marcadorVisitante), puntos_contra: increment(matchData.marcadorLocal) });
                }

                // Stats por jugador
                const statsSnap = await getDocs(
                    query(collection(db, 'stats_partido'), where('partidoId', '==', matchData.id))
                );
                statsSnap.forEach(sDoc => {
                    const s = sDoc.data();
                    batch.update(doc(db, colPlayers, s.jugadorId), {
                        puntos: increment(Number(s.puntos) || 0),
                        triples: increment(Number(s.triples) || 0),
                        rebotes: increment(Number(s.rebotes) || 0),
                        robos: increment(Number(s.robos) || 0),
                        bloqueos: increment(Number(s.bloqueos) || 0),
                        partidosJugados: increment(1),
                    });
                });

                batch.update(doc(db, colCal, matchData.id), { estatus: 'finalizado' });
                await batch.commit();
                // Limpiar estado guardado de la mesa al finalizar
                try { await deleteDoc(doc(db, 'mesa_estado', matchData.id)); } catch (_) {}
                showToast('✅ Partido finalizado', '#10b981');
                setTimeout(() => onClose(), 1200);
            } catch (e) {
                showToast('Error al finalizar ⚠️', '#ef4444');
                console.error(e);
            }
        });
    }, [matchData, colCal, colTeams, colPlayers, onClose, showToast]);

    // ── Sustitución ──
    const executeSwap = useCallback((newPlayerId: string) => {
        const { team, replacingId } = subModal;
        if (!replacingId) return;

        if (team === 'local') {
            setOnCourtLocal(prev => {
                const updated = prev.map(id => id === replacingId ? newPlayerId : id);
                saveEstado({ onCourtLocal: updated });
                return updated;
            });
        } else {
            setOnCourtVisitante(prev => {
                const updated = prev.map(id => id === replacingId ? newPlayerId : id);
                saveEstado({ onCourtVisitante: updated });
                return updated;
            });
        }
        setSubModal(s => ({ ...s, isOpen: false, replacingId: null }));
        showToast('🔄 Cambio realizado', '#8b5cf6');
    }, [subModal, showToast, saveEstado]);

    // ─────────────────────────────────────────────
    // PANTALLA 1: Selección de partido
    // ─────────────────────────────────────────────
    if (!selectedMatchId) return (
        <div style={{ padding: 20, color: 'white', background: '#000', minHeight: '100vh' }}>
            <h2 style={{ color: '#60a5fa', marginBottom: 20, fontSize: '1.1rem', fontWeight: 900 }}>
                ⏱️ Mesa Técnica — {categoria}
            </h2>
            {matches.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, border: '1px dashed #333', borderRadius: 15 }}>
                    <p style={{ color: '#666', fontSize: '0.85rem' }}>No hay juegos programados hoy.</p>
                </div>
            ) : matches.map(m => (
                <button key={m.id} onClick={() => setSelectedMatchId(m.id)} style={{
                    padding: 18, background: '#1a1a1a', border: '1px solid #333',
                    borderRadius: 10, color: 'white', width: '100%', marginBottom: 10,
                    textAlign: 'left', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
                }}>
                    🏀 {m.equipoLocalNombre} vs {m.equipoVisitanteNombre}
                    <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: 4 }}>{m.hora} — {m.fechaAsignada}</div>
                </button>
            ))}
            <button onClick={onClose} style={{ marginTop: 20, padding: 14, width: '100%', background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: 10, fontWeight: 700 }}>
                ← VOLVER
            </button>
        </div>
    );

    // ─────────────────────────────────────────────
    // PANTALLA 2: Check-in de asistencia
    // ─────────────────────────────────────────────
    if (!checkInDone) {
        const PlayerCheckItem = ({ p, present, setPresent, color }: any) => (
            <div
                onClick={() => setPresent((prev: string[]) =>
                    prev.includes(p.id) ? prev.filter((id: string) => id !== p.id) : [...prev, p.id]
                )}
                style={{
                    padding: '12px 14px', marginBottom: 6, borderRadius: 8, fontSize: '0.82rem',
                    background: present.includes(p.id) ? color : '#1a1a1a',
                    border: `1px solid ${present.includes(p.id) ? color : '#2d2d2d'}`,
                    cursor: 'pointer', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 10,
                }}
            >
                <span style={{ opacity: present.includes(p.id) ? 1 : 0.4 }}>
                    {present.includes(p.id) ? '✓' : '○'}
                </span>
                #{p.numero} — {p.nombre}
            </div>
        );

        return (
            <div style={{ background: '#000', minHeight: '100vh', color: 'white', padding: 15, display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ textAlign: 'center', color: '#60a5fa', marginBottom: 16, fontWeight: 900 }}>
                    REGISTRO DE ASISTENCIA
                </h3>
                <div style={{ flex: 1, display: 'flex', gap: 10, overflow: 'hidden' }}>
                    {/* Local */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ background: '#1e3a8a', padding: '6px 10px', fontSize: '0.65rem', fontWeight: 900, textAlign: 'center', borderRadius: 6, marginBottom: 8 }}>
                            LOCAL ({presentLocal.length})
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {playersLocal.map(p => (
                                <PlayerCheckItem key={p.id} p={p} present={presentLocal} setPresent={setPresentLocal} color="#3b82f6" />
                            ))}
                        </div>
                    </div>
                    {/* Visitante */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ background: '#854d0e', padding: '6px 10px', fontSize: '0.65rem', fontWeight: 900, textAlign: 'center', borderRadius: 6, marginBottom: 8 }}>
                            VISITANTE ({presentVisitante.length})
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {playersVisitante.map(p => (
                                <PlayerCheckItem key={p.id} p={p} present={presentVisitante} setPresent={setPresentVisitante} color="#ef4444" />
                            ))}
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => {
                        setCheckInDone(true);
                        saveEstado({ presentLocal, presentVisitante, checkInDone: true });
                    }}
                    disabled={presentLocal.length < 5 || presentVisitante.length < 5}
                    style={{
                        padding: 16, marginTop: 12, borderRadius: 12, border: 'none',
                        background: presentLocal.length >= 5 && presentVisitante.length >= 5 ? '#10b981' : '#1e293b',
                        color: 'white', fontWeight: 900, fontSize: '0.85rem', cursor: 'pointer',
                    }}
                >
                    {presentLocal.length >= 5 && presentVisitante.length >= 5
                        ? 'CONTINUAR → ABRIDORES'
                        : `Selecciona al menos 5 por equipo (${presentLocal.length}/${presentVisitante.length})`}
                </button>
            </div>
        );
    }

    // ─────────────────────────────────────────────
    // PANTALLA 3: Selección de 5 abridores
    // ─────────────────────────────────────────────
    if (!startersDone) {
        const StarterItem = ({ p, onCourt, setOnCourt, color }: any) => (
            <div
                onClick={() => setOnCourt((prev: string[]) =>
                    prev.includes(p.id)
                        ? prev.filter((id: string) => id !== p.id)
                        : prev.length < 5 ? [...prev, p.id] : prev
                )}
                style={{
                    padding: '12px 14px', marginBottom: 6, borderRadius: 8, fontSize: '0.82rem',
                    background: onCourt.includes(p.id) ? color : '#1a1a1a',
                    border: `1px solid ${onCourt.includes(p.id) ? color : '#2d2d2d'}`,
                    cursor: 'pointer', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 10,
                }}
            >
                <span style={{ opacity: onCourt.includes(p.id) ? 1 : 0.3 }}>
                    {onCourt.includes(p.id) ? '✓' : '○'}
                </span>
                #{p.numero} — {p.nombre}
            </div>
        );

        return (
            <div style={{ background: '#000', minHeight: '100vh', color: 'white', padding: 15, display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ textAlign: 'center', color: '#a78bfa', fontWeight: 900, marginBottom: 16 }}>
                    SELECCIONAR 5 ABRIDORES
                </h3>
                <div style={{ flex: 1, display: 'flex', gap: 10, overflow: 'hidden' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ background: '#1e3a8a', padding: '6px 10px', fontSize: '0.65rem', fontWeight: 900, textAlign: 'center', borderRadius: 6, marginBottom: 8 }}>
                            LOCAL {onCourtLocal.length}/5
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {playersLocal.filter(p => presentLocal.includes(p.id)).map(p => (
                                <StarterItem key={p.id} p={p} onCourt={onCourtLocal} setOnCourt={setOnCourtLocal} color="#3b82f6" />
                            ))}
                        </div>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ background: '#854d0e', padding: '6px 10px', fontSize: '0.65rem', fontWeight: 900, textAlign: 'center', borderRadius: 6, marginBottom: 8 }}>
                            VISITANTE {onCourtVisitante.length}/5
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            {playersVisitante.filter(p => presentVisitante.includes(p.id)).map(p => (
                                <StarterItem key={p.id} p={p} onCourt={onCourtVisitante} setOnCourt={setOnCourtVisitante} color="#ef4444" />
                            ))}
                        </div>
                    </div>
                </div>
                <button
                    onClick={() => {
                        setStartersDone(true);
                        saveEstado({
                            presentLocal, presentVisitante,
                            onCourtLocal, onCourtVisitante,
                            checkInDone: true, startersDone: true,
                        });
                    }}
                    disabled={onCourtLocal.length !== 5 || onCourtVisitante.length !== 5}
                    style={{
                        padding: 16, marginTop: 12, borderRadius: 12, border: 'none',
                        background: onCourtLocal.length === 5 && onCourtVisitante.length === 5 ? '#7c3aed' : '#1e293b',
                        color: 'white', fontWeight: 900, fontSize: '0.85rem', cursor: 'pointer',
                    }}
                >
                    {onCourtLocal.length === 5 && onCourtVisitante.length === 5 ? '🏀 INICIAR PARTIDO' : `Selecciona 5 por equipo`}
                </button>
            </div>
        );
    }

    // ─────────────────────────────────────────────
    // Esperando verificación de estado en Firestore
    // ─────────────────────────────────────────────
    if (startersDone && estadoRestaurado === null) return (
        <div style={{ background: '#000', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', gap: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #334155', borderTop: '3px solid #60a5fa', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ color: '#475569', fontSize: '0.8rem', letterSpacing: '1px' }}>Restaurando partido...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    // ─────────────────────────────────────────────
    // PANTALLA 4: Mesa técnica activa
    // ─────────────────────────────────────────────
    return (
        <div style={{ background: '#000', height: '100vh', display: 'flex', flexDirection: 'column', color: 'white', overflow: 'hidden' }}>
            <style>{`
                @keyframes toastIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
                    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
                }
            `}</style>

            {/* Banner de estado restaurado */}
            {estadoRestaurado === true && (
                <div style={{
                    background: '#065f46', color: '#6ee7b7',
                    fontSize: '0.65rem', fontWeight: 700,
                    textAlign: 'center', padding: '6px 16px',
                    letterSpacing: '0.5px',
                }}>
                    ♻️ PARTIDO RESTAURADO — los titulares y estadísticas fueron recuperados
                </div>
            )}

            {/* Toast de feedback */}
            {toast && <Toast msg={toast.msg} color={toast.color} />}

            {/* Modales */}
            {confirmModal && (
                <ConfirmModal
                    mensaje={confirmModal.msg}
                    onConfirm={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                    onCancel={() => setConfirmModal(null)}
                />
            )}

            {/* ── Scoreboard + Cuartos + Acciones ── */}
            <div style={{ background: '#0a0f1e', borderBottom: '2px solid #1e293b' }}>

                {/* Fila 1: marcador */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-end', overflow: 'hidden' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {matchData?.equipoLocalNombre}
                        </span>
                        <img src={logos.local} alt="L" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', background: 'white', border: '2px solid #3b82f6', flexShrink: 0 }} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1e293b', padding: '4px 14px', borderRadius: 10, border: '1px solid #334155', flexShrink: 0 }}>
                        <span style={{ fontSize: '1.7rem', fontWeight: 900 }}>{matchData?.marcadorLocal ?? 0}</span>
                        <span style={{ fontSize: '0.6rem', color: '#475569' }}>—</span>
                        <span style={{ fontSize: '1.7rem', fontWeight: 900 }}>{matchData?.marcadorVisitante ?? 0}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'flex-start', overflow: 'hidden' }}>
                        <img src={logos.visitante} alt="V" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', background: 'white', border: '2px solid #ef4444', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, fontSize: '0.7rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {matchData?.equipoVisitanteNombre}
                        </span>
                    </div>
                </div>

                {/* Fila 2: cuartos + acciones en la misma barra */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '4px 6px', gap: 4, background: '#0f172a' }}>
                    {/* Selector de cuarto */}
                    {['Q1','Q2','Q3','Q4','TE'].map(q => (
                        <button key={q} onClick={() => { setCuartoActual(q); saveEstado({ cuartoActual: q }); }} style={{
                            padding: '6px 10px', borderRadius: 8, border: 'none',
                            background: cuartoActual === q ? '#3b82f6' : '#1e293b',
                            color: cuartoActual === q ? 'white' : '#64748b',
                            fontWeight: 900, cursor: 'pointer', fontSize: '0.78rem', flexShrink: 0,
                        }}>{q}</button>
                    ))}

                    {/* Separador */}
                    <div style={{ flex: 1 }} />

                    {/* Acciones */}
                    <button onClick={() => setSelectedMatchId(null)} style={actionBtnStyle('#1e293b')}>SALIR</button>
                    <button onClick={handleUndo} style={actionBtnStyle('#92400e')}>↩️</button>
                    <button onClick={() => setIsHistoryOpen(true)} style={actionBtnStyle('#334155')}>📜</button>
                    <button onClick={handleFinalize} style={{ ...actionBtnStyle('#065f46'), fontWeight: 900, paddingLeft: 10, paddingRight: 10 }}>✅ FINAL</button>
                </div>


            </div>

            {/* ── Jugadores en cancha ── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* LOCAL */}
                <div style={{ flex: 1, padding: '6px 5px', borderRight: '1px solid #1e293b', overflowY: 'auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 6, background: '#1e3a8a', padding: '4px 0', borderRadius: 6, fontSize: '0.62rem', fontWeight: 900 }}>
                        LOCAL
                    </div>
                    {playersLocal.filter(p => onCourtLocal.includes(p.id)).map(p => (
                        <PlayerRow
                            key={p.id}
                            player={p}
                            team="local"
                            stats={statsCache[p.id] ?? {}}
                            onStat={handleStat}
                            onSub={id => setSubModal({ team: 'local', replacingId: id, isOpen: true })}
                            flashing={flashMap[`${p.id}_`] ?? null}
                        />
                    ))}
                </div>

                {/* VISITANTE */}
                <div style={{ flex: 1, padding: '6px 5px', overflowY: 'auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: 6, background: '#7f1d1d', padding: '4px 0', borderRadius: 6, fontSize: '0.62rem', fontWeight: 900 }}>
                        VISITANTE
                    </div>
                    {playersVisitante.filter(p => onCourtVisitante.includes(p.id)).map(p => (
                        <PlayerRow
                            key={p.id}
                            player={p}
                            team="visitante"
                            stats={statsCache[p.id] ?? {}}
                            onStat={handleStat}
                            onSub={id => setSubModal({ team: 'visitante', replacingId: id, isOpen: true })}
                            flashing={flashMap[`${p.id}_`] ?? null}
                        />
                    ))}
                </div>
            </div>



            {/* ── Modal de sustitución ── */}
            {subModal.isOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', zIndex: 4000, padding: 20, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ background: '#1e293b', width: '100%', maxWidth: 380, borderRadius: 16, overflow: 'hidden', border: '1px solid #334155' }}>
                        <div style={{ padding: '16px 20px', background: '#0f172a', textAlign: 'center', fontWeight: 900, fontSize: '0.85rem', color: '#60a5fa' }}>
                            ¿QUIÉN ENTRA POR EL #{(subModal.team === 'local' ? playersLocal : playersVisitante).find(p => p.id === subModal.replacingId)?.numero ?? '??'}?
                        </div>
                        <div style={{ maxHeight: 340, overflowY: 'auto', padding: 10 }}>
                            {(subModal.team === 'local' ? playersLocal : playersVisitante)
                                .filter(p =>
                                    (subModal.team === 'local' ? presentLocal : presentVisitante).includes(p.id) &&
                                    !(subModal.team === 'local' ? onCourtLocal : onCourtVisitante).includes(p.id)
                                )
                                .map(p => (
                                    <div key={p.id} onClick={() => executeSwap(p.id)} style={{
                                        padding: '14px 16px', borderBottom: '1px solid #0f172a',
                                        cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                                        color: 'white', fontWeight: 700, fontSize: '0.85rem',
                                        borderRadius: 8, marginBottom: 4,
                                        background: '#0f172a',
                                    }}>
                                        <span>#{p.numero} — {p.nombre}</span>
                                        <span style={{ color: '#10b981' }}>ENTRAR ➔</span>
                                    </div>
                                ))}
                        </div>
                        <button onClick={() => setSubModal(s => ({ ...s, isOpen: false }))} style={{ width: '100%', padding: 14, background: '#334155', color: '#94a3b8', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                            CANCELAR
                        </button>
                    </div>
                </div>
            )}

            {/* ── Modal historial ── */}
            {isHistoryOpen && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', zIndex: 4000, padding: 20, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div style={{ background: '#1e293b', width: '100%', maxWidth: 400, borderRadius: 16, overflow: 'hidden', maxHeight: '80vh', display: 'flex', flexDirection: 'column', border: '1px solid #334155' }}>
                        <div style={{ padding: '14px 20px', background: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 900, fontSize: '0.85rem' }}>
                            <span>📜 HISTORIAL DE JUGADAS</span>
                            <button onClick={() => setIsHistoryOpen(false)} style={{ background: '#334155', border: 'none', color: 'white', borderRadius: '50%', width: 28, height: 28, cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1, padding: 10 }}>
                            {recentPlays.length === 0 && (
                                <p style={{ textAlign: 'center', color: '#475569', padding: 20, fontSize: '0.8rem' }}>Sin jugadas registradas</p>
                            )}
                            {recentPlays.map((play, i) => (
                                <div key={play.id} style={{
                                    padding: '10px 14px', marginBottom: 4, borderRadius: 8,
                                    background: i === 0 ? '#0f2d1f' : '#0f172a',
                                    border: `1px solid ${i === 0 ? '#10b981' : '#1e293b'}`,
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    gap: 8,
                                }}>
                                    {/* Info de la jugada */}
                                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0 }}>
                                        <span style={{
                                            background: play.equipo === 'local' ? '#1e3a8a' : '#7f1d1d',
                                            color: 'white', padding: '2px 7px', borderRadius: 4,
                                            fontWeight: 900, fontSize: '0.72rem', flexShrink: 0,
                                        }}>
                                            #{play.jugadorNumero}
                                        </span>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {play.jugadorNombre}
                                            </div>
                                            <div style={{ fontSize: '0.55rem', color: i === 0 ? '#10b981' : '#475569' }}>
                                                {i === 0 ? '← última' : `#${i + 1}`}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Acción */}
                                    <span style={{
                                        fontWeight: 900, flexShrink: 0,
                                        color: play.puntos > 0 ? '#10b981' : '#f59e0b',
                                        fontSize: '0.72rem',
                                    }}>
                                        {play.accion.toUpperCase()}
                                        {play.puntos > 0 && ` +${play.puntos}`}
                                    </span>

                                    {/* Botón borrar esta jugada */}
                                    <button
                                        onClick={() => handleDeleteJugada(play)}
                                        style={{
                                            background: 'rgba(239,68,68,0.15)',
                                            border: '1px solid rgba(239,68,68,0.3)',
                                            color: '#f87171', borderRadius: 6,
                                            width: 28, height: 28, flexShrink: 0,
                                            cursor: 'pointer', fontSize: '0.75rem',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}
                                        title="Borrar esta jugada"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const actionBtnStyle = (bg: string): React.CSSProperties => ({
    padding: '6px 10px', background: bg, color: 'white',
    border: 'none', borderRadius: 8, fontWeight: 700,
    fontSize: '0.72rem', cursor: 'pointer', flexShrink: 0,
});

export default MesaTecnica;