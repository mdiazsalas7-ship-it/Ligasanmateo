import React, { useEffect, useState } from 'react';
import { db } from './firebase';
import {
    collection, query, where, onSnapshot,
    orderBy, limit, doc, getDocs
} from 'firebase/firestore';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
interface Jugada {
    id: string;
    jugadorNombre: string;
    jugadorNumero: string;
    equipo: 'local' | 'visitante';
    accion: string;
    puntos: number;
    timestamp: number;
    cuarto?: string;
}

interface PartidoVivo {
    id: string;
    equipoLocalNombre: string;
    equipoVisitanteNombre: string;
    equipoLocalId?: string;
    equipoVisitanteId?: string;
    marcadorLocal: number;
    marcadorVisitante: number;
    cuartosLocal?: Record<string, number>;
    cuartosVisitante?: Record<string, number>;
    logoLocal?: string;
    logoVisitante?: string;
    categoria?: string;
    enVivo?: boolean;
}

const ACCIONES: Record<string, { label: string; icon: string; color: string }> = {
    tirosLibres: { label: 'Tiro Libre',  icon: '🎯', color: '#475569' },
    dobles:      { label: 'Doble',       icon: '🏀', color: '#1e40af' },
    triples:     { label: 'Triple',      icon: '🔥', color: '#7c3aed' },
    rebotes:     { label: 'Rebote',      icon: '🖐️', color: '#047857' },
    robos:       { label: 'Robo',        icon: '🛡️', color: '#b45309' },
    bloqueos:    { label: 'Bloqueo',     icon: '🚫', color: '#991b1b' },
};

const DEFAULT_LOGO = 'https://cdn-icons-png.flaticon.com/512/166/166344.png';

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
const LiveGameViewer: React.FC<{
    partidoId: string;
    categoria: string;
    onClose: () => void;
}> = ({ partidoId, categoria, onClose }) => {
    const [partido, setPartido]   = useState<PartidoVivo | null>(null);
    const [jugadas, setJugadas]   = useState<Jugada[]>([]);
    const [lastJugada, setLastJugada] = useState<Jugada | null>(null);
    const [flash, setFlash]       = useState(false);

    const colCal = categoria.trim().toUpperCase() === 'MASTER40'
        ? 'calendario' : `calendario_${categoria.trim().toUpperCase()}`;

    // ── Partido en tiempo real ──
    useEffect(() => {
        const unsub = onSnapshot(doc(db, colCal, partidoId), snap => {
            if (snap.exists()) setPartido({ id: snap.id, ...snap.data() } as PartidoVivo);
        });
        return unsub;
    }, [partidoId, colCal]);

    // ── Logos de equipos ──
    const [logos, setLogos] = useState<{ local: string; visitante: string }>({ local: DEFAULT_LOGO, visitante: DEFAULT_LOGO });

    useEffect(() => {
        if (!partido) return;
        const colEq = categoria.trim().toUpperCase() === 'MASTER40'
            ? 'equipos' : `equipos_${categoria.trim().toUpperCase()}`;
        getDocs(collection(db, colEq)).then(snap => {
            const map: Record<string, string> = {};
            snap.docs.forEach(d => {
                const data = d.data();
                if (data.nombre) map[data.nombre.trim().toUpperCase()] = data.logoUrl || DEFAULT_LOGO;
                if (d.id) map[d.id] = data.logoUrl || DEFAULT_LOGO;
            });
            setLogos({
                local: map[partido.equipoLocalId ?? ''] || map[(partido.equipoLocalNombre ?? '').trim().toUpperCase()] || DEFAULT_LOGO,
                visitante: map[partido.equipoVisitanteId ?? ''] || map[(partido.equipoVisitanteNombre ?? '').trim().toUpperCase()] || DEFAULT_LOGO,
            });
        }).catch(() => {});
    }, [partido?.equipoLocalId, partido?.equipoVisitanteId, categoria]);

    // ── Info de jugadores (jugadorId → {nombre, numero, fotoUrl}) ──
    const [playerInfo, setPlayerInfo] = useState<Record<string, { nombre: string; numero: string; fotoUrl: string }>>({});
    useEffect(() => {
        const cat = categoria.trim().toUpperCase();
        const colJug = cat === 'MASTER40' ? 'jugadores' : `jugadores_${cat}`;
        getDocs(collection(db, colJug)).then(snap => {
            const map: Record<string, { nombre: string; numero: string; fotoUrl: string }> = {};
            snap.docs.forEach(d => {
                const data = d.data();
                map[d.id] = {
                    nombre: data.nombre || '',
                    numero: String(data.numero ?? ''),
                    fotoUrl: data.fotoUrl || '',
                };
            });
            setPlayerInfo(map);
        }).catch(() => {});
    }, [categoria]);

    // ── Mesa estado en tiempo real (5 en cancha) ──
    const [mesaEstado, setMesaEstado] = useState<any>(null);
    useEffect(() => {
        const unsub = onSnapshot(doc(db, 'mesa_estado', partidoId), snap => {
            if (snap.exists()) setMesaEstado(snap.data());
        });
        return unsub;
    }, [partidoId]);

    // ── Jugadas en tiempo real ──
    useEffect(() => {
        const q = query(
            collection(db, 'jugadas_partido'),
            where('partidoId', '==', partidoId),
            orderBy('timestamp', 'desc'),
            limit(200)
        );
        const unsub = onSnapshot(q, snap => {
            const plays = snap.docs.map(d => ({ id: d.id, ...d.data() } as Jugada));
            setJugadas(plays);
            if (plays.length > 0) {
                setLastJugada(plays[0]);
                setFlash(true);
                setTimeout(() => setFlash(false), 800);
            }
        });
        return unsub;
    }, [partidoId]);

    if (!partido) return (
        <div style={{ minHeight: '100vh', background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #334155', borderTop: '3px solid #3b82f6', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ color: '#475569', fontSize: '0.8rem' }}>Conectando al partido...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    );

    const local = partido.marcadorLocal ?? 0;
    const visit = partido.marcadorVisitante ?? 0;
    const localGana = local > visit;
    const visitGana = visit > local;
    const cuartoActual = jugadas[0]?.cuarto ?? 'Q1';

    // Stats en vivo calculadas de jugadas
    const statsLocal: Record<string, number>   = {};
    const statsVisita: Record<string, number>  = {};
    jugadas.forEach(j => {
        const map = j.equipo === 'local' ? statsLocal : statsVisita;
        map[j.accion] = (map[j.accion] ?? 0) + 1;
    });
    const ptsLocal   = (statsLocal.tirosLibres ?? 0) + (statsLocal.dobles ?? 0) * 2   + (statsLocal.triples ?? 0) * 3;
    const ptsVisita  = (statsVisita.tirosLibres ?? 0) + (statsVisita.dobles ?? 0) * 2 + (statsVisita.triples ?? 0) * 3;

    // ── BOX SCORE: stats acumuladas por jugador ──
    interface BoxRow {
        jugadorId: string;
        nombre: string;
        numero: string;
        equipo: 'local' | 'visitante';
        pts: number; reb: number; rob: number; blo: number;
        dobles: number; triples: number; tl: number;
    }
    const boxByPlayer: Record<string, BoxRow> = {};
    jugadas.forEach(j => {
        const key = j.jugadorId || `${j.equipo}_${j.jugadorNombre}_${j.jugadorNumero}`;
        if (!boxByPlayer[key]) {
            boxByPlayer[key] = {
                jugadorId: j.jugadorId || key,
                nombre: j.jugadorNombre || '?',
                numero: j.jugadorNumero || '',
                equipo: j.equipo,
                pts: 0, reb: 0, rob: 0, blo: 0,
                dobles: 0, triples: 0, tl: 0,
            };
        }
        const row = boxByPlayer[key];
        if (j.accion === 'dobles')      { row.dobles++;  row.pts += 2; }
        else if (j.accion === 'triples'){ row.triples++; row.pts += 3; }
        else if (j.accion === 'tirosLibres') { row.tl++; row.pts += 1; }
        else if (j.accion === 'rebotes'){ row.reb++; }
        else if (j.accion === 'robos')  { row.rob++; }
        else if (j.accion === 'bloqueos'){ row.blo++; }
    });
    const boxLocal    = Object.values(boxByPlayer).filter(r => r.equipo === 'local').sort((a, b) => b.pts - a.pts);
    const boxVisita   = Object.values(boxByPlayer).filter(r => r.equipo === 'visitante').sort((a, b) => b.pts - a.pts);

    // ── TOP PERFORMERS ──
    const allBoxRows = Object.values(boxByPlayer);
    const topScorer = allBoxRows.length ? allBoxRows.reduce((a, b) => b.pts > a.pts ? b : a) : null;
    const topTri    = allBoxRows.length ? allBoxRows.reduce((a, b) => b.triples > a.triples ? b : a) : null;
    const topReb    = allBoxRows.length ? allBoxRows.reduce((a, b) => b.reb > a.reb ? b : a) : null;
    const topRob    = allBoxRows.length ? allBoxRows.reduce((a, b) => b.rob > a.rob ? b : a) : null;
    const topBlo    = allBoxRows.length ? allBoxRows.reduce((a, b) => b.blo > a.blo ? b : a) : null;

    // ── HOT STREAK: ¿hay un jugador con 3+ anotaciones en las últimas 7 jugadas? ──
    interface HotPlayer {
        jugadorId: string;
        nombre: string;
        numero: string;
        equipo: 'local' | 'visitante';
        racha: number;
    }
    let hotPlayer: HotPlayer | null = null;
    {
        const ventana = jugadas.slice(0, 7); // las 7 más recientes (orden desc)
        const counts: Record<string, HotPlayer> = {};
        ventana.forEach(j => {
            if (j.puntos > 0) {
                const key = j.jugadorId || `${j.equipo}_${j.jugadorNombre}`;
                if (!counts[key]) counts[key] = {
                    jugadorId: j.jugadorId || key,
                    nombre: j.jugadorNombre || '?',
                    numero: j.jugadorNumero || '',
                    equipo: j.equipo,
                    racha: 0,
                };
                counts[key].racha++;
            }
        });
        const hot = Object.values(counts).filter(c => c.racha >= 3).sort((a, b) => b.racha - a.racha);
        hotPlayer = hot[0] || null;
    }

    return (
        <div style={{ minHeight: '100vh', background: '#020617', color: 'white', fontFamily: "'Inter','Segoe UI',sans-serif", paddingBottom: 80 }}>
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes flashIn { 0% { opacity:0; transform: translateY(-6px); } 100% { opacity:1; transform: translateY(0); } }
                @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
            `}</style>

            {/* ── HEADER ── */}
            <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
                    <span style={{ fontSize: '0.7rem', fontWeight: 900, color: '#ef4444', letterSpacing: '1.5px' }}>EN VIVO</span>
                    <span style={{ fontSize: '0.6rem', color: '#475569', marginLeft: 4 }}>{partido.categoria?.toUpperCase() ?? categoria}</span>
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 700 }}>
                    ✕ CERRAR
                </button>
            </div>

            {/* ── SCOREBOARD ── */}
            <div style={{ padding: '20px 16px 0' }}>
                <div style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', borderRadius: 20, padding: '20px 16px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 16 }}>

                    {/* Cuarto actual */}
                    <div style={{ textAlign: 'center', marginBottom: 16 }}>
                        <span style={{ background: '#3b82f6', color: 'white', padding: '3px 14px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 900 }}>
                            {cuartoActual}
                        </span>
                    </div>

                    {/* Equipos y marcador */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        {/* LOCAL */}
                        <div style={{ flex: 1, textAlign: 'center' }}>
                            <img src={logos.local} alt="L"
                                style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', background: 'white', border: `2px solid ${localGana ? '#fbbf24' : 'rgba(255,255,255,0.1)'}`, marginBottom: 8 }}
                                onError={e => { (e.target as HTMLImageElement).src = DEFAULT_LOGO; }} />
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: localGana ? '#fbbf24' : 'rgba(255,255,255,0.8)', lineHeight: 1.2 }}>
                                {partido.equipoLocalNombre}
                            </div>
                        </div>

                        {/* SCORE */}
                        <div style={{ textAlign: 'center', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.3)', padding: '10px 20px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                                <span style={{ fontSize: '3rem', fontWeight: 900, color: localGana ? '#fbbf24' : 'white', lineHeight: 1, transition: 'color 0.3s' }}>{local}</span>
                                <span style={{ fontSize: '1rem', color: '#334155', fontWeight: 900 }}>—</span>
                                <span style={{ fontSize: '3rem', fontWeight: 900, color: visitGana ? '#fbbf24' : 'white', lineHeight: 1, transition: 'color 0.3s' }}>{visit}</span>
                            </div>
                            <div style={{ fontSize: '0.5rem', color: '#334155', marginTop: 4, letterSpacing: '1px' }}>MARCADOR</div>
                        </div>

                        {/* VISITANTE */}
                        <div style={{ flex: 1, textAlign: 'center' }}>
                            <img src={logos.visitante} alt="V"
                                style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', background: 'white', border: `2px solid ${visitGana ? '#fbbf24' : 'rgba(255,255,255,0.1)'}`, marginBottom: 8 }}
                                onError={e => { (e.target as HTMLImageElement).src = DEFAULT_LOGO; }} />
                            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: visitGana ? '#fbbf24' : 'rgba(255,255,255,0.8)', lineHeight: 1.2 }}>
                                {partido.equipoVisitanteNombre}
                            </div>
                        </div>
                    </div>

                    {/* Puntos por cuarto — mini box score */}
                    {(partido.cuartosLocal || partido.cuartosVisitante) && (() => {
                        const qL = partido.cuartosLocal ?? {};
                        const qV = partido.cuartosVisitante ?? {};
                        const qs = ['Q1','Q2','Q3','Q4','TE'].filter(q => (qL[q] ?? 0) + (qV[q] ?? 0) > 0);
                        if (!qs.length) return null;

                        const totL = qs.reduce((s, q) => s + (qL[q] ?? 0), 0);
                        const totV = qs.reduce((s, q) => s + (qV[q] ?? 0), 0);

                        // Abreviar nombre del equipo a 3 letras
                        const abbr = (n?: string) => (n || '').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase() || '---';

                        return (
                            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <div style={{
                                    background: 'rgba(0,0,0,0.35)', borderRadius: 10,
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    overflow: 'hidden',
                                }}>
                                    {/* Header con los cuartos */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: `60px repeat(${qs.length}, 1fr) 1fr`,
                                        background: 'rgba(255,255,255,0.04)',
                                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                                    }}>
                                        <div style={{ padding: '6px 8px', fontSize: '0.5rem', color: '#64748b', fontWeight: 800, letterSpacing: '1px' }}>
                                            EQUIPO
                                        </div>
                                        {qs.map(q => (
                                            <div key={q} style={{
                                                padding: '6px 0', textAlign: 'center',
                                                fontSize: '0.55rem', fontWeight: 900,
                                                color: q === cuartoActual ? '#3b82f6' : '#64748b',
                                                letterSpacing: '0.5px',
                                                background: q === cuartoActual ? 'rgba(59,130,246,0.1)' : 'transparent',
                                            }}>
                                                {q}
                                            </div>
                                        ))}
                                        <div style={{ padding: '6px 0', textAlign: 'center', fontSize: '0.55rem', color: '#fbbf24', fontWeight: 900, letterSpacing: '0.5px' }}>
                                            TOT
                                        </div>
                                    </div>

                                    {/* Fila LOCAL */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: `60px repeat(${qs.length}, 1fr) 1fr`,
                                        alignItems: 'center',
                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px' }}>
                                            <img src={logos.local} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', background: 'white', border: '1px solid rgba(59,130,246,0.5)' }} />
                                            <span style={{ fontSize: '0.6rem', fontWeight: 900, color: '#3b82f6', letterSpacing: '0.5px' }}>{abbr(partido.equipoLocalNombre)}</span>
                                        </div>
                                        {qs.map(q => (
                                            <div key={q} style={{
                                                padding: '8px 0', textAlign: 'center',
                                                fontSize: '0.85rem', fontWeight: 900,
                                                color: q === cuartoActual ? '#60a5fa' : 'rgba(255,255,255,0.85)',
                                                background: q === cuartoActual ? 'rgba(59,130,246,0.08)' : 'transparent',
                                            }}>
                                                {qL[q] ?? 0}
                                            </div>
                                        ))}
                                        <div style={{ padding: '8px 0', textAlign: 'center', fontSize: '0.95rem', fontWeight: 900, color: totL >= totV ? '#fbbf24' : 'white' }}>
                                            {totL}
                                        </div>
                                    </div>

                                    {/* Fila VISITANTE */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: `60px repeat(${qs.length}, 1fr) 1fr`,
                                        alignItems: 'center',
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px' }}>
                                            <img src={logos.visitante} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', background: 'white', border: '1px solid rgba(239,68,68,0.5)' }} />
                                            <span style={{ fontSize: '0.6rem', fontWeight: 900, color: '#ef4444', letterSpacing: '0.5px' }}>{abbr(partido.equipoVisitanteNombre)}</span>
                                        </div>
                                        {qs.map(q => (
                                            <div key={q} style={{
                                                padding: '8px 0', textAlign: 'center',
                                                fontSize: '0.85rem', fontWeight: 900,
                                                color: q === cuartoActual ? '#f87171' : 'rgba(255,255,255,0.85)',
                                                background: q === cuartoActual ? 'rgba(239,68,68,0.08)' : 'transparent',
                                            }}>
                                                {qV[q] ?? 0}
                                            </div>
                                        ))}
                                        <div style={{ padding: '8px 0', textAlign: 'center', fontSize: '0.95rem', fontWeight: 900, color: totV >= totL ? '#fbbf24' : 'white' }}>
                                            {totV}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </div>

                {/* ────────────────────────────────────────────────── */}
                {/* ── 🔥 HOT STREAK (NBA Jam style)                  ── */}
                {/* ────────────────────────────────────────────────── */}
                {hotPlayer && (
                    <div style={{
                        background: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 50%, #f97316 100%)',
                        borderRadius: 14, padding: '12px 14px', marginBottom: 14,
                        display: 'flex', alignItems: 'center', gap: 12,
                        boxShadow: '0 0 30px rgba(249,115,22,0.5)',
                        border: '1.5px solid #fb923c',
                        animation: 'pulse 1.8s infinite',
                        position: 'relative', overflow: 'hidden',
                    }}>
                        <div style={{ fontSize: '2rem', flexShrink: 0, filter: 'drop-shadow(0 0 8px #fef08a)' }}>🔥</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 900, letterSpacing: '2px', color: '#fef08a', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                                ON FIRE
                            </div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 900, color: 'white', textShadow: '0 1px 4px rgba(0,0,0,0.6)', lineHeight: 1.2 }}>
                                #{hotPlayer.numero} {hotPlayer.nombre}
                            </div>
                            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.95)', fontWeight: 700, marginTop: 2 }}>
                                {hotPlayer.racha} anotaciones consecutivas · {hotPlayer.equipo === 'local' ? partido.equipoLocalNombre : partido.equipoVisitanteNombre}
                            </div>
                        </div>
                        <div style={{ fontSize: '2rem', flexShrink: 0, filter: 'drop-shadow(0 0 8px #fef08a)' }}>🔥</div>
                    </div>
                )}

                {/* ────────────────────────────────────────────────── */}
                {/* ── 🏆 TOP PERFORMERS                              ── */}
                {/* ────────────────────────────────────────────────── */}
                {(topScorer && topScorer.pts > 0) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                        {[
                            { label: 'GOLEADOR', icon: '🏀', stat: topScorer.pts,      unit: 'PTS', p: topScorer, color: '#fbbf24' },
                            { label: 'TRIPLES',  icon: '🔥', stat: topTri?.triples ?? 0, unit: '3PT', p: topTri,    color: '#7c3aed' },
                            { label: 'REBOTES',  icon: '🖐️', stat: topReb?.reb ?? 0,     unit: 'REB', p: topReb,    color: '#10b981' },
                            { label: 'ROBOS',    icon: '🛡️', stat: topRob?.rob ?? 0,     unit: 'ROB', p: topRob,    color: '#a855f7' },
                            { label: 'BLOQUEOS', icon: '🚫', stat: topBlo?.blo ?? 0,     unit: 'BLO', p: topBlo,    color: '#f87171' },
                        ].filter(c => c.p && c.stat > 0).slice(0, 4).map(c => {
                            const foto = playerInfo[c.p!.jugadorId]?.fotoUrl || '';
                            const inicial = (c.p!.nombre || '?').charAt(0).toUpperCase();
                            return (
                                <div key={c.label} style={{
                                    background: 'rgba(255,255,255,0.04)',
                                    border: `1.5px solid ${c.color}40`,
                                    borderRadius: 12, padding: '10px 8px', textAlign: 'center',
                                    boxShadow: `0 4px 14px ${c.color}15`,
                                }}>
                                    <div style={{ fontSize: '0.5rem', fontWeight: 900, color: c.color, letterSpacing: '1px', marginBottom: 6 }}>
                                        {c.icon} {c.label}
                                    </div>
                                    {/* Avatar */}
                                    <div style={{
                                        width: 42, height: 42, borderRadius: '50%', overflow: 'hidden',
                                        border: `2px solid ${c.color}`, margin: '0 auto 6px',
                                        background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        {foto ? (
                                            <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                        ) : (
                                            <span style={{ fontSize: '1rem', fontWeight: 900, color: c.color }}>{inicial}</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.58rem', fontWeight: 800, color: 'white', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        #{c.p!.numero} {c.p!.nombre}
                                    </div>
                                    <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3 }}>
                                        <span style={{ fontSize: '1.4rem', fontWeight: 900, color: c.color, lineHeight: 1 }}>{c.stat}</span>
                                        <span style={{ fontSize: '0.5rem', color: '#64748b', fontWeight: 800 }}>{c.unit}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ────────────────────────────────────────────────── */}
                {/* ── 👥 5 EN CANCHA                                 ── */}
                {/* ────────────────────────────────────────────────── */}
                {mesaEstado && (mesaEstado.onCourtLocal?.length || mesaEstado.onCourtVisitante?.length) ? (
                    <div style={{
                        background: '#0a0f1e', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)',
                        padding: '10px 14px', marginBottom: 14,
                    }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 900, color: '#94a3b8', letterSpacing: '1.5px', marginBottom: 10, textAlign: 'center' }}>
                            👥 EN CANCHA AHORA
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {[
                                { equipo: 'local',     team: partido.equipoLocalNombre,     squad: mesaEstado.onCourtLocal     || [], color: '#3b82f6' },
                                { equipo: 'visitante', team: partido.equipoVisitanteNombre, squad: mesaEstado.onCourtVisitante || [], color: '#ef4444' },
                            ].map(s => (
                                <div key={s.equipo}>
                                    <div style={{ fontSize: '0.5rem', fontWeight: 900, color: s.color, letterSpacing: '1px', marginBottom: 6, textAlign: 'center', textTransform: 'uppercase' }}>
                                        {s.team}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
                                        {s.squad.slice(0, 5).map((j: any, idx: number) => {
                                            // Aceptar j como string (ID) o como objeto
                                            const jId    = typeof j === 'string' ? j : (j?.id || j?.jugadorId || '');
                                            const fromObj: any = typeof j === 'object' && j !== null ? j : {};
                                            const fromMap = playerInfo[jId] || { nombre: '', numero: '', fotoUrl: '' };

                                            const foto   = fromObj.fotoUrl || fromMap.fotoUrl || '';
                                            const num    = String(fromObj.numero ?? fromObj.dorsal ?? fromMap.numero ?? '').trim();
                                            const nombre = (fromObj.nombre || fromMap.nombre || '').trim();

                                            return (
                                                <div key={jId || idx} title={`${num ? '#' + num + ' ' : ''}${nombre}`} style={{ textAlign: 'center', width: 40 }}>
                                                    <div style={{
                                                        width: 34, height: 34, borderRadius: '50%', overflow: 'hidden',
                                                        border: `1.5px solid ${s.color}`, background: '#1e293b',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        margin: '0 auto',
                                                    }}>
                                                        {foto ? (
                                                            <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                                        ) : (
                                                            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: s.color }}>
                                                                {num || '·'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {num && (
                                                        <div style={{ fontSize: '0.45rem', color: '#94a3b8', fontWeight: 700, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            #{num}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}

                {/* ────────────────────────────────────────────────── */}
                {/* ── 📊 BOX SCORE (tabla de jugadores)              ── */}
                {/* ────────────────────────────────────────────────── */}
                {(boxLocal.length > 0 || boxVisita.length > 0) && (
                    <div style={{
                        background: '#0a0f1e', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)',
                        marginBottom: 14, overflow: 'hidden',
                    }}>
                        <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <span style={{ fontSize: '0.62rem', fontWeight: 900, color: '#94a3b8', letterSpacing: '1.5px' }}>📊 BOX SCORE</span>
                        </div>
                        {[
                            { team: partido.equipoLocalNombre,     rows: boxLocal,    color: '#3b82f6' },
                            { team: partido.equipoVisitanteNombre, rows: boxVisita,   color: '#ef4444' },
                        ].map(t => (
                            <div key={t.team}>
                                <div style={{ padding: '6px 14px', background: `${t.color}15`, fontSize: '0.55rem', fontWeight: 900, color: t.color, letterSpacing: '1px', textTransform: 'uppercase' }}>
                                    {t.team}
                                </div>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.6rem' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                                                <th style={{ padding: '6px 8px', textAlign: 'left', color: '#64748b', fontWeight: 800, letterSpacing: '0.5px' }}>JUGADOR</th>
                                                <th style={{ padding: '6px 4px', color: '#fbbf24', fontWeight: 900 }}>PTS</th>
                                                <th style={{ padding: '6px 4px', color: '#10b981', fontWeight: 900 }}>REB</th>
                                                <th style={{ padding: '6px 4px', color: '#a855f7', fontWeight: 900 }}>ROB</th>
                                                <th style={{ padding: '6px 4px', color: '#f87171', fontWeight: 900 }}>BLO</th>
                                                <th style={{ padding: '6px 4px', color: '#7c3aed', fontWeight: 900 }}>3P</th>
                                                <th style={{ padding: '6px 4px', color: '#1e40af', fontWeight: 900 }}>2P</th>
                                                <th style={{ padding: '6px 4px', color: '#475569', fontWeight: 900 }}>TL</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {t.rows.map(r => (
                                                <tr key={r.jugadorId} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                                    <td style={{ padding: '6px 8px', color: 'white', fontWeight: 700, whiteSpace: 'nowrap', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        <span style={{ color: t.color, marginRight: 4 }}>#{r.numero}</span>{r.nombre}
                                                    </td>
                                                    <td style={{ padding: '6px 4px', textAlign: 'center', color: '#fbbf24', fontWeight: 900 }}>{r.pts}</td>
                                                    <td style={{ padding: '6px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.8)' }}>{r.reb}</td>
                                                    <td style={{ padding: '6px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.8)' }}>{r.rob}</td>
                                                    <td style={{ padding: '6px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.8)' }}>{r.blo}</td>
                                                    <td style={{ padding: '6px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.8)' }}>{r.triples}</td>
                                                    <td style={{ padding: '6px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.8)' }}>{r.dobles}</td>
                                                    <td style={{ padding: '6px 4px', textAlign: 'center', color: 'rgba(255,255,255,0.8)' }}>{r.tl}</td>
                                                </tr>
                                            ))}
                                            {t.rows.length === 0 && (
                                                <tr><td colSpan={8} style={{ padding: 14, textAlign: 'center', color: '#475569', fontSize: '0.6rem' }}>Sin jugadas aún</td></tr>
                                            )}
                                            {t.rows.length > 0 && (() => {
                                                const sum = t.rows.reduce((acc, r) => ({
                                                    pts: acc.pts + r.pts,
                                                    reb: acc.reb + r.reb,
                                                    rob: acc.rob + r.rob,
                                                    blo: acc.blo + r.blo,
                                                    triples: acc.triples + r.triples,
                                                    dobles: acc.dobles + r.dobles,
                                                    tl: acc.tl + r.tl,
                                                }), { pts: 0, reb: 0, rob: 0, blo: 0, triples: 0, dobles: 0, tl: 0 });
                                                return (
                                                    <tr style={{ borderTop: `2px solid ${t.color}40`, background: `${t.color}10` }}>
                                                        <td style={{ padding: '8px', color: t.color, fontWeight: 900, letterSpacing: '1px', fontSize: '0.62rem' }}>TOTAL</td>
                                                        <td style={{ padding: '8px 4px', textAlign: 'center', color: '#fbbf24', fontWeight: 900 }}>{sum.pts}</td>
                                                        <td style={{ padding: '8px 4px', textAlign: 'center', color: 'white', fontWeight: 900 }}>{sum.reb}</td>
                                                        <td style={{ padding: '8px 4px', textAlign: 'center', color: 'white', fontWeight: 900 }}>{sum.rob}</td>
                                                        <td style={{ padding: '8px 4px', textAlign: 'center', color: 'white', fontWeight: 900 }}>{sum.blo}</td>
                                                        <td style={{ padding: '8px 4px', textAlign: 'center', color: 'white', fontWeight: 900 }}>{sum.triples}</td>
                                                        <td style={{ padding: '8px 4px', textAlign: 'center', color: 'white', fontWeight: 900 }}>{sum.dobles}</td>
                                                        <td style={{ padding: '8px 4px', textAlign: 'center', color: 'white', fontWeight: 900 }}>{sum.tl}</td>
                                                    </tr>
                                                );
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ── ÚLTIMA JUGADA (flash) ── */}
                {lastJugada && (
                    <div key={lastJugada.id} style={{
                        background: `${ACCIONES[lastJugada.accion]?.color ?? '#334155'}22`,
                        border: `1.5px solid ${ACCIONES[lastJugada.accion]?.color ?? '#334155'}55`,
                        borderRadius: 12, padding: '10px 14px', marginBottom: 14,
                        display: 'flex', alignItems: 'center', gap: 10,
                        animation: flash ? 'flashIn 0.3s ease' : 'none',
                    }}>
                        <span style={{ fontSize: '1.4rem' }}>{ACCIONES[lastJugada.accion]?.icon ?? '🏀'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 900, color: 'white' }}>
                                #{lastJugada.jugadorNumero} {lastJugada.jugadorNombre}
                            </div>
                            <div style={{ fontSize: '0.58rem', color: '#94a3b8' }}>
                                {ACCIONES[lastJugada.accion]?.label ?? lastJugada.accion}
                                {lastJugada.puntos > 0 && <span style={{ color: '#10b981', fontWeight: 700 }}> +{lastJugada.puntos} pts</span>}
                                {lastJugada.cuarto && <span style={{ marginLeft: 6, color: '#475569' }}>· {lastJugada.cuarto}</span>}
                            </div>
                        </div>
                        <span style={{ fontSize: '0.55rem', background: lastJugada.equipo === 'local' ? '#1e3a8a' : '#7f1d1d', color: 'white', padding: '2px 8px', borderRadius: 20, fontWeight: 700, flexShrink: 0 }}>
                            {lastJugada.equipo === 'local' ? partido.equipoLocalNombre : partido.equipoVisitanteNombre}
                        </span>
                    </div>
                )}

                {/* ── PLAY BY PLAY ── */}
                <div style={{ background: '#0a0f1e', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.62rem', fontWeight: 900, color: '#475569', letterSpacing: '1.5px', textTransform: 'uppercase' }}>📋 Play by Play</span>
                        <span style={{ fontSize: '0.55rem', color: '#334155' }}>{jugadas.length} jugadas</span>
                    </div>

                    {jugadas.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '30px 20px', color: '#334155', fontSize: '0.75rem' }}>
                            Esperando jugadas...
                        </div>
                    ) : (
                        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                            {jugadas.map((j, idx) => {
                                const acc = ACCIONES[j.accion];
                                const esLocal = j.equipo === 'local';
                                return (
                                    <div key={j.id} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '9px 14px',
                                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                                        background: idx === 0 ? 'rgba(59,130,246,0.06)' : 'transparent',
                                        flexDirection: esLocal ? 'row' : 'row-reverse',
                                    }}>
                                        {/* Icono acción */}
                                        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${acc?.color ?? '#334155'}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0 }}>
                                            {acc?.icon ?? '🏀'}
                                        </div>

                                        {/* Info */}
                                        <div style={{ flex: 1, minWidth: 0, textAlign: esLocal ? 'left' : 'right' }}>
                                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: idx === 0 ? 'white' : 'rgba(255,255,255,0.75)' }}>
                                                #{j.jugadorNumero} {j.jugadorNombre}
                                            </div>
                                            <div style={{ fontSize: '0.55rem', color: '#64748b' }}>
                                                {acc?.label ?? j.accion}
                                                {j.puntos > 0 && <span style={{ color: '#10b981', marginLeft: 4, fontWeight: 700 }}>+{j.puntos}</span>}
                                            </div>
                                        </div>

                                        {/* Cuarto + marcador momento */}
                                        <div style={{ textAlign: 'center', flexShrink: 0 }}>
                                            <div style={{ fontSize: '0.45rem', color: '#334155', fontWeight: 700 }}>{j.cuarto ?? ''}</div>
                                            <div style={{ width: 4, height: 4, borderRadius: '50%', background: esLocal ? '#3b82f6' : '#ef4444', margin: '3px auto 0' }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────
// SELECTOR DE PARTIDO EN VIVO
// ─────────────────────────────────────────────
export const LiveGameSelector: React.FC<{
    categoria: string;
    onSelect: (partidoId: string) => void;
    onClose: () => void;
}> = ({ categoria, onSelect, onClose }) => {
    const [partidos, setPartidos] = useState<any[]>([]);

    const colCal = categoria.trim().toUpperCase() === 'MASTER40'
        ? 'calendario' : `calendario_${categoria.trim().toUpperCase()}`;

    useEffect(() => {
        const q = query(
            collection(db, colCal),
            where('enVivo', '==', true)
        );
        return onSnapshot(q, snap => {
            setPartidos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }, [colCal]);

    if (partidos.length === 0) return null;
    if (partidos.length === 1) {
        // Auto-seleccionar si solo hay uno
        onSelect(partidos[0].id);
        return null;
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: '#0f172a', borderRadius: 16, padding: 20, width: '100%', maxWidth: 360, border: '1px solid rgba(255,255,255,0.1)' }}>
                <h3 style={{ color: 'white', fontWeight: 900, margin: '0 0 14px', fontSize: '0.9rem' }}>🔴 Partidos en vivo</h3>
                {partidos.map(p => (
                    <button key={p.id} onClick={() => onSelect(p.id)} style={{ width: '100%', padding: 14, background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'white', textAlign: 'left', cursor: 'pointer', marginBottom: 8, fontSize: '0.8rem', fontWeight: 700 }}>
                        {p.equipoLocalNombre} vs {p.equipoVisitanteNombre}
                    </button>
                ))}
                <button onClick={onClose} style={{ width: '100%', padding: 10, background: 'transparent', border: '1px solid #334155', borderRadius: 8, color: '#64748b', cursor: 'pointer', fontSize: '0.7rem', marginTop: 4 }}>CANCELAR</button>
            </div>
        </div>
    );
};

export default LiveGameViewer;