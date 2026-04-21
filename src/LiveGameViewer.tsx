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

    // ── Jugadas en tiempo real ──
    useEffect(() => {
        const q = query(
            collection(db, 'jugadas_partido'),
            where('partidoId', '==', partidoId),
            orderBy('timestamp', 'desc'),
            limit(50)
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

                    {/* Puntos por cuarto */}
                    {(partido.cuartosLocal || partido.cuartosVisitante) && (() => {
                        const qL = partido.cuartosLocal ?? {};
                        const qV = partido.cuartosVisitante ?? {};
                        const qs = ['Q1','Q2','Q3','Q4','TE'].filter(q => (qL[q] ?? 0) + (qV[q] ?? 0) > 0);
                        if (!qs.length) return null;
                        return (
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                {qs.map(q => (
                                    <div key={q} style={{ textAlign: 'center', minWidth: 32 }}>
                                        <div style={{ fontSize: '0.42rem', color: '#475569', fontWeight: 700, marginBottom: 2 }}>{q}</div>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 900, color: q === cuartoActual ? '#60a5fa' : 'rgba(255,255,255,0.7)' }}>{qL[q] ?? 0}</div>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 900, color: q === cuartoActual ? '#f87171' : 'rgba(255,255,255,0.7)' }}>{qV[q] ?? 0}</div>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>

                {/* ── STATS RÁPIDAS EN VIVO ── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                    {[
                        { label: '🏀 Dobles', l: statsLocal.dobles ?? 0, v: statsVisita.dobles ?? 0 },
                        { label: '🔥 Triples', l: statsLocal.triples ?? 0, v: statsVisita.triples ?? 0 },
                        { label: '🎯 TL', l: statsLocal.tirosLibres ?? 0, v: statsVisita.tirosLibres ?? 0 },
                        { label: '🖐️ Rebotes', l: statsLocal.rebotes ?? 0, v: statsVisita.rebotes ?? 0 },
                        { label: '🛡️ Robos', l: statsLocal.robos ?? 0, v: statsVisita.robos ?? 0 },
                        { label: '🚫 Bloqueos', l: statsLocal.bloqueos ?? 0, v: statsVisita.bloqueos ?? 0 },
                    ].map(s => (
                        <div key={s.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.62rem', fontWeight: 900, color: '#60a5fa' }}>{s.l}</span>
                            <span style={{ fontSize: '0.55rem', color: '#475569', fontWeight: 700 }}>{s.label}</span>
                            <span style={{ fontSize: '0.62rem', fontWeight: 900, color: '#f87171' }}>{s.v}</span>
                        </div>
                    ))}
                </div>

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