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

interface EditScore {
    l: number;
    v: number;
}

interface PlayoffViewerProps {
    categoria: string;
    onClose: () => void;
}

// ─────────────────────────────────────────────
// CONTEXTO DE EDICIÓN (evita prop drilling)
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
// HOOK: Logo de equipo
// ─────────────────────────────────────────────
function useTeamLogo(logoPath: string, teamName: string, categoria: string): { url: string; error: boolean } {
    const [url, setUrl] = useState('');
    const [error, setError] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const fetch = async () => {
            if (logoPath?.startsWith('http')) {
                setUrl(logoPath);
                return;
            }
            try {
                const col = categoria.trim().toUpperCase() === 'MASTER40'
                    ? 'equipos'
                    : `equipos_${categoria.trim().toUpperCase()}`;
                const snap = await getDocs(query(collection(db, col), where('nombre', '==', teamName)));
                if (!cancelled) {
                    const logoUrl = snap.docs[0]?.data()?.logoUrl;
                    logoUrl ? setUrl(logoUrl) : setError(true);
                }
            } catch {
                if (!cancelled) setError(true);
            }
        };

        fetch();
        return () => { cancelled = true; };
    }, [logoPath, teamName, categoria]);

    return { url, error };
}

// ─────────────────────────────────────────────
// COMPONENTE: Logo del equipo
// ─────────────────────────────────────────────
const TeamLogo: React.FC<{ logoPath: string; teamName: string; categoria: string; size?: number }> = ({
    logoPath, teamName, categoria, size = 38
}) => {
    const { url, error } = useTeamLogo(logoPath, teamName, categoria);
    const initial = teamName?.charAt(0).toUpperCase() ?? '🏀';

    const baseStyle: React.CSSProperties = {
        width: size, height: size,
        borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.15)',
        flexShrink: 0,
        overflow: 'hidden',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
    };

    if (error || !url) {
        return (
            <div style={{ ...baseStyle, background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: 'white', fontWeight: 900, fontSize: size * 0.42 }}>
                {initial}
            </div>
        );
    }

    return (
        <div style={{ ...baseStyle, background: 'white' }}>
            <img src={url} alt={teamName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => {}} />
        </div>
    );
};

// ─────────────────────────────────────────────
// COMPONENTE: Tarjeta de partido
// ─────────────────────────────────────────────
const MatchCard: React.FC<{ partido: Partido; highlight?: boolean }> = ({ partido: m, highlight = false }) => {
    const { editMode, editScores, setEditScore, handleSaveScore, categoria } = useEditContext();

    const localGana = (m.marcadorLocal ?? -1) > (m.marcadorVisitante ?? -1);
    const visitanteGana = (m.marcadorVisitante ?? -1) > (m.marcadorLocal ?? -1);
    const finalizado = m.estatus === 'finalizado';
    const scoreEdit = editScores[m.id];

    return (
        <div style={{
            background: highlight ? 'rgba(251, 191, 36, 0.08)' : 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(12px)',
            border: highlight ? '1.5px solid rgba(251, 191, 36, 0.45)' : '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            padding: '10px 12px',
            width: 190,           // ← más angosto (era 255)
            boxShadow: highlight
                ? '0 8px 32px rgba(251, 191, 36, 0.15)'
                : '0 4px 20px rgba(0,0,0,0.4)',
            transition: 'transform 0.2s',
        }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
        >
            {/* Header: solo estado */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <span style={{
                    fontSize: '0.52rem', fontWeight: 900, letterSpacing: '1px',
                    color: finalizado ? '#10b981' : (highlight ? '#fbbf24' : '#f59e0b'),
                    background: finalizado ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.1)',
                    padding: '2px 6px', borderRadius: 20,
                }}>
                    {finalizado ? '✓ FINAL' : 'PEND.'}
                </span>
            </div>

            {/* Equipo Local */}
            <TeamRow
                teamName={m.equipoLocalNombre}
                logoPath={m.equipoLocalLogo ?? ''}
                categoria={categoria}
                score={m.marcadorLocal}
                isWinner={finalizado && localGana}
                editMode={editMode}
                onEditChange={val => setEditScore(m.id, 'l', val)}
                initialScore={m.marcadorLocal ?? 0}
            />

            <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '7px 0' }} />

            {/* Equipo Visitante */}
            <TeamRow
                teamName={m.equipoVisitanteNombre}
                logoPath={m.equipoVisitanteLogo ?? ''}
                categoria={categoria}
                score={m.marcadorVisitante}
                isWinner={finalizado && visitanteGana}
                editMode={editMode}
                onEditChange={val => setEditScore(m.id, 'v', val)}
                initialScore={m.marcadorVisitante ?? 0}
            />

            {editMode && (
                <button
                    onClick={() => handleSaveScore(m)}
                    style={{
                        width: '100%', marginTop: 10,
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: 'white', border: 'none', borderRadius: 7,
                        padding: '6px 0', fontSize: '0.62rem', fontWeight: 900,
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
// COMPONENTE: Fila de equipo (dentro de MatchCard)
// ─────────────────────────────────────────────
interface TeamRowProps {
    teamName?: string;
    logoPath: string;
    categoria: string;
    score?: number;
    isWinner: boolean;
    editMode: boolean;
    onEditChange: (val: number) => void;
    initialScore: number;
}

const TeamRow: React.FC<TeamRowProps> = ({
    teamName, logoPath, categoria, score, isWinner,
    editMode, onEditChange, initialScore
}) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1 }}>
            <TeamLogo logoPath={logoPath} teamName={teamName ?? ''} categoria={categoria} size={26} />
            <span style={{
                fontWeight: isWinner ? 900 : 500,
                fontSize: '0.75rem',
                color: isWinner ? '#fbbf24' : 'rgba(255,255,255,0.8)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
                {teamName ?? 'TBD'}
            </span>
        </div>
        {editMode ? (
            <input
                type="number"
                defaultValue={initialScore}
                onChange={e => onEditChange(Number(e.target.value))}
                style={{
                    width: 36, textAlign: 'center',
                    background: '#0f172a', color: 'white',
                    border: '1px solid #3b82f6', borderRadius: 5,
                    padding: '3px 2px', fontSize: '0.8rem',
                    flexShrink: 0,
                }}
            />
        ) : (
            <span style={{
                fontSize: '1rem', fontWeight: 900, flexShrink: 0,
                color: isWinner ? '#fbbf24' : 'rgba(255,255,255,0.6)',
                minWidth: 20, textAlign: 'right',
            }}>
                {score ?? '—'}
            </span>
        )}
    </div>
);

// ─────────────────────────────────────────────
// COMPONENTE: Columna de fase (ej. "OCTAVOS")
// ─────────────────────────────────────────────
const PhaseColumn: React.FC<{ label: string; partidos: Partido[] }> = ({ label, partidos }) => {
    if (partidos.length === 0) return null;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <PhaseLabel text={label} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, justifyContent: 'space-around' }}>
                {partidos.map(p => <MatchCard key={p.id} partido={p} />)}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────
// COMPONENTE: Etiqueta de fase
// ─────────────────────────────────────────────
const PhaseLabel: React.FC<{ text: string; gold?: boolean }> = ({ text, gold = false }) => (
    <div style={{
        fontSize: '0.62rem', fontWeight: 900,
        letterSpacing: '2.5px', textTransform: 'uppercase',
        color: gold ? '#fbbf24' : '#475569',
        borderBottom: `1px solid ${gold ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.06)'}`,
        paddingBottom: 6, whiteSpace: 'nowrap',
    }}>
        {text}
    </div>
);

// ─────────────────────────────────────────────
// CONSTANTES DE LAYOUT DEL BRACKET
// ─────────────────────────────────────────────
const CARD_H  = 120;   // altura aprox. de MatchCard
const CARD_GAP = 14;   // gap entre tarjetas en PhaseColumn
const LABEL_S  = 35;   // altura de PhaseLabel + gap (para offset del conector)

// ─────────────────────────────────────────────
// COMPONENTE: Líneas conectoras del bracket
// ─────────────────────────────────────────────
//  direction='left'  → muchos cards convergen hacia la derecha (Cuartos→Semis)
//  direction='right' → una entrada diverge hacia varios cards  (Semis→Cuartos)
//  prevCount: si fromCount < prevCount, añade desplazamiento vertical para
//             centrar el conector respecto a la fase anterior más grande.
const BracketConnector: React.FC<{
    fromCount: number;
    direction: 'left' | 'right';
    prevCount?: number;
}> = ({ fromCount, direction, prevCount }) => {
    if (fromCount === 0) return null;

    const W     = 30;
    const color = 'rgba(100,116,139,0.38)';
    const totalH = fromCount * CARD_H + (fromCount - 1) * CARD_GAP;

    // Cuánto hay que bajar el conector para alinearlo con la fase anterior
    const maxPrev = prevCount ?? fromCount;
    const yOffset = fromCount < maxPrev
        ? (maxPrev - fromCount) * (CARD_H + CARD_GAP) / 2
        : 0;

    // Centro de cada tarjeta relativo al conector
    const points = Array.from({ length: fromCount }, (_, i) =>
        i * (CARD_H + CARD_GAP) + CARD_H / 2
    );
    const topY = points[0];
    const botY = points[fromCount - 1];
    const midY = (topY + botY) / 2;

    // Div-línea helper
    const hLine = (left: number, top: number, width: number, key: string) => (
        <div key={key} style={{
            position: 'absolute', left, top: top - 0.5,
            width, height: 1, background: color,
        }} />
    );
    const vLine = (left: number, top: number, height: number, key: string) => (
        <div key={key} style={{
            position: 'absolute', left: left - 0.5, top,
            width: 1, height, background: color,
        }} />
    );

    return (
        <div style={{
            position: 'relative',
            width: W, height: totalH,
            flexShrink: 0,
            alignSelf: 'flex-start',
            marginTop: LABEL_S + yOffset,
        }}>
            {direction === 'left' ? (
                <>
                    {/* Stubs desde cada card */}
                    {points.map((y, i) => hLine(0, y, W / 2, `sl${i}`))}
                    {/* Barra vertical */}
                    {fromCount > 1 && vLine(W / 2, topY, botY - topY, 'vl')}
                    {/* Salida hacia la derecha */}
                    {hLine(W / 2, midY, W / 2, 'el')}
                </>
            ) : (
                <>
                    {/* Entrada desde la izquierda */}
                    {hLine(0, midY, W / 2, 'er')}
                    {/* Barra vertical */}
                    {fromCount > 1 && vLine(W / 2, topY, botY - topY, 'vr')}
                    {/* Stubs hacia cada card */}
                    {points.map((y, i) => hLine(W / 2, y, W / 2, `sr${i}`))}
                </>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL: PlayoffViewer
// ─────────────────────────────────────────────
const PlayoffViewer: React.FC<PlayoffViewerProps> = ({ categoria, onClose }) => {
    const [partidos, setPartidos] = useState<Partido[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editScores, setEditScores] = useState<Record<string, EditScore>>({});
    const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

    const colName = categoria.trim().toUpperCase() === 'MASTER40'
        ? 'calendario'
        : `calendario_${categoria.trim().toUpperCase()}`;

    // Admin check
    useEffect(() => {
        const checkAdmin = async () => {
            const user = auth.currentUser;
            if (!user) return;
            try {
                const snap = await getDoc(doc(db, 'usuarios', user.uid));
                if (snap.exists() && snap.data().rol === 'admin') setIsAdmin(true);
            } catch { /* silencioso */ }
        };
        checkAdmin();
    }, []);

    // Suscripción en tiempo real
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

    // Actualizar marcador en estado local
    const setEditScore = useCallback((id: string, field: 'l' | 'v', value: number) => {
        setEditScores(prev => ({
            ...prev,
            [id]: { ...(prev[id] ?? { l: 0, v: 0 }), [field]: value }
        }));
    }, []);

    // Guardar en Firestore
    const handleSaveScore = useCallback(async (partido: Partido) => {
        const score = editScores[partido.id];
        if (!score) {
            showToast('Modifica el marcador antes de guardar.', 'err');
            return;
        }
        try {
            await updateDoc(doc(db, colName, partido.id), {
                marcadorLocal: score.l,
                marcadorVisitante: score.v,
                estatus: 'finalizado',
            });
            showToast('Resultado actualizado ✓', 'ok');
        } catch {
            showToast('Error al guardar. Intenta de nuevo.', 'err');
        }
    }, [editScores, colName]);

    const showToast = (msg: string, type: 'ok' | 'err') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    // División de fases en llave izquierda y derecha
    const getPhase = (faseName: string) => {
        const all = partidos.filter(m => m.fase?.toUpperCase() === faseName.toUpperCase());

        // Si los partidos tienen campo `lado`, usarlo; si no, dividir por índice
        const hasLado = all.some(m => m.lado);
        if (hasLado) {
            return {
                left: all.filter(m => m.lado === 'izquierda').sort((a, b) => (a.posicion ?? 0) - (b.posicion ?? 0)),
                right: all.filter(m => m.lado === 'derecha').sort((a, b) => (a.posicion ?? 0) - (b.posicion ?? 0)),
            };
        }
        const mid = Math.ceil(all.length / 2);
        return { left: all.slice(0, mid), right: all.slice(mid) };
    };

    const octavos = getPhase('OCTAVOS');
    const cuartos = getPhase('CUARTOS');
    const semis = getPhase('SEMIS');
    const finalPartidos = partidos.filter(m => m.fase?.toUpperCase() === 'FINAL');
    const tercerLugar = partidos.filter(m => m.fase?.toUpperCase() === '3ER LUGAR');

    const editCtx: EditContextType = { editMode, editScores, setEditScore, handleSaveScore, categoria, colName };

    return (
        <EditContext.Provider value={editCtx}>
            <div style={{
                position: 'fixed', inset: 0, zIndex: 2000,
                background: 'radial-gradient(ellipse at 50% 0%, #0f1f3d 0%, #020617 70%)',
                overflowY: 'auto', overflowX: 'auto',
                color: 'white', fontFamily: "'Inter', 'Segoe UI', sans-serif",
            }}>
                {/* Fondo decorativo */}
                <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
                    background: 'radial-gradient(circle at 20% 50%, rgba(59,130,246,0.04) 0%, transparent 60%), radial-gradient(circle at 80% 50%, rgba(251,191,36,0.03) 0%, transparent 60%)'
                }} />

                <style>{`
                    @keyframes spin { to { transform: rotate(360deg); } }
                    @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
                    @media (max-width: 600px) {
                        .scroll-hint { display: block !important; }
                        .bracket-header-title { font-size: 0.75rem !important; }
                        .bracket-header-sub { display: none !important; }
                        .bracket-btn-text { display: none; }
                    }
                `}</style>

                {/* Cabecera */}
                <header style={{
                    padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(2,6,23,0.85)', backdropFilter: 'blur(16px)',
                    position: 'sticky', top: 0, zIndex: 20,
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: '1.4rem' }}>🏆</span>
                        <div>
                            <h2 className="bracket-header-title" style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: '#fbbf24', letterSpacing: '2px', textTransform: 'uppercase' }}>
                                Road to the Finals
                            </h2>
                            <p className="bracket-header-sub" style={{ margin: 0, fontSize: '0.65rem', color: '#475569', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
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
                                    letterSpacing: '1px', transition: 'all 0.2s',
                                }}
                            >
                                {editMode ? '👁 VER PÚBLICO' : '⚙️ EDITAR'}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            style={{
                                background: 'rgba(239,68,68,0.15)', color: '#f87171',
                                border: '1px solid rgba(239,68,68,0.3)',
                                padding: '7px 14px', borderRadius: 8,
                                fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.25)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.15)')}
                        >
                            ✕ CERRAR
                        </button>
                    </div>
                </header>

                {/* Contenido */}
                {loading ? (
                    <LoadingState />
                ) : error ? (
                    <ErrorState message={error} />
                ) : (
                    <>
                        {/* Indicador de scroll en móvil */}
                        <div style={{
                            display: 'none',
                            textAlign: 'center', padding: '10px 0 0',
                            fontSize: '0.6rem', color: '#475569', letterSpacing: '1.5px',
                            // Se muestra solo en pantallas pequeñas vía CSS en el <style> de LoadingState
                        }} className="scroll-hint">
                            ← DESLIZA PARA VER EL BRACKET →
                        </div>

                        <main style={{
                            display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
                            padding: '30px 16px',
                            overflowX: 'auto',
                            WebkitOverflowScrolling: 'touch' as any,
                            scrollSnapType: 'x proximity',
                            position: 'relative', zIndex: 1,
                        }}>
                            {/* LLAVE IZQUIERDA: Cuartos → conector → Semis → conector */}
                            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                {cuartos.left.length > 0 && (
                                    <>
                                        <PhaseColumn label="Cuartos" partidos={cuartos.left} />
                                        <BracketConnector
                                            fromCount={cuartos.left.length}
                                            direction="left"
                                        />
                                    </>
                                )}
                                {semis.left.length > 0 && (
                                    <>
                                        <PhaseColumn label="Semifinal" partidos={semis.left} />
                                        <BracketConnector
                                            fromCount={1}
                                            direction="left"
                                            prevCount={cuartos.left.length || 1}
                                        />
                                    </>
                                )}
                            </div>

                            {/* CENTRO: Gran Final + 3er Lugar */}
                            {(() => {
                                // paddingTop dinámico para alinear el card Final con las líneas de los conectores
                                const prevCount = cuartos.left.length > 0 ? cuartos.left.length : 1;
                                const semiOffset = prevCount > 1
                                    ? (prevCount - 1) * (CARD_H + CARD_GAP) / 2
                                    : 0;
                                const semiCardCenter = LABEL_S + semiOffset + CARD_H / 2;
                                const headingH = 27; // "Gran Final" label + gap
                                const centerPT = Math.max(0, semiCardCenter - headingH - CARD_H / 2);
                                return (
                                    <div style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                                        gap: 28, flexShrink: 0,
                                        paddingTop: centerPT,
                                    }}>
                                        {finalPartidos.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                                                <div style={{
                                                    fontSize: '0.65rem', fontWeight: 900, letterSpacing: '3px',
                                                    color: '#fbbf24', textTransform: 'uppercase',
                                                    textShadow: '0 0 20px rgba(251,191,36,0.5)',
                                                }}>
                                                    👑 Gran Final
                                                </div>
                                                {finalPartidos.map(p => <MatchCard key={p.id} partido={p} highlight />)}
                                            </div>
                                        )}
                                        {tercerLugar.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 8 }}>
                                                <div style={{ fontSize: '0.58rem', fontWeight: 900, letterSpacing: '2px', color: '#94a3b8', textTransform: 'uppercase' }}>
                                                    🥉 Tercer Lugar
                                                </div>
                                                {tercerLugar.map(p => <MatchCard key={p.id} partido={p} />)}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* LLAVE DERECHA: conector → Semis → conector → Cuartos */}
                            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                {semis.right.length > 0 && (
                                    <>
                                        <BracketConnector
                                            fromCount={1}
                                            direction="right"
                                            prevCount={cuartos.right.length || 1}
                                        />
                                        <PhaseColumn label="Semifinal" partidos={semis.right} />
                                    </>
                                )}
                                {cuartos.right.length > 0 && (
                                    <>
                                        <BracketConnector
                                            fromCount={cuartos.right.length}
                                            direction="right"
                                        />
                                        <PhaseColumn label="Cuartos" partidos={cuartos.right} />
                                    </>
                                )}
                            </div>
                        </main>
                    </>
                )}

                {/* Toast de notificación */}
                {toast && (
                    <div style={{
                        position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
                        background: toast.type === 'ok' ? 'rgba(16,185,129,0.95)' : 'rgba(239,68,68,0.95)',
                        color: 'white', padding: '10px 24px', borderRadius: 10,
                        fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.5px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                        zIndex: 9999, backdropFilter: 'blur(8px)',
                        animation: 'fadeIn 0.2s ease',
                    }}>
                        {toast.msg}
                    </div>
                )}
            </div>
        </EditContext.Provider>
    );
};

// ─────────────────────────────────────────────
// ESTADOS DE CARGA Y ERROR
// ─────────────────────────────────────────────
const LoadingState = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16 }}>
        <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
            @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
            @media (max-width: 600px) {
                .scroll-hint { display: block !important; }
                .bracket-header h2 { font-size: 0.75rem !important; }
                .bracket-header p { display: none; }
            }
        `}</style>
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
        <p style={{ color: '#f87171', fontSize: '0.9rem', fontWeight: 600, maxWidth: 320, textAlign: 'center' }}>{message}</p>
    </div>
);

export default PlayoffViewer;