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

// ── PlayIn Card (más visual) ────────────────────────────────────────────
const PlayInCard: React.FC<{ partido: Partido; label: string }> = ({ partido: m, label }) => {
    const { editMode, editScores, setEditScore, handleSaveScore, categoria } = useEditCtx();
    const fin = m.estatus === 'finalizado';
    const lG  = fin && (m.marcadorLocal ?? -1) > (m.marcadorVisitante ?? -1);
    const vG  = fin && (m.marcadorVisitante ?? -1) > (m.marcadorLocal ?? -1);

    return (
        <div style={{ background: 'rgba(30,41,59,0.95)', borderRadius: 10, border: '1.5px solid rgba(99,102,241,0.35)', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', position: 'relative' }}>
            {/* Badge */}
            <div style={{ background: 'rgba(99,102,241,0.2)', padding: '4px 10px', borderBottom: '1px solid rgba(99,102,241,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.48rem', fontWeight: 900, color: '#818cf8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>⚡ PLAY-IN · {label}</span>
                {fin && <span style={{ fontSize: '0.45rem', color: '#10b981', fontWeight: 700 }}>✓ FINALIZADO</span>}
            </div>
            {/* Local */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: lG ? 'rgba(251,191,36,0.06)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <TeamLogo teamName={m.equipoLocalNombre ?? ''} categoria={categoria} size={24} />
                <span style={{ flex: 1, fontSize: '0.68rem', fontWeight: lG ? 900 : 600, color: lG ? '#fbbf24' : 'rgba(255,255,255,0.9)' }}>{m.equipoLocalNombre ?? 'TBD'}</span>
                {editMode
                    ? <input type="number" defaultValue={m.marcadorLocal ?? 0} onChange={e => setEditScore(m.id, 'l', Number(e.target.value))} style={{ width: 32, textAlign: 'center', background: '#0f172a', color: 'white', border: '1px solid #6366f1', borderRadius: 4, fontSize: '0.7rem' }} />
                    : <span style={{ fontSize: '1rem', fontWeight: 900, color: lG ? '#fbbf24' : !fin ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.6)', minWidth: 24, textAlign: 'right' }}>{!fin ? '—' : m.marcadorLocal}</span>
                }
            </div>
            {/* Visitante */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: vG ? 'rgba(251,191,36,0.06)' : 'transparent' }}>
                <TeamLogo teamName={m.equipoVisitanteNombre ?? ''} categoria={categoria} size={24} />
                <span style={{ flex: 1, fontSize: '0.68rem', fontWeight: vG ? 900 : 600, color: vG ? '#fbbf24' : 'rgba(255,255,255,0.9)' }}>{m.equipoVisitanteNombre ?? 'TBD'}</span>
                {editMode
                    ? <input type="number" defaultValue={m.marcadorVisitante ?? 0} onChange={e => setEditScore(m.id, 'v', Number(e.target.value))} style={{ width: 32, textAlign: 'center', background: '#0f172a', color: 'white', border: '1px solid #6366f1', borderRadius: 4, fontSize: '0.7rem' }} />
                    : <span style={{ fontSize: '1rem', fontWeight: 900, color: vG ? '#fbbf24' : !fin ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.6)', minWidth: 24, textAlign: 'right' }}>{!fin ? '—' : m.marcadorVisitante}</span>
                }
            </div>
            {fin && (
                <div style={{ padding: '4px 10px', background: 'rgba(16,185,129,0.1)', borderTop: '1px solid rgba(16,185,129,0.2)', fontSize: '0.5rem', color: '#6ee7b7', fontWeight: 700 }}>
                    🏆 Avanza: {lG ? m.equipoLocalNombre : m.equipoVisitanteNombre}
                </div>
            )}
            {editMode && <button onClick={() => handleSaveScore(m)} style={{ width: '100%', padding: '4px 0', background: 'rgba(16,185,129,0.9)', color: 'white', border: 'none', fontSize: '0.5rem', fontWeight: 900, cursor: 'pointer' }}>GUARDAR</button>}
        </div>
    );
};

// ── SimpleBracket (Semis → Final) ────────────────────────────────────────
const SimpleBracket: React.FC<{ semis: Partido[]; final: Partido[]; tercero: Partido[]; title: string; accentColor: string }> = ({ semis, final, tercero, title, accentColor }) => {
    const CW = 148; const CH = 72; const CONN = 24; const PG = 10;

    const rounds: { matches: Partido[]; label: string }[] = [];
    if (semis.length > 0) rounds.push({ matches: semis, label: 'SEMIS' });
    if (final.length > 0) rounds.push({ matches: final, label: 'FINAL' });

    if (rounds.length === 0) return null;

    const getYs = (n: number, ri: number): number[] => {
        if (ri === 0) {
            const ys: number[] = [];
            for (let i = 0; i < n; i++) {
                const pair = Math.floor(i / 2);
                const pos  = i % 2;
                ys.push(pair * (2 * CH + PG + 20) + pos * (CH + PG));
            }
            return ys;
        }
        const prev = getYs(rounds[ri - 1].matches.length, ri - 1);
        return Array.from({ length: n }, (_, i) => {
            const y1 = prev[i * 2] ?? prev[0] ?? 0;
            const y2 = prev[i * 2 + 1] ?? y1;
            return (y1 + y2) / 2;
        });
    };

    const allYs = rounds.map((r, ri) => getYs(r.matches.length, ri));
    const firstYs = allYs[0] ?? [];
    const totalH = firstYs.length > 0 ? firstYs[firstYs.length - 1] + CH + 20 : CH + 40;

    return (
        <div style={{ marginBottom: 24 }}>
            {/* Conference header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '0 4px' }}>
                <div style={{ flex: 1, height: 1, background: `${accentColor}40` }} />
                <span style={{ fontSize: '0.55rem', fontWeight: 900, color: accentColor, letterSpacing: '2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{title}</span>
                <div style={{ flex: 1, height: 1, background: `${accentColor}40` }} />
            </div>

            {/* Round headers */}
            <div style={{ display: 'flex', marginBottom: 6 }}>
                {rounds.map((r, ri) => (
                    <React.Fragment key={ri}>
                        <div style={{ width: CW, textAlign: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.42rem', fontWeight: 900, letterSpacing: '1.5px', color: r.label === 'FINAL' ? '#fbbf24' : '#475569', textTransform: 'uppercase' }}>
                                {r.label === 'FINAL' ? '👑 FINAL' : r.label}
                            </span>
                        </div>
                        {ri < rounds.length - 1 && <div style={{ width: CONN, flexShrink: 0 }} />}
                    </React.Fragment>
                ))}
            </div>

            {/* Bracket */}
            <div style={{ display: 'flex', position: 'relative', height: totalH }}>
                {rounds.map((r, ri) => (
                    <React.Fragment key={ri}>
                        <div style={{ position: 'relative', width: CW, flexShrink: 0, height: totalH }}>
                            {r.matches.map((m, mi) => (
                                <div key={m.id} style={{ position: 'absolute', top: allYs[ri]?.[mi] ?? 0, left: 0, width: CW }}>
                                    <BracketCard partido={m} highlight={r.label === 'FINAL'} cardW={CW} cardH={CH} />
                                </div>
                            ))}
                        </div>
                        {ri < rounds.length - 1 && (
                            <div style={{ position: 'relative', width: CONN, flexShrink: 0, height: totalH }}>
                                {allYs[ri + 1]?.map((toY, ti) => {
                                    const fromYs = allYs[ri] ?? [];
                                    const y1 = (fromYs[ti * 2] ?? 0) + CH / 2;
                                    const y2 = fromYs[ti * 2 + 1] !== undefined ? (fromYs[ti * 2 + 1] + CH / 2) : y1;
                                    const yTo = toY + CH / 2;
                                    const hasPair = fromYs[ti * 2 + 1] !== undefined;
                                    const half = CONN / 2;
                                    const bc = ri === rounds.length - 2 ? 'rgba(251,191,36,0.6)' : 'rgba(100,116,139,0.5)';
                                    if (!hasPair) return <div key={ti} style={{ position: 'absolute', top: y1 - 1, left: 0, right: 0, height: 2, background: bc }} />;
                                    const top = Math.min(y1, y2); const bot = Math.max(y1, y2);
                                    return (
                                        <div key={ti} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                                            <div style={{ position: 'absolute', top: y1 - 1, left: 0, width: half, height: 2, background: bc }} />
                                            <div style={{ position: 'absolute', top: y2 - 1, left: 0, width: half, height: 2, background: bc }} />
                                            <div style={{ position: 'absolute', top: top - 1, left: half - 1, width: 2, height: bot - top + 2, background: bc }} />
                                            <div style={{ position: 'absolute', top: yTo - 1, left: half, right: 0, height: 2, background: bc }} />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Tercer lugar */}
            {tercero.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.42rem', fontWeight: 900, color: '#78716c', letterSpacing: '1.5px', textAlign: 'center', marginBottom: 6 }}>🥉 TERCER LUGAR</div>
                    {tercero.map(m => (
                        <BracketCard key={m.id} partido={m} cardW={CW} cardH={CH} />
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
    const [tab, setTab]               = useState<'este' | 'oeste'>('este');

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
    const byConf = (conf: 'A' | 'B' | 'GRAND') =>
        partidos.filter(m => (m.grupo ?? '').toUpperCase() === conf);

    const byFase = (list: Partido[], ...fases: string[]) =>
        list.filter(m => fases.some(f => m.fase?.toUpperCase() === f.toUpperCase()));

    // CONF. ESTE (grupo A)
    const esteAll     = byConf('A');
    const estePlayIn  = byFase(esteAll, 'PLAYIN', 'PLAY-IN', 'PLAY_IN');
    const esteSemis   = byFase(esteAll, 'SEMIS', 'SEMIFINAL');
    const esteFinal   = byFase(esteAll, 'FINAL', 'GRAN FINAL');
    const esteTercero = byFase(esteAll, '3ER LUGAR', 'TERCER LUGAR');

    // CONF. OESTE (grupo B)
    const oesteAll     = byConf('B');
    const oesteSemis   = byFase(oesteAll, 'SEMIS', 'SEMIFINAL');
    const oesteFinal   = byFase(oesteAll, 'FINAL', 'GRAN FINAL');
    const oesteTercero = byFase(oesteAll, '3ER LUGAR', 'TERCER LUGAR');

    // Grand Final (sin grupo, o grupo GRAND)
    const grandFinal = byFase(byConf('GRAND'), 'FINAL', 'GRAN FINAL')
        .concat(byFase(partidos.filter(m => !m.grupo || m.grupo.toUpperCase() === 'GRAND'), 'GRAN FINAL', 'GRAND FINAL'));

    const hayDatos = partidos.length > 0;

    const editCtx: EditContextType = { editMode, editScores, setEditScore, handleSaveScore, categoria, colName };

    return (
        <EditContext.Provider value={editCtx}>
            <div style={{ position: 'relative', minHeight: '100vh', background: 'radial-gradient(ellipse at 50% 0%, #0f1f3d 0%, #020617 70%)', color: 'white', fontFamily: "'Inter','Segoe UI',sans-serif" }}>
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

                {/* Tabs */}
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {([['este', '🔵 CONF. ESTE', '#3b82f6'], ['oeste', '🟠 CONF. OESTE', '#f97316']] as const).map(([id, label, color]) => (
                        <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: '10px 0', background: tab === id ? `${color}22` : 'transparent', border: 'none', borderBottom: tab === id ? `2px solid ${color}` : '2px solid transparent', color: tab === id ? color : 'rgba(255,255,255,0.4)', fontSize: '0.65rem', fontWeight: 900, cursor: 'pointer', letterSpacing: '1px' }}>
                            {label}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, flexDirection: 'column' }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(251,191,36,0.2)', borderTop: '3px solid #fbbf24', animation: 'spin 0.8s linear infinite' }} />
                        <p style={{ color: '#475569', fontSize: '0.85rem' }}>Cargando llaves...</p>
                    </div>
                ) : !hayDatos ? (
                    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🏆</div>
                        <p style={{ fontWeight: 700, color: '#64748b' }}>Los playoffs aún no han comenzado</p>
                    </div>
                ) : (
                    <main style={{ padding: '16px 12px 100px', maxWidth: 500, margin: '0 auto' }}>

                        {/* ── CONF. ESTE ── */}
                        {tab === 'este' && (
                            <>
                                {/* PLAY-IN */}
                                {estePlayIn.length > 0 && (
                                    <div style={{ marginBottom: 24 }}>
                                        {/* Header Play-In */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                            <div style={{ flex: 1, height: 1, background: 'rgba(99,102,241,0.4)' }} />
                                            <div style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 20, padding: '4px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: '0.55rem', fontWeight: 900, color: '#818cf8', letterSpacing: '2px' }}>⚡ PLAY-IN CONFERENCIA ESTE</span>
                                            </div>
                                            <div style={{ flex: 1, height: 1, background: 'rgba(99,102,241,0.4)' }} />
                                        </div>

                                        {/* Explicación */}
                                        <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: '0.55rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                                            🏅 <b style={{ color: '#818cf8' }}>1° y 2°</b> pasan directo a Semis&nbsp;&nbsp;·&nbsp;&nbsp;
                                            🎯 <b style={{ color: '#818cf8' }}>3°-6°</b> disputan Play-In — los ganadores avanzan a Semis
                                        </div>

                                        {/* Matches Play-In */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                            {(() => {
                                                // Ordenar: 3v6 primero, 4v5 segundo (por hora/fecha o índice)
                                                const sorted = [...estePlayIn].sort((a, b) =>
                                                    (a.fechaAsignada ?? '').localeCompare(b.fechaAsignada ?? '') ||
                                                    (a.equipoLocalNombre ?? '').localeCompare(b.equipoLocalNombre ?? '')
                                                );
                                                const labels = ['3° vs 6°', '4° vs 5°'];
                                                return sorted.map((m, i) => (
                                                    <PlayInCard key={m.id} partido={m} label={labels[i] ?? `Partido ${i + 1}`} />
                                                ));
                                            })()}
                                        </div>

                                        {/* Flecha indicando que los ganadores van a Semis */}
                                        {estePlayIn.length > 0 && esteSemis.length > 0 && (
                                            <div style={{ textAlign: 'center', margin: '10px 0 0', fontSize: '0.5rem', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                                                <span style={{ color: '#6366f1' }}>↓ ganadores pasan a Semis</span>
                                                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* BRACKET ESTE */}
                                {(esteSemis.length > 0 || esteFinal.length > 0) && (
                                    <SimpleBracket
                                        semis={esteSemis}
                                        final={esteFinal}
                                        tercero={esteTercero}
                                        title="🔵 Bracket Conferencia Este"
                                        accentColor="#3b82f6"
                                    />
                                )}

                                {estePlayIn.length === 0 && esteSemis.length === 0 && esteFinal.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#475569' }}>
                                        <div style={{ fontSize: '2rem', marginBottom: 10 }}>🔵</div>
                                        <p style={{ fontSize: '0.8rem' }}>No hay partidos de Conf. Este programados aún</p>
                                    </div>
                                )}
                            </>
                        )}

                        {/* ── CONF. OESTE ── */}
                        {tab === 'oeste' && (
                            <>
                                {/* Info directas */}
                                {oesteSemis.length > 0 && (
                                    <div style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 10, padding: '8px 12px', marginBottom: 16, fontSize: '0.55rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                                        🏅 Los <b style={{ color: '#fb923c' }}>4 mejores</b> de Conf. Oeste avanzan directo a Semis — sin Play-In
                                    </div>
                                )}

                                {/* BRACKET OESTE */}
                                {(oesteSemis.length > 0 || oesteFinal.length > 0) ? (
                                    <SimpleBracket
                                        semis={oesteSemis}
                                        final={oesteFinal}
                                        tercero={oesteTercero}
                                        title="🟠 Bracket Conferencia Oeste"
                                        accentColor="#f97316"
                                    />
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#475569' }}>
                                        <div style={{ fontSize: '2rem', marginBottom: 10 }}>🟠</div>
                                        <p style={{ fontSize: '0.8rem' }}>No hay partidos de Conf. Oeste programados aún</p>
                                    </div>
                                )}
                            </>
                        )}

                        {/* ── GRAN FINAL ── (visible en ambos tabs si existe) */}
                        {grandFinal.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                    <div style={{ flex: 1, height: 1, background: 'rgba(251,191,36,0.4)' }} />
                                    <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 20, padding: '5px 16px' }}>
                                        <span style={{ fontSize: '0.58rem', fontWeight: 900, color: '#fbbf24', letterSpacing: '2px' }}>👑 GRAN FINAL</span>
                                    </div>
                                    <div style={{ flex: 1, height: 1, background: 'rgba(251,191,36,0.4)' }} />
                                </div>
                                {grandFinal.map(m => (
                                    <BracketCard key={m.id} partido={m} highlight cardW={300} cardH={80} />
                                ))}
                            </div>
                        )}

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