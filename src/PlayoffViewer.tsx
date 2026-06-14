import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { db, auth } from './firebase';
import {
    collection, query, onSnapshot, orderBy,
    doc, updateDoc, getDoc, where, getDocs
} from 'firebase/firestore';

interface Partido {
    id: string;
    fase: string;
    grupo?: string;
    fechaAsignada?: string;
    estatus?: 'finalizado' | 'pendiente' | string;
    equipoLocalNombre?: string;
    equipoLocalLogo?: string;
    equipoVisitanteNombre?: string;
    equipoVisitanteLogo?: string;
    marcadorLocal?: number;
    marcadorVisitante?: number;
    cuartosLocal?: Record<string, number>;
    cuartosVisitante?: Record<string, number>;
    categoria?: string;
}

interface EditScore { l: number; v: number; }
interface PlayoffViewerProps { categoria: string; onClose: () => void; onCategoriaChange?: (cat: string) => void; }

interface EditContextType {
    editMode: boolean;
    editScores: Record<string, EditScore>;
    setEditScore: (id: string, field: 'l' | 'v', value: number) => void;
    handleSaveScore: (partido: Partido) => Promise<void>;
    categoria: string;
    colName: string;
}

const EditContext = createContext<EditContextType | null>(null);
const useEditCtx = () => useContext(EditContext)!;

// ── Logo ──────────────────────────────────────────────────────────────────
const TeamLogo: React.FC<{ logoPath?: string; teamName: string; categoria: string; size?: number }> = ({ logoPath, teamName, categoria, size = 22 }) => {
    const [url, setUrl] = useState('');
    useEffect(() => {
        if (!teamName) return;
        if (logoPath?.startsWith('http')) { setUrl(logoPath); return; }
        const col = categoria.trim().toUpperCase() === 'MASTER40' ? 'equipos' : `equipos_${categoria.trim().toUpperCase()}`;
        getDocs(query(collection(db, col), where('nombre', '==', teamName)))
            .then(snap => { const u = snap.docs[0]?.data()?.logoUrl; if (u) setUrl(u); })
            .catch(() => {});
    }, [logoPath, teamName, categoria]);

    const style: React.CSSProperties = { width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', border: '1.5px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
    if (url) return <div style={{ ...style, background: 'white' }}><img src={url} alt={teamName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>;
    return <div style={{ ...style, background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', color: 'white', fontWeight: 900, fontSize: size * 0.38 }}>{teamName?.charAt(0).toUpperCase()}</div>;
};

// ── BracketCard ───────────────────────────────────────────────────────────
const BracketCard: React.FC<{ partido: Partido; highlight?: boolean; cardW: number; cardH: number }> = ({ partido: m, highlight = false, cardW, cardH }) => {
    const { editMode, editScores, setEditScore, handleSaveScore, categoria } = useEditCtx();
    const fin = m.estatus === 'finalizado';
    const lG  = fin && (m.marcadorLocal ?? -1) > (m.marcadorVisitante ?? -1);
    const vG  = fin && (m.marcadorVisitante ?? -1) > (m.marcadorLocal ?? -1);
    const rowH = cardH / 2;

    return (
        <div style={{ width: cardW, height: cardH, borderRadius: 8, overflow: 'hidden', background: highlight ? 'rgba(251,191,36,0.1)' : 'rgba(30,41,59,0.95)', border: `1.5px solid ${highlight ? 'rgba(251,191,36,0.5)' : fin ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.08)'}`, boxShadow: highlight ? '0 0 16px rgba(251,191,36,0.15)' : '0 2px 6px rgba(0,0,0,0.5)', position: 'relative' }}>
            {/* Local */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: rowH, padding: '0 6px', background: lG ? 'rgba(251,191,36,0.08)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <TeamLogo logoPath={m.equipoLocalLogo} teamName={m.equipoLocalNombre ?? ''} categoria={categoria} size={18} />
                <span style={{ flex: 1, fontSize: '0.55rem', fontWeight: lG ? 900 : 500, color: lG ? '#fbbf24' : 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.equipoLocalNombre ?? 'TBD'}</span>
                {editMode
                    ? <input type="number" defaultValue={m.marcadorLocal ?? 0} onChange={e => setEditScore(m.id, 'l', Number(e.target.value))} style={{ width: 26, textAlign: 'center', background: '#0f172a', color: 'white', border: '1px solid #3b82f6', borderRadius: 4, fontSize: '0.6rem', flexShrink: 0 }} />
                    : <span style={{ fontSize: '0.78rem', fontWeight: 900, minWidth: 16, textAlign: 'right', flexShrink: 0, color: lG ? '#fbbf24' : !fin ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)' }}>{!fin ? '—' : (m.marcadorLocal ?? '—')}</span>
                }
            </div>
            {/* Visitante */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: rowH, padding: '0 6px', background: vG ? 'rgba(251,191,36,0.08)' : 'transparent' }}>
                <TeamLogo logoPath={m.equipoVisitanteLogo} teamName={m.equipoVisitanteNombre ?? ''} categoria={categoria} size={18} />
                <span style={{ flex: 1, fontSize: '0.55rem', fontWeight: vG ? 900 : 500, color: vG ? '#fbbf24' : 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.equipoVisitanteNombre ?? 'TBD'}</span>
                {editMode
                    ? <input type="number" defaultValue={m.marcadorVisitante ?? 0} onChange={e => setEditScore(m.id, 'v', Number(e.target.value))} style={{ width: 26, textAlign: 'center', background: '#0f172a', color: 'white', border: '1px solid #3b82f6', borderRadius: 4, fontSize: '0.6rem', flexShrink: 0 }} />
                    : <span style={{ fontSize: '0.78rem', fontWeight: 900, minWidth: 16, textAlign: 'right', flexShrink: 0, color: vG ? '#fbbf24' : !fin ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)' }}>{!fin ? '—' : (m.marcadorVisitante ?? '—')}</span>
                }
            </div>
            {editMode && <button onClick={() => handleSaveScore(m)} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '2px 0', background: 'rgba(16,185,129,0.9)', color: 'white', border: 'none', fontSize: '0.42rem', fontWeight: 900, cursor: 'pointer' }}>GUARDAR</button>}
        </div>
    );
};

// ── GameCard — tarjeta visual para cualquier fase ────────────────────────
const GameCard: React.FC<{ partido: Partido; label: string; icon: string; badgeColor: string; showAvanza?: boolean }> = ({ partido: m, label, icon, badgeColor, showAvanza = false }) => {
    const { editMode, editScores, setEditScore, handleSaveScore, categoria } = useEditCtx();
    const fin = m.estatus === 'finalizado';
    const lG  = fin && (m.marcadorLocal ?? -1) > (m.marcadorVisitante ?? -1);
    const vG  = fin && (m.marcadorVisitante ?? -1) > (m.marcadorLocal ?? -1);

    return (
        <div style={{ background: 'rgba(30,41,59,0.95)', borderRadius: 10, border: `1.5px solid ${badgeColor}55`, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', position: 'relative' }}>
            {/* Badge */}
            <div style={{ background: `${badgeColor}22`, padding: '4px 10px', borderBottom: `1px solid ${badgeColor}33`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.48rem', fontWeight: 900, color: badgeColor, letterSpacing: '1.5px', textTransform: 'uppercase' }}>{icon} {label}</span>
                {fin && <span style={{ fontSize: '0.45rem', color: '#10b981', fontWeight: 700 }}>✓ FINALIZADO</span>}
            </div>
            {/* Local */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: lG ? 'rgba(251,191,36,0.06)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <TeamLogo teamName={m.equipoLocalNombre ?? ''} categoria={categoria} size={24} />
                <span style={{ flex: 1, fontSize: '0.68rem', fontWeight: lG ? 900 : 600, color: lG ? '#fbbf24' : 'rgba(255,255,255,0.9)' }}>{m.equipoLocalNombre ?? 'TBD'}</span>
                {editMode
                    ? <input type="number" defaultValue={m.marcadorLocal ?? 0} onChange={e => setEditScore(m.id, 'l', Number(e.target.value))} style={{ width: 32, textAlign: 'center', background: '#0f172a', color: 'white', border: `1px solid ${badgeColor}`, borderRadius: 4, fontSize: '0.7rem' }} />
                    : <span style={{ fontSize: '1rem', fontWeight: 900, color: lG ? '#fbbf24' : !fin ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.6)', minWidth: 24, textAlign: 'right' }}>{!fin ? '—' : m.marcadorLocal}</span>
                }
            </div>
            {/* Visitante */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: vG ? 'rgba(251,191,36,0.06)' : 'transparent' }}>
                <TeamLogo teamName={m.equipoVisitanteNombre ?? ''} categoria={categoria} size={24} />
                <span style={{ flex: 1, fontSize: '0.68rem', fontWeight: vG ? 900 : 600, color: vG ? '#fbbf24' : 'rgba(255,255,255,0.9)' }}>{m.equipoVisitanteNombre ?? 'TBD'}</span>
                {editMode
                    ? <input type="number" defaultValue={m.marcadorVisitante ?? 0} onChange={e => setEditScore(m.id, 'v', Number(e.target.value))} style={{ width: 32, textAlign: 'center', background: '#0f172a', color: 'white', border: `1px solid ${badgeColor}`, borderRadius: 4, fontSize: '0.7rem' }} />
                    : <span style={{ fontSize: '1rem', fontWeight: 900, color: vG ? '#fbbf24' : !fin ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.6)', minWidth: 24, textAlign: 'right' }}>{!fin ? '—' : m.marcadorVisitante}</span>
                }
            </div>
            {showAvanza && fin && (
                <div style={{ padding: '4px 10px', background: 'rgba(16,185,129,0.1)', borderTop: '1px solid rgba(16,185,129,0.2)', fontSize: '0.5rem', color: '#6ee7b7', fontWeight: 700 }}>
                    🏆 Avanza: {lG ? m.equipoLocalNombre : m.equipoVisitanteNombre}
                </div>
            )}
            {editMode && <button onClick={() => handleSaveScore(m)} style={{ width: '100%', padding: '4px 0', background: 'rgba(16,185,129,0.9)', color: 'white', border: 'none', fontSize: '0.5rem', fontWeight: 900, cursor: 'pointer' }}>GUARDAR</button>}
        </div>
    );
};

// Alias for backward compat
const PlayInCard: React.FC<{ partido: Partido; label: string }> = ({ partido, label }) => (
    <GameCard partido={partido} label={`PLAY-IN · ${label}`} icon="⚡" badgeColor="#818cf8" showAvanza />
);

// ── RoundHeader — título de cada ronda ────────────────────────────────────
const RoundHeader: React.FC<{ icon: string; titulo: string; color: string }> = ({ icon, titulo, color }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, height: 1, background: `${color}44` }} />
        <span style={{ fontSize: '0.62rem', fontWeight: 900, color, letterSpacing: '2px' }}>{icon} {titulo}</span>
        <div style={{ flex: 1, height: 1, background: `${color}44` }} />
    </div>
);

// ── DownArrow — flecha entre rondas ───────────────────────────────────────
const DownArrow: React.FC = () => (
    <div style={{ textAlign: 'center', margin: '2px 0 18px', color: 'rgba(255,255,255,0.25)', fontSize: '1rem' }}>↓</div>
);

// ── BracketRow — tarjeta de partido a todo el ancho ───────────────────────
const BracketRow: React.FC<{
    partido: Partido; categoria: string; label: string; accent?: string; isFinal?: boolean;
}> = ({ partido: m, categoria, label, accent = '#3b82f6', isFinal = false }) => {
    const { editMode, setEditScore, handleSaveScore } = useEditCtx();
    const fin = m.estatus === 'finalizado';
    const lG  = fin && (m.marcadorLocal ?? -1) > (m.marcadorVisitante ?? -1);
    const vG  = fin && (m.marcadorVisitante ?? -1) > (m.marcadorLocal ?? -1);

    const row = (nombre: string | undefined, marcador: number | undefined, gana: boolean, field: 'l' | 'v', borderBottom: boolean) => (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
            background: gana ? `${accent}14` : 'transparent',
            borderBottom: borderBottom ? '1px solid rgba(255,255,255,0.06)' : 'none',
        }}>
            <TeamLogo teamName={nombre ?? ''} categoria={categoria} size={26} />
            <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: gana ? 900 : 600, color: gana ? accent : 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {nombre ?? 'Por definir'}
            </span>
            {gana && <span style={{ fontSize: '0.6rem' }}>🏆</span>}
            {editMode
                ? <input type="number" defaultValue={marcador ?? 0} onChange={e => setEditScore(m.id, field, Number(e.target.value))}
                    style={{ width: 38, textAlign: 'center', background: '#0f172a', color: 'white', border: `1px solid ${accent}`, borderRadius: 5, fontSize: '0.8rem', padding: '3px 0' }} />
                : <span style={{ fontSize: '1.15rem', fontWeight: 900, color: gana ? accent : !fin ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)', minWidth: 26, textAlign: 'right' }}>
                    {!fin ? '–' : marcador}
                </span>
            }
        </div>
    );

    return (
        <div style={{
            background: 'rgba(15,23,42,0.92)',
            borderRadius: 12,
            border: `1.5px solid ${accent}${fin ? '88' : '3a'}`,
            overflow: 'hidden',
            boxShadow: isFinal ? `0 8px 30px ${accent}40` : '0 3px 12px rgba(0,0,0,0.4)',
        }}>
            {(label !== '' || fin) && (
                <div style={{ background: `${accent}18`, padding: '5px 14px', borderBottom: `1px solid ${accent}2a`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.52rem', fontWeight: 900, color: accent, letterSpacing: '1.5px', textTransform: 'uppercase' }}>{label || (isFinal ? 'GRAN FINAL' : '')}</span>
                    {fin && <span style={{ fontSize: '0.5rem', color: '#10b981', fontWeight: 700 }}>✓ FINALIZADO</span>}
                </div>
            )}
            {row(m.equipoLocalNombre, m.marcadorLocal, lG, 'l', true)}
            {row(m.equipoVisitanteNombre, m.marcadorVisitante, vG, 'v', false)}
            {editMode && <button onClick={() => handleSaveScore(m)} style={{ width: '100%', padding: '6px 0', background: 'rgba(16,185,129,0.9)', color: 'white', border: 'none', fontSize: '0.6rem', fontWeight: 900, cursor: 'pointer', letterSpacing: '1px' }}>GUARDAR RESULTADO</button>}
        </div>
    );
};

// ── SimpleBracket (Semis → Final) — ahora usa GameCard ────────────────
const SimpleBracket: React.FC<{ semis: Partido[]; final: Partido[]; tercero: Partido[]; title: string; accentColor: string }> = ({ semis, final, tercero, title, accentColor }) => {
    if (semis.length === 0 && final.length === 0) return null;

    return (
        <div style={{ marginBottom: 24 }}>
            {/* Conference header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '0 4px' }}>
                <div style={{ flex: 1, height: 1, background: `${accentColor}40` }} />
                <span style={{ fontSize: '0.55rem', fontWeight: 900, color: accentColor, letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{title}</span>
                <div style={{ flex: 1, height: 1, background: `${accentColor}40` }} />
            </div>

            {/* SEMIS */}
            {semis.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: semis.length >= 2 ? '1fr 1fr' : '1fr', gap: 10 }}>
                        {semis.map((m, i) => (
                            <GameCard key={m.id} partido={m} label={`SEMIFINAL ${i + 1}`} icon="🏅" badgeColor={accentColor} showAvanza />
                        ))}
                    </div>
                    {final.length > 0 && (
                        <div style={{ textAlign: 'center', margin: '8px 0', fontSize: '0.5rem', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                            <span style={{ color: accentColor }}>↓ ganadores van a la Final</span>
                            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                        </div>
                    )}
                </div>
            )}

            {/* FINAL */}
            {final.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                    {final.map(m => (
                        <GameCard key={m.id} partido={m} label="👑 FINAL DE CONFERENCIA" icon="" badgeColor="#fbbf24" />
                    ))}
                </div>
            )}

            {/* Tercer lugar */}
            {tercero.length > 0 && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {tercero.map(m => (
                        <GameCard key={m.id} partido={m} label="🥉 TERCER LUGAR" icon="" badgeColor="#78716c" />
                    ))}
                </div>
            )}
        </div>
    );
};

// ── MAIN COMPONENT ────────────────────────────────────────────────────────
const PlayoffViewer: React.FC<PlayoffViewerProps> = ({ categoria, onClose }) => {
    const [partidos, setPartidos]     = useState<Partido[]>([]);
    const [loading, setLoading]       = useState(true);
    const [isAdmin, setIsAdmin]       = useState(false);
    const [editMode, setEditMode]     = useState(false);
    const [editScores, setEditScores] = useState<Record<string, EditScore>>({});
    const [toast, setToast]           = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

    const colName = categoria.trim().toUpperCase() === 'MASTER40'
        ? 'calendario' : `calendario_${categoria.trim().toUpperCase()}`;

    useEffect(() => {
        const user = auth.currentUser;
        if (!user) return;
        getDoc(doc(db, 'usuarios', user.uid))
            .then(snap => { if (snap.data()?.rol === 'admin') setIsAdmin(true); })
            .catch(() => {});
    }, []);

    useEffect(() => {
        setLoading(true);
        const q = query(collection(db, colName), orderBy('fechaAsignada', 'asc'));
        return onSnapshot(q, snap => {
            const data = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as Partido))
                .filter(m => m.fase && m.fase.toUpperCase() !== 'REGULAR');
            setPartidos(data);
            setLoading(false);
        }, () => setLoading(false));
    }, [colName]);

    const setEditScore = useCallback((id: string, field: 'l' | 'v', value: number) => {
        setEditScores(prev => ({ ...prev, [id]: { ...(prev[id] ?? { l: 0, v: 0 }), [field]: value } }));
    }, []);

    const handleSaveScore = useCallback(async (partido: Partido) => {
        const score = editScores[partido.id];
        if (!score) { showToast('Modifica el marcador antes de guardar.', 'err'); return; }
        try {
            await updateDoc(doc(db, colName, partido.id), {
                marcadorLocal: score.l, marcadorVisitante: score.v, estatus: 'finalizado',
            });
            showToast('Resultado guardado ✓', 'ok');
        } catch { showToast('Error al guardar.', 'err'); }
    }, [editScores, colName]);

    const showToast = (msg: string, type: 'ok' | 'err') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    // ── Filtros por conferencia y fase ──────────────────────────────────
    const byFase = (...fases: string[]) =>
        partidos.filter(m => fases.some(f => m.fase?.toUpperCase() === f.toUpperCase()));

    // Partidos por fase (ya vienen ordenados por fechaAsignada del query).
    const cuartos = byFase('CUARTOS', 'CUARTOS DE FINAL');
    const semis   = byFase('SEMIS', 'SEMIFINAL');
    const final   = byFase('FINAL', 'GRAN FINAL', 'GRAND FINAL');

    const hayDatos = partidos.length > 0;
    const hayBracket = cuartos.length > 0 || semis.length > 0 || final.length > 0;

    const editCtx: EditContextType = { editMode, editScores, setEditScore, handleSaveScore, categoria, colName };

    return (
        <EditContext.Provider value={editCtx}>
            <div style={{ position: 'relative', minHeight: '100vh', background: '#0b0f1a', color: 'white', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeUp { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>

                {/* Header */}
                <div style={{ background: '#fff', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>🏆 Playoff {categoria}</h2>
                        <p style={{ margin: '2px 0 0', fontSize: '0.6rem', color: '#94a3b8' }}>Road to the Finals</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {isAdmin && (
                            <button onClick={() => setEditMode(v => !v)} style={{ background: editMode ? '#fef3c7' : '#f1f5f9', color: editMode ? '#d97706' : '#64748b', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>
                                {editMode ? '👁 VER' : '⚙️ EDITAR'}
                            </button>
                        )}
                        <button onClick={onClose} style={{ background: 'none', color: '#3b82f6', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>← VOLVER</button>
                    </div>
                </div>

                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, flexDirection: 'column' }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(251,191,36,0.2)', borderTop: '3px solid #fbbf24', animation: 'spin 0.8s linear infinite' }} />
                        <p style={{ color: '#475569', fontSize: '0.85rem' }}>Cargando llaves...</p>
                    </div>
                ) : !hayDatos || !hayBracket ? (
                    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🏆</div>
                        <p style={{ fontWeight: 700, color: '#64748b' }}>Los playoffs aún no han comenzado</p>
                        <p style={{ fontSize: '0.7rem', color: '#475569', marginTop: 8 }}>
                            Creá los partidos de Cuartos / Semifinal / Final en el calendario.
                        </p>
                    </div>
                ) : (
                    <main style={{ padding: '20px 14px 110px', maxWidth: 460, margin: '0 auto' }}>
                        {/* BRACKET VERTICAL — rondas apiladas, prolijo en pantallas angostas */}

                        {/* ── CUARTOS ── */}
                        {(cuartos.length > 0) && (
                            <section style={{ marginBottom: 26 }}>
                                <RoundHeader icon="🔢" titulo="CUARTOS DE FINAL" color="#3b82f6" />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {cuartos.map((m, i) => (
                                        <BracketRow key={m.id} partido={m} categoria={categoria} label={`Llave ${i + 1}`} accent="#3b82f6" />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* flecha hacia abajo */}
                        {cuartos.length > 0 && semis.length > 0 && <DownArrow />}

                        {/* ── SEMIFINALES ── */}
                        {(semis.length > 0) && (
                            <section style={{ marginBottom: 26 }}>
                                <RoundHeader icon="🏅" titulo="SEMIFINALES" color="#8b5cf6" />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                    {semis.map((m, i) => (
                                        <BracketRow key={m.id} partido={m} categoria={categoria} label={`Semifinal ${i + 1}`} accent="#8b5cf6" />
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* flecha hacia abajo */}
                        {semis.length > 0 && final.length > 0 && <DownArrow />}

                        {/* ── FINAL ── */}
                        {(final.length > 0) && (
                            <section>
                                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                                    <div style={{ fontSize: '2rem' }}>🏆</div>
                                    <div style={{ fontSize: '0.62rem', fontWeight: 900, color: '#fbbf24', letterSpacing: '3px', marginTop: 2 }}>FINAL</div>
                                </div>
                                {final.map(m => (
                                    <BracketRow key={m.id} partido={m} categoria={categoria} label="" accent="#fbbf24" isFinal />
                                ))}
                            </section>
                        )}

                        {/* Leyenda regla de oro */}
                        <div style={{ textAlign: 'center', marginTop: 28, fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                            🥇 Los <b style={{ color: '#fbbf24' }}>1° de cada grupo</b> solo pueden cruzarse en la Final.
                        </div>
                    </main>
                )}

                {/* Toast */}
                {toast && (
                    <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: toast.type === 'ok' ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)', color: 'white', padding: '10px 24px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 700, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 9999, animation: 'fadeUp 0.2s ease', whiteSpace: 'nowrap' }}>
                        {toast.msg}
                    </div>
                )}
            </div>
        </EditContext.Provider>
    );
};

export default PlayoffViewer;