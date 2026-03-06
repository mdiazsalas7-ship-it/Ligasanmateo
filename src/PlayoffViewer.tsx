import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { db, auth } from './firebase';
import {
    collection, query, onSnapshot, orderBy,
    doc, updateDoc, getDoc, where, getDocs
} from 'firebase/firestore';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
interface Partido {
    id: string;
    fase: string;
    fechaAsignada?: string;
    estatus?: 'finalizado' | 'pendiente' | string;
    equipoLocalNombre?: string;
    equipoLocalLogo?: string;
    equipoVisitanteNombre?: string;
    equipoVisitanteLogo?: string;
    marcadorLocal?: number;
    marcadorVisitante?: number;
    lado?: 'izquierda' | 'derecha';
    posicion?: number;
}

interface EditScore { l: number; v: number; }
interface PlayoffViewerProps { categoria: string; onClose: () => void; }

// ─────────────────────────────────────────────
// CONTEXTO DE EDICIÓN
// ─────────────────────────────────────────────
interface EditContextType {
    editMode: boolean;
    editScores: Record<string, EditScore>;
    setEditScore: (id: string, field: 'l' | 'v', value: number) => void;
    handleSaveScore: (partido: Partido) => Promise<void>;
    categoria: string;
    colName: string;
}

const EditContext = createContext<EditContextType | null>(null);
const useEditContext = () => {
    const ctx = useContext(EditContext);
    if (!ctx) throw new Error('useEditContext must be used inside EditContext.Provider');
    return ctx;
};

// ─────────────────────────────────────────────
// HOOK: Logo de equipo desde Firestore/Storage
// ─────────────────────────────────────────────
function useTeamLogo(logoPath: string, teamName: string, categoria: string) {
    const [url, setUrl]     = useState('');
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const fetchLogo = async () => {
            if (logoPath?.startsWith('http')) { setUrl(logoPath); return; }
            try {
                const col = categoria.trim().toUpperCase() === 'MASTER40'
                    ? 'equipos' : `equipos_${categoria.trim().toUpperCase()}`;
                const snap = await getDocs(
                    query(collection(db, col), where('nombre', '==', teamName))
                );
                if (!cancelled) {
                    const logoUrl = snap.docs[0]?.data()?.logoUrl;
                    logoUrl ? setUrl(logoUrl) : setError(true);
                }
            } catch { if (!cancelled) setError(true); }
        };
        fetchLogo();
        return () => { cancelled = true; };
    }, [logoPath, teamName, categoria]);

    return { url, error };
}

// ─────────────────────────────────────────────
// COMPONENTE: Logo circular del equipo
// ─────────────────────────────────────────────
const TeamLogo: React.FC<{
    logoPath: string; teamName: string; categoria: string; size?: number;
}> = ({ logoPath, teamName, categoria, size = 28 }) => {
    const { url, error } = useTeamLogo(logoPath, teamName, categoria);
    const initial = teamName?.charAt(0).toUpperCase() ?? '?';

    const base: React.CSSProperties = {
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        border: '2px solid rgba(255,255,255,0.12)', overflow: 'hidden',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
    };

    if (error || !url) return (
        <div style={{
            ...base,
            background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)',
            color: 'white', fontWeight: 900, fontSize: size * 0.4,
        }}>
            {initial}
        </div>
    );
    return (
        <div style={{ ...base, background: 'white' }}>
            <img src={url} alt={teamName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
    );
};

// ─────────────────────────────────────────────
// COMPONENTE: Fila de equipo dentro de MatchCard
// ─────────────────────────────────────────────
interface TeamRowProps {
    teamName?: string; logoPath: string; categoria: string;
    score?: number; isWinner: boolean; isPending: boolean;
    editMode: boolean; onEditChange: (v: number) => void; initialScore: number;
}

const TeamRow: React.FC<TeamRowProps> = ({
    teamName, logoPath, categoria, score, isWinner, isPending,
    editMode, onEditChange, initialScore,
}) => (
    <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 10px', borderRadius: 8,
        background: isWinner ? 'rgba(251,191,36,0.07)' : 'transparent',
    }}>
        <TeamLogo logoPath={logoPath} teamName={teamName ?? ''} categoria={categoria} size={26} />
        <span style={{
            flex: 1, fontSize: '0.8rem',
            fontWeight: isWinner ? 900 : 500,
            color: isWinner ? '#fbbf24'
                : teamName === 'TBD' ? '#334155'
                : 'rgba(255,255,255,0.85)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
            {teamName ?? 'TBD'}
        </span>
        {editMode ? (
            <input
                type="number"
                defaultValue={initialScore}
                onChange={e => onEditChange(Number(e.target.value))}
                style={{
                    width: 38, textAlign: 'center', flexShrink: 0,
                    background: '#0f172a', color: 'white',
                    border: '1px solid #3b82f6', borderRadius: 6,
                    padding: '4px 2px', fontSize: '0.85rem',
                }}
            />
        ) : (
            <span style={{
                fontSize: '1rem', fontWeight: 900, flexShrink: 0,
                minWidth: 22, textAlign: 'right',
                color: isWinner ? '#fbbf24'
                    : isPending ? '#1e293b'
                    : 'rgba(255,255,255,0.5)',
            }}>
                {isPending ? '—' : (score ?? '—')}
            </span>
        )}
    </div>
);

// ─────────────────────────────────────────────
// COMPONENTE: Tarjeta de partido
// ─────────────────────────────────────────────
const MatchCard: React.FC<{
    partido: Partido; highlight?: boolean; wide?: boolean;
}> = ({ partido: m, highlight = false, wide = false }) => {
    const { editMode, editScores, setEditScore, handleSaveScore, categoria } = useEditContext();
    const [hovered, setHovered] = useState(false);

    const finalizado    = m.estatus === 'finalizado';
    const isPending     = !finalizado;
    const localGana     = finalizado && (m.marcadorLocal  ?? -1) > (m.marcadorVisitante ?? -1);
    const visitanteGana = finalizado && (m.marcadorVisitante ?? -1) > (m.marcadorLocal  ?? -1);

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                width: wide ? 300 : 260,
                borderRadius: 14, overflow: 'hidden',
                background: highlight
                    ? 'linear-gradient(135deg,rgba(251,191,36,0.12),rgba(251,191,36,0.04))'
                    : 'rgba(255,255,255,0.04)',
                border: highlight
                    ? '1.5px solid rgba(251,191,36,0.5)'
                    : hovered
                        ? '1px solid rgba(255,255,255,0.14)'
                        : '1px solid rgba(255,255,255,0.07)',
                boxShadow: highlight
                    ? '0 8px 32px rgba(251,191,36,0.15)'
                    : hovered ? '0 8px 24px rgba(0,0,0,0.5)' : '0 4px 16px rgba(0,0,0,0.3)',
                transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
                transition: 'all 0.2s ease',
            }}
        >
            {/* Badge estado */}
            <div style={{
                padding: '5px 10px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
                <span style={{
                    fontSize: '0.5rem', fontWeight: 900, letterSpacing: '1.5px',
                    color: finalizado ? '#10b981' : highlight ? '#fbbf24' : '#475569',
                    background: finalizado ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)',
                    padding: '2px 7px', borderRadius: 20,
                }}>
                    {finalizado ? '✓ FINALIZADO' : '⏳ PENDIENTE'}
                </span>
                {highlight && <span style={{ fontSize: '0.65rem' }}>👑</span>}
            </div>

            {/* Equipos */}
            <div style={{ padding: '4px 4px' }}>
                <TeamRow
                    teamName={m.equipoLocalNombre}
                    logoPath={m.equipoLocalLogo ?? ''}
                    categoria={categoria}
                    score={m.marcadorLocal}
                    isWinner={localGana}
                    isPending={isPending}
                    editMode={editMode}
                    onEditChange={val => setEditScore(m.id, 'l', val)}
                    initialScore={m.marcadorLocal ?? 0}
                />
                <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '2px 10px' }} />
                <TeamRow
                    teamName={m.equipoVisitanteNombre}
                    logoPath={m.equipoVisitanteLogo ?? ''}
                    categoria={categoria}
                    score={m.marcadorVisitante}
                    isWinner={visitanteGana}
                    isPending={isPending}
                    editMode={editMode}
                    onEditChange={val => setEditScore(m.id, 'v', val)}
                    initialScore={m.marcadorVisitante ?? 0}
                />
            </div>

            {/* Botón guardar */}
            {editMode && (
                <button
                    onClick={() => handleSaveScore(m)}
                    style={{
                        width: '100%', padding: '7px 0',
                        background: 'linear-gradient(135deg,#10b981,#059669)',
                        color: 'white', border: 'none',
                        fontSize: '0.62rem', fontWeight: 900,
                        cursor: 'pointer', letterSpacing: '1px',
                    }}
                >
                    GUARDAR
                </button>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────
// COMPONENTE: Conector SVG vertical
// Une N tarjetas de arriba con 1 entrada abajo
// ─────────────────────────────────────────────
const VerticalConnector: React.FC<{ fromCount: number }> = ({ fromCount }) => {
    const CARD_W = 260;
    const GAP    = 12;
    const H      = 36;
    const stroke = 'rgba(100,116,139,0.4)';

    const totalW = fromCount * CARD_W + (fromCount - 1) * GAP;
    const midX   = totalW / 2;
    const pts    = Array.from({ length: fromCount }, (_, i) =>
        i * (CARD_W + GAP) + CARD_W / 2
    );

    return (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg width={totalW} height={H} style={{ display: 'block' }}>
                {pts.map((x, i) => (
                    <line key={i} x1={x} y1={0} x2={x} y2={H / 2}
                        stroke={stroke} strokeWidth={1.5} />
                ))}
                {fromCount > 1 && (
                    <line x1={pts[0]} y1={H / 2} x2={pts[fromCount - 1]} y2={H / 2}
                        stroke={stroke} strokeWidth={1.5} />
                )}
                <line x1={midX} y1={H / 2} x2={midX} y2={H}
                    stroke={stroke} strokeWidth={1.5} />
            </svg>
        </div>
    );
};

// ─────────────────────────────────────────────
// COMPONENTE: Etiqueta de fase con líneas
// ─────────────────────────────────────────────
const PhaseLabel: React.FC<{ text: string; gold?: boolean }> = ({ text, gold = false }) => (
    <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', maxWidth: 560,
        margin: '0 auto 14px',
    }}>
        <div style={{ flex: 1, height: 1, background: gold ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.06)' }} />
        <span style={{
            fontSize: '0.58rem', fontWeight: 900,
            letterSpacing: '3px', textTransform: 'uppercase',
            color: gold ? '#fbbf24' : '#475569',
            whiteSpace: 'nowrap',
        }}>
            {text}
        </span>
        <div style={{ flex: 1, height: 1, background: gold ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.06)' }} />
    </div>
);

// ─────────────────────────────────────────────
// ESTADOS DE CARGA Y ERROR
// ─────────────────────────────────────────────
const LoadingState = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
        <div style={{
            width: 44, height: 44, borderRadius: '50%',
            border: '3px solid rgba(251,191,36,0.2)',
            borderTop: '3px solid #fbbf24',
            animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ color: '#475569', fontSize: '0.85rem', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Cargando llaves...
        </p>
    </div>
);

const ErrorState = ({ message }: { message: string }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12 }}>
        <span style={{ fontSize: '2.5rem' }}>⚠️</span>
        <p style={{ color: '#f87171', fontSize: '0.9rem', fontWeight: 600, maxWidth: 300, textAlign: 'center' }}>
            {message}
        </p>
    </div>
);

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
const PlayoffViewer: React.FC<PlayoffViewerProps> = ({ categoria, onClose }) => {
    const [partidos, setPartidos]     = useState<Partido[]>([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState<string | null>(null);
    const [isAdmin, setIsAdmin]       = useState(false);
    const [editMode, setEditMode]     = useState(false);
    const [editScores, setEditScores] = useState<Record<string, EditScore>>({});
    const [toast, setToast]           = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

    const colName = categoria.trim().toUpperCase() === 'MASTER40'
        ? 'calendario'
        : `calendario_${categoria.trim().toUpperCase()}`;

    useEffect(() => {
        const check = async () => {
            const user = auth.currentUser;
            if (!user) return;
            try {
                const snap = await getDoc(doc(db, 'usuarios', user.uid));
                if (snap.exists() && snap.data().rol === 'admin') setIsAdmin(true);
            } catch { /* silencioso */ }
        };
        check();
    }, []);

    useEffect(() => {
        setLoading(true);
        setError(null);
        const q = query(collection(db, colName), orderBy('fechaAsignada', 'asc'));
        const unsub = onSnapshot(
            q,
            snap => {
                const data = snap.docs
                    .map(d => ({ id: d.id, ...d.data() } as Partido))
                    .filter(m => m.fase && m.fase.toUpperCase() !== 'REGULAR');
                setPartidos(data);
                setLoading(false);
            },
            err => {
                console.error(err);
                setError('No se pudieron cargar las llaves. Verifica tu conexión.');
                setLoading(false);
            }
        );
        return () => unsub();
    }, [colName]);

    const setEditScore = useCallback((id: string, field: 'l' | 'v', value: number) => {
        setEditScores(prev => ({
            ...prev,
            [id]: { ...(prev[id] ?? { l: 0, v: 0 }), [field]: value },
        }));
    }, []);

    const handleSaveScore = useCallback(async (partido: Partido) => {
        const score = editScores[partido.id];
        if (!score) { showToast('Modifica el marcador antes de guardar.', 'err'); return; }
        try {
            await updateDoc(doc(db, colName, partido.id), {
                marcadorLocal: score.l,
                marcadorVisitante: score.v,
                estatus: 'finalizado',
            });
            showToast('Resultado guardado ✓', 'ok');
        } catch {
            showToast('Error al guardar. Intenta de nuevo.', 'err');
        }
    }, [editScores, colName]);

    const showToast = (msg: string, type: 'ok' | 'err') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    // Fases — cubre todas las variaciones de nombre usadas en la app
    const getByFase = (...nombres: string[]) =>
        partidos.filter(m => nombres.some(n => m.fase?.toUpperCase() === n.toUpperCase()));

    const octavos     = getByFase('OCTAVOS');
    const cuartos     = getByFase('CUARTOS');
    const semis       = getByFase('SEMIS', 'SEMIFINAL');
    const finalP      = getByFase('FINAL', 'GRAN FINAL');
    const tercerLugar = getByFase('3ER LUGAR', 'TERCER LUGAR');

    const hayPartidos = octavos.length + cuartos.length + semis.length + finalP.length > 0;

    const editCtx: EditContextType = {
        editMode, editScores, setEditScore, handleSaveScore, categoria, colName,
    };

    return (
        <EditContext.Provider value={editCtx}>
            <div style={{
                position: 'fixed', inset: 0, zIndex: 2000,
                background: 'radial-gradient(ellipse at 50% 0%, #0f1f3d 0%, #020617 70%)',
                overflowY: 'auto', overflowX: 'hidden',
                color: 'white', fontFamily: "'Inter','Segoe UI',sans-serif",
            }}>
                {/* Fondo decorativo */}
                <div style={{
                    position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
                    background: 'radial-gradient(circle at 30% 20%,rgba(59,130,246,0.05) 0%,transparent 50%), radial-gradient(circle at 70% 80%,rgba(251,191,36,0.04) 0%,transparent 50%)',
                }} />

                <style>{`
                    @keyframes spin   { to { transform: rotate(360deg); } }
                    @keyframes fadeUp { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
                `}</style>

                {/* ── Header ── */}
                <header style={{
                    padding: '14px 20px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(2,6,23,0.88)', backdropFilter: 'blur(16px)',
                    position: 'sticky', top: 0, zIndex: 20,
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: '1.4rem' }}>🏆</span>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: '#fbbf24', letterSpacing: '2px', textTransform: 'uppercase' }}>
                                Road to the Finals
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.6rem', color: '#475569', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                                {categoria}
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                        {isAdmin && (
                            <button
                                onClick={() => setEditMode(v => !v)}
                                style={{
                                    background: editMode ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)',
                                    color: editMode ? '#fbbf24' : '#94a3b8',
                                    border: `1px solid ${editMode ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.1)'}`,
                                    padding: '7px 14px', borderRadius: 8,
                                    fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {editMode ? '👁 VER' : '⚙️ EDITAR'}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            style={{
                                background: 'rgba(239,68,68,0.15)', color: '#f87171',
                                border: '1px solid rgba(239,68,68,0.3)',
                                padding: '7px 14px', borderRadius: 8,
                                fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                            }}
                        >
                            ✕ CERRAR
                        </button>
                    </div>
                </header>

                {/* ── Contenido ── */}
                {loading    ? <LoadingState /> :
                 error      ? <ErrorState message={error} /> :
                 !hayPartidos ? (
                    <div style={{ textAlign: 'center', padding: '80px 20px', color: '#475569' }}>
                        <div style={{ fontSize: '3rem', marginBottom: 16 }}>🏆</div>
                        <p style={{ fontWeight: 700, fontSize: '0.9rem', color: '#64748b' }}>
                            Los playoffs aún no han comenzado
                        </p>
                        <p style={{ fontSize: '0.72rem', marginTop: 8, color: '#334155' }}>
                            Los partidos aparecerán aquí cuando se programen.
                        </p>
                    </div>
                 ) : (

                    // ── BRACKET VERTICAL ──
                    <main style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        padding: '28px 16px 80px',
                        position: 'relative', zIndex: 1,
                        gap: 0,
                    }}>

                        {/* OCTAVOS */}
                        {octavos.length > 0 && (
                            <>
                                <PhaseLabel text="Octavos de Final" />
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
                                    {octavos.map(p => <MatchCard key={p.id} partido={p} />)}
                                </div>
                                <VerticalConnector fromCount={octavos.length} />
                            </>
                        )}

                        {/* CUARTOS */}
                        {cuartos.length > 0 && (
                            <>
                                <PhaseLabel text="Cuartos de Final" />
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
                                    {cuartos.map(p => <MatchCard key={p.id} partido={p} />)}
                                </div>
                                <VerticalConnector fromCount={cuartos.length} />
                            </>
                        )}

                        {/* SEMIS */}
                        {semis.length > 0 && (
                            <>
                                <PhaseLabel text="Semifinal" />
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
                                    {semis.map(p => <MatchCard key={p.id} partido={p} />)}
                                </div>
                                <VerticalConnector fromCount={semis.length} />
                            </>
                        )}

                        {/* GRAN FINAL */}
                        {finalP.length > 0 && (
                            <>
                                <PhaseLabel text="👑 Gran Final" gold />
                                <div style={{ position: 'relative' }}>
                                    {/* Aura dorada */}
                                    <div style={{
                                        position: 'absolute', inset: -16, borderRadius: 28,
                                        background: 'radial-gradient(circle,rgba(251,191,36,0.14) 0%,transparent 70%)',
                                        pointerEvents: 'none',
                                    }} />
                                    {finalP.map(p => <MatchCard key={p.id} partido={p} highlight wide />)}
                                </div>
                            </>
                        )}

                        {/* 3ER LUGAR */}
                        {tercerLugar.length > 0 && (
                            <div style={{ marginTop: 36, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ width: '100%', maxWidth: 400, height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 24 }} />
                                <PhaseLabel text="🥉 Tercer Lugar" />
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                                    {tercerLugar.map(p => <MatchCard key={p.id} partido={p} />)}
                                </div>
                            </div>
                        )}

                    </main>
                )}

                {/* Toast */}
                {toast && (
                    <div style={{
                        position: 'fixed', bottom: 28, left: '50%',
                        transform: 'translateX(-50%)',
                        background: toast.type === 'ok'
                            ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)',
                        color: 'white', padding: '10px 24px', borderRadius: 10,
                        fontSize: '0.8rem', fontWeight: 700,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        zIndex: 9999, backdropFilter: 'blur(8px)',
                        animation: 'fadeUp 0.2s ease',
                        whiteSpace: 'nowrap',
                    }}>
                        {toast.msg}
                    </div>
                )}
            </div>
        </EditContext.Provider>
    );
};

export default PlayoffViewer;