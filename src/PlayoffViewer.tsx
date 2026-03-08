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
// COMPONENTE: Tarjeta compacta de partido para el bracket
// ─────────────────────────────────────────────
interface BracketCardProps {
    partido: Partido;
    highlight?: boolean;
    x: number; y: number;
    cardW: number; cardH: number;
}

// ─────────────────────────────────────────────
// COMPONENTE: Tarjeta compacta para bracket horizontal
// ─────────────────────────────────────────────
const BracketCard: React.FC<BracketCardProps> = ({ partido: m, highlight = false, x, y, cardW, cardH }) => {
    const { editMode, editScores, setEditScore, handleSaveScore, categoria } = useEditContext();

    const finalizado    = m.estatus === 'finalizado';
    const isPending     = !finalizado;
    const localGana     = finalizado && (m.marcadorLocal  ?? -1) > (m.marcadorVisitante ?? -1);
    const visitanteGana = finalizado && (m.marcadorVisitante ?? -1) > (m.marcadorLocal  ?? -1);
    const rowH          = cardH / 2;

    const TeamRow = ({ nombre, logo, gana, score, side }: {
        nombre?: string; logo: string; gana: boolean; score?: number; side: 'l'|'v';
    }) => (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            height: rowH, padding: '0 7px',
            background: gana ? 'rgba(251,191,36,0.08)' : 'transparent',
            borderBottom: side === 'l' ? '1px solid rgba(255,255,255,0.06)' : 'none',
        }}>
            <TeamLogo logoPath={logo} teamName={nombre ?? ''} categoria={categoria} size={22} />
            <span style={{
                flex: 1, fontSize: '0.6rem', fontWeight: gana ? 900 : 500,
                color: gana ? '#fbbf24' : nombre ? 'rgba(255,255,255,0.85)' : '#334155',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
                {nombre ?? 'TBD'}
            </span>
            {editMode ? (
                <input type="number" defaultValue={side === 'l' ? (m.marcadorLocal ?? 0) : (m.marcadorVisitante ?? 0)}
                    onChange={e => setEditScore(m.id, side, Number(e.target.value))}
                    style={{ width: 32, textAlign: 'center', background: '#0f172a', color: 'white', border: '1px solid #3b82f6', borderRadius: 4, padding: '2px 1px', fontSize: '0.7rem', flexShrink: 0 }} />
            ) : (
                <span style={{
                    fontSize: '0.85rem', fontWeight: 900, minWidth: 20, textAlign: 'right', flexShrink: 0,
                    color: gana ? '#fbbf24' : isPending ? 'transparent' : 'rgba(255,255,255,0.5)',
                }}>
                    {isPending ? '—' : (score ?? '—')}
                </span>
            )}
        </div>
    );

    return (
        <div style={{
            position: 'absolute', left: x, top: y,
            width: cardW, height: cardH,
            borderRadius: 8, overflow: 'hidden',
            background: highlight
                ? 'linear-gradient(135deg,rgba(251,191,36,0.12),rgba(15,23,42,0.98))'
                : 'rgba(255,255,255,0.05)',
            border: `1.5px solid ${highlight ? 'rgba(251,191,36,0.5)' : finalizado ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.08)'}`,
            boxShadow: highlight ? '0 0 20px rgba(251,191,36,0.15)' : '0 2px 8px rgba(0,0,0,0.4)',
        }}>
            <TeamRow nombre={m.equipoLocalNombre}    logo={m.equipoLocalLogo ?? ''}    gana={localGana}     score={m.marcadorLocal}    side="l" />
            <TeamRow nombre={m.equipoVisitanteNombre} logo={m.equipoVisitanteLogo ?? ''} gana={visitanteGana} score={m.marcadorVisitante} side="v" />
            {editMode && (
                <button onClick={() => handleSaveScore(m)} style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    padding: '3px 0', background: 'rgba(16,185,129,0.9)',
                    color: 'white', border: 'none', fontSize: '0.45rem', fontWeight: 900, cursor: 'pointer',
                }}>GUARDAR</button>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────
// COMPONENTE: Conector SVG vertical
// Une N tarjetas de arriba con 1 entrada abajo
// ─────────────────────────────────────────────


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

                    // ── BRACKET HORIZONTAL ──
                    <main style={{ padding: '16px 0 80px', position: 'relative', zIndex: 1 }}>
                    {(() => {
                        // ── Dimensiones ──
                        const CW = 155; // card width
                        const CH = 68;  // card height (2 rows)
                        const LW = 34;  // line connector width
                        const PG = 12;  // gap entre partidos del mismo par
                        const BG = 36;  // gap entre llave superior e inferior

                        // ── Determinar columnas ──
                        // Columna más temprana que existe
                        const hasOct  = octavos.length  > 0;
                        const hasQtr  = cuartos.length  > 0;
                        const hasSemi = semis.length    > 0;
                        const hasFin  = finalP.length   > 0;

                        // Construir rondas de izquierda a derecha
                        type Round = { matches: Partido[]; label: string; col: number };
                        const rounds: Round[] = [];
                        let col = 0;
                        if (hasOct)  { rounds.push({ matches: octavos, label: 'OCTAVOS', col }); col++; }
                        if (hasQtr)  { rounds.push({ matches: cuartos, label: 'CUARTOS', col }); col++; }
                        if (hasSemi) { rounds.push({ matches: semis,   label: 'SEMIS',   col }); col++; }
                        if (hasFin)  { rounds.push({ matches: finalP,  label: 'FINAL',   col }); col++; }

                        const numCols  = col;
                        const totalW   = numCols * CW + (numCols - 1) * LW + 32;

                        // ── Calcular posición Y de cada tarjeta ──
                        // Lógica: la primera ronda determina el espaciado base
                        // Cada ronda siguiente tiene mitad de tarjetas, centradas entre pares
                        const firstRound = rounds[0];
                        const nFirst     = firstRound?.matches.length ?? 0;

                        // Y base para primera ronda: pares de tarjetas con gap entre pares
                        const getFirstYs = (n: number): number[] => {
                            const ys: number[] = [];
                            for (let i = 0; i < n; i++) {
                                // Pair index (every 2 = same semi)
                                const pair   = Math.floor(i / 2);
                                const inPair = i % 2;
                                ys.push(pair * (2 * CH + PG + BG) + inPair * (CH + PG));
                            }
                            return ys;
                        };

                        // Y para ronda siguiente: centrar entre cada par previo
                        const getNextYs = (prevYs: number[]): number[] => {
                            const ys: number[] = [];
                            for (let i = 0; i < prevYs.length; i += 2) {
                                const y1 = prevYs[i];
                                const y2 = prevYs[i + 1] ?? y1;
                                ys.push((y1 + y2) / 2);
                            }
                            // If odd number, just use first half
                            if (prevYs.length === 1) ys.push(prevYs[0]);
                            return ys;
                        };

                        // Build Y positions for each round
                        const roundYs: number[][] = [];
                        let prevYs = getFirstYs(nFirst);
                        rounds.forEach((r, ri) => {
                            if (ri === 0) {
                                roundYs.push(prevYs);
                            } else {
                                const ys = getNextYs(prevYs);
                                roundYs.push(ys);
                                prevYs = ys;
                            }
                        });

                        // Total height
                        const lastFirstY = prevYs.length > 0 ? prevYs[0] : 0;
                        const totalH = nFirst > 0
                            ? getFirstYs(nFirst)[nFirst - 1] + CH + 16
                            : CH + 16;

                        // ── SVG lines between consecutive rounds ──
                        const lines: React.ReactNode[] = [];
                        const stroke     = 'rgba(100,116,139,0.45)';
                        const strokeGold = 'rgba(251,191,36,0.5)';

                        for (let ri = 0; ri < rounds.length - 1; ri++) {
                            const fromRound = rounds[ri];
                            const toRound   = rounds[ri + 1];
                            const fromYs    = roundYs[ri];
                            const toYs      = roundYs[ri + 1];
                            const isFinalConn = ri === rounds.length - 2;
                            const sc = isFinalConn ? strokeGold : stroke;

                            const x1 = fromRound.col * (CW + LW) + CW + 16;  // right edge of from card
                            const x2 = toRound.col   * (CW + LW) + 16;        // left edge of to card
                            const mx = (x1 + x2) / 2;                          // midpoint x

                            // Pair up from matches → to match
                            for (let ti = 0; ti < toYs.length; ti++) {
                                const fi1 = ti * 2;
                                const fi2 = ti * 2 + 1;
                                const fy1 = (fromYs[fi1] ?? fromYs[0]) + CH / 2;
                                const fy2 = (fromYs[fi2] !== undefined ? fromYs[fi2] : fromYs[fi1] ?? fromYs[0]) + CH / 2;
                                const ty  = toYs[ti] + CH / 2;

                                if (fromYs[fi2] !== undefined) {
                                    // Two inputs → vertical bracket → one output
                                    lines.push(
                                        <g key={`line-${ri}-${ti}`}>
                                            {/* From match 1 → midX */}
                                            <polyline points={`${x1},${fy1} ${mx},${fy1} ${mx},${ty} ${x2},${ty}`}
                                                fill="none" stroke={sc} strokeWidth="1.5" />
                                            {/* From match 2 → midX */}
                                            <polyline points={`${x1},${fy2} ${mx},${fy2} ${mx},${ty}`}
                                                fill="none" stroke={sc} strokeWidth="1.5" />
                                        </g>
                                    );
                                } else {
                                    // Single input → straight line
                                    lines.push(
                                        <line key={`line-${ri}-${ti}`}
                                            x1={x1} y1={fy1} x2={x2} y2={ty}
                                            stroke={sc} strokeWidth="1.5" />
                                    );
                                }
                            }
                        }

                        return (
                            <div style={{ overflowX: 'auto', overflowY: 'visible', WebkitOverflowScrolling: 'touch', paddingBottom: 8 }}>
                                {/* Column labels */}
                                <div style={{ display: 'flex', width: totalW, paddingLeft: 16, marginBottom: 10 }}>
                                    {rounds.map((r) => (
                                        <div key={r.col} style={{ width: CW, marginRight: LW, textAlign: 'center', flexShrink: 0 }}>
                                            <span style={{
                                                fontSize: '0.48rem', fontWeight: 900, letterSpacing: '2px',
                                                color: r.label === 'FINAL' ? '#fbbf24' : '#475569',
                                                textTransform: 'uppercase',
                                            }}>
                                                {r.label === 'SEMIS' ? 'SEMIFINAL' : r.label === 'FINAL' ? '👑 GRAN FINAL' : r.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                {/* Bracket canvas */}
                                <div style={{ position: 'relative', width: totalW, height: totalH, marginLeft: 16 }}>
                                    {/* SVG lines layer */}
                                    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible' }}>
                                        {lines}
                                    </svg>

                                    {/* Cards */}
                                    {rounds.map((r, ri) =>
                                        r.matches.map((m, mi) => (
                                            <BracketCard
                                                key={m.id}
                                                partido={m}
                                                highlight={r.label === 'FINAL'}
                                                x={r.col * (CW + LW)}
                                                y={roundYs[ri]?.[mi] ?? 0}
                                                cardW={CW}
                                                cardH={CH}
                                            />
                                        ))
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* 3er lugar fuera del bracket principal */}
                    {tercerLugar.length > 0 && (
                        <div style={{ margin: '24px 16px 0', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20 }}>
                            <div style={{ textAlign: 'center', marginBottom: 10, fontSize: '0.52rem', fontWeight: 900, letterSpacing: '2px', color: '#78716c' }}>
                                🥉 TERCER LUGAR
                            </div>
                            {tercerLugar.map(m => (
                                <BracketCard key={m.id} partido={m} highlight={false}
                                    x={0} y={0} cardW={300} cardH={68}
                                />
                            ))}
                            <div style={{ height: 68 }} />
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