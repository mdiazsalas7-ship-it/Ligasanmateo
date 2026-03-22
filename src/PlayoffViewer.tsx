import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { db, auth } from './firebase';
import {
    collection, query, onSnapshot, orderBy,
    doc, updateDoc, getDoc, where, getDocs
} from 'firebase/firestore';

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
    cuartosLocal?: Record<string, number>;
    cuartosVisitante?: Record<string, number>;
    lado?: 'izquierda' | 'derecha';
    posicion?: number;
}

interface EditScore { l: number; v: number; }
interface PlayoffViewerProps { categoria: string; onClose: () => void }

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

interface BracketCardProps {
    partido: Partido;
    highlight?: boolean;
    x: number; y: number;
    cardW: number; cardH: number;
}

const BracketCard: React.FC<BracketCardProps> = ({ partido: m, highlight = false, x, y, cardW, cardH }) => {
    const { editMode, editScores, setEditScore, handleSaveScore, categoria } = useEditContext();

    const finalizado    = m.estatus === 'finalizado';
    const isPending     = !finalizado;
    const localGana     = finalizado && (m.marcadorLocal  ?? -1) > (m.marcadorVisitante ?? -1);
    const visitanteGana = finalizado && (m.marcadorVisitante ?? -1) > (m.marcadorLocal  ?? -1);

    const qL = m.cuartosLocal    as Record<string,number> | undefined;
    const qV = m.cuartosVisitante as Record<string,number> | undefined;
    const hasQuarters = finalizado && (qL || qV) && ['Q1','Q2','Q3','Q4'].some(q => (qL?.[q] ?? 0) + (qV?.[q] ?? 0) > 0);
    const quarterH = hasQuarters ? 18 : 0;
    const teamRowH = (cardH - quarterH) / 2;

    return (
        <div style={{
            position: 'relative', left: 0, top: 0,
            width: cardW, height: cardH,
            borderRadius: 8, overflow: 'hidden',
            background: highlight
                ? 'linear-gradient(135deg,rgba(251,191,36,0.12),rgba(15,23,42,0.98))'
                : 'rgba(30,41,59,0.95)',
            border: `1.5px solid ${highlight ? 'rgba(251,191,36,0.5)' : finalizado ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.08)'}`,
            boxShadow: highlight ? '0 0 20px rgba(251,191,36,0.15)' : '0 2px 8px rgba(0,0,0,0.5)',
        }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                height: teamRowH, padding: '0 6px',
                background: localGana ? 'rgba(251,191,36,0.08)' : 'transparent',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                <TeamLogo logoPath={m.equipoLocalLogo ?? ''} teamName={m.equipoLocalNombre ?? ''} categoria={categoria} size={20} />
                <span style={{ flex: 1, fontSize: '0.58rem', fontWeight: localGana ? 900 : 500, color: localGana ? '#fbbf24' : 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.equipoLocalNombre ?? 'TBD'}
                </span>
                {editMode
                    ? <input type="number" defaultValue={m.marcadorLocal ?? 0} onChange={e => setEditScore(m.id,'l',Number(e.target.value))} style={{ width: 28, textAlign: 'center', background: '#0f172a', color: 'white', border: '1px solid #3b82f6', borderRadius: 4, padding: '1px', fontSize: '0.65rem', flexShrink: 0 }} />
                    : <span style={{ fontSize: '0.82rem', fontWeight: 900, minWidth: 18, textAlign: 'right', flexShrink: 0, color: localGana ? '#fbbf24' : isPending ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)' }}>{isPending ? '—' : (m.marcadorLocal ?? '—')}</span>
                }
            </div>

            <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                height: teamRowH, padding: '0 6px',
                background: visitanteGana ? 'rgba(251,191,36,0.08)' : 'transparent',
            }}>
                <TeamLogo logoPath={m.equipoVisitanteLogo ?? ''} teamName={m.equipoVisitanteNombre ?? ''} categoria={categoria} size={20} />
                <span style={{ flex: 1, fontSize: '0.58rem', fontWeight: visitanteGana ? 900 : 500, color: visitanteGana ? '#fbbf24' : 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.equipoVisitanteNombre ?? 'TBD'}
                </span>
                {editMode
                    ? <input type="number" defaultValue={m.marcadorVisitante ?? 0} onChange={e => setEditScore(m.id,'v',Number(e.target.value))} style={{ width: 28, textAlign: 'center', background: '#0f172a', color: 'white', border: '1px solid #3b82f6', borderRadius: 4, padding: '1px', fontSize: '0.65rem', flexShrink: 0 }} />
                    : <span style={{ fontSize: '0.82rem', fontWeight: 900, minWidth: 18, textAlign: 'right', flexShrink: 0, color: visitanteGana ? '#fbbf24' : isPending ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)' }}>{isPending ? '—' : (m.marcadorVisitante ?? '—')}</span>
                }
            </div>

            {hasQuarters && (
                <div style={{
                    height: quarterH, background: 'rgba(0,0,0,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>
                    {['Q1','Q2','Q3','Q4'].map(q => {
                        const l = qL?.[q] ?? 0;
                        const v = qV?.[q] ?? 0;
                        if (l === 0 && v === 0) return null;
                        return (
                            <div key={q} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 22 }}>
                                <span style={{ fontSize: '0.38rem', color: '#475569', fontWeight: 700, letterSpacing: '0.5px' }}>{q}</span>
                                <span style={{ fontSize: '0.48rem', color: localGana || l > v ? '#60a5fa' : '#94a3b8', fontWeight: 800 }}>{l}</span>
                                <span style={{ fontSize: '0.48rem', color: visitanteGana || v > l ? '#f87171' : '#94a3b8', fontWeight: 800 }}>{v}</span>
                            </div>
                        );
                    })}
                </div>
            )}

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

    // Trophy URL — replace with Firebase Storage URL if available
    const TROPHY_URL = 'https://i.postimg.cc/43GDW4jB/image.png';

    return (
        <EditContext.Provider value={editCtx}>
            <div style={{
                position: 'relative', minHeight: '100vh',
                background: 'radial-gradient(ellipse at 50% 0%, #0f1f3d 0%, #020617 70%)',
                overflowY: 'auto', overflowX: 'hidden',
                color: 'white', fontFamily: "'Inter','Segoe UI',sans-serif",
            }}>
                <div style={{
                    position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
                    background: 'radial-gradient(circle at 30% 20%,rgba(59,130,246,0.05) 0%,transparent 50%), radial-gradient(circle at 70% 80%,rgba(251,191,36,0.04) 0%,transparent 50%)',
                }} />

                <style>{`
                    @keyframes spin        { to { transform: rotate(360deg); } }
                    @keyframes fadeUp      { from { opacity:0; transform:translateX(-50%) translateY(8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
                    @keyframes trophyFloat { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-7px); } }
                `}</style>

                {/* Header */}
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
                {/* Contenido */}
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
                    <main style={{ padding: '12px 0 80px', position: 'relative', zIndex: 1 }}>
                    {(() => {
                        const hasOct  = octavos.length  > 0;
                        const hasQtr  = cuartos.length  > 0;
                        const hasSemi = semis.length    > 0;
                        const hasFin  = finalP.length   > 0;

                        type Round = { matches: Partido[]; label: string };
                        const rounds: Round[] = [];
                        if (hasOct)  rounds.push({ matches: octavos, label: 'OCTAVOS' });
                        if (hasQtr)  rounds.push({ matches: cuartos, label: 'CUARTOS' });
                        if (hasSemi) rounds.push({ matches: semis,   label: 'SEMIS'   });
                        if (hasFin)  rounds.push({ matches: finalP,  label: 'FINAL'   });

                        const PAD    = 10;
                        const CH     = 82;
                        const PG     = 8;
                        const BG     = 28;
                        const nCols  = rounds.length;
                        const scrW   = Math.min(window.innerWidth, 500);
                        const usable = scrW - PAD * 2;
                        const CW     = Math.floor(usable / (nCols + 0.14 * Math.max(nCols - 1, 0)));
                        const CONN   = Math.floor(CW * 0.14);
                        const bc     = 'rgba(100,116,139,0.5)';
                        const bcG    = 'rgba(251,191,36,0.6)';

                        // Trophy height reserved above FINAL column header
                        const TROPHY_H = hasFin ? 110 : 0;

                        const getYs = (n: number, roundIdx: number): number[] => {
                            if (roundIdx === 0) {
                                const ys: number[] = [];
                                for (let i = 0; i < n; i++) {
                                    const pair = Math.floor(i / 2);
                                    const pos  = i % 2;
                                    ys.push(pair * (2 * CH + PG + BG) + pos * (CH + PG));
                                }
                                return ys;
                            }
                            const prevYs = getYs(rounds[roundIdx - 1].matches.length, roundIdx - 1);
                            const ys: number[] = [];
                            for (let i = 0; i < n; i++) {
                                const y1 = prevYs[i * 2]       ?? prevYs[0] ?? 0;
                                const y2 = prevYs[i * 2 + 1]   ?? y1;
                                ys.push((y1 + y2) / 2);
                            }
                            return ys;
                        };

                        const TROPHY_BOX = 100;
                        const allYs  = rounds.map((r, ri) => getYs(r.matches.length, ri));
                        const firstYs = allYs[0] ?? [];
                        const totalH  = firstYs.length > 0
                            ? firstYs[firstYs.length - 1] + CH + 20
                            : CH + 20;

                        const renderConnectors = (ri: number) => {
                            const fromYs = allYs[ri]     ?? [];
                            const toYs   = allYs[ri + 1] ?? [];
                            const isFinal = ri === rounds.length - 2;
                            const color  = isFinal ? bcG : bc;

                            return toYs.map((toY, ti) => {
                                const fi1 = ti * 2;
                                const fi2 = ti * 2 + 1;
                                const y1  = (fromYs[fi1] ?? fromYs[0] ?? 0) + CH / 2;
                                const y2  = (fromYs[fi2] !== undefined ? fromYs[fi2] : fromYs[fi1] ?? 0) + CH / 2;
                                const yTo = toY + CH / 2;
                                const hasPair = fromYs[fi2] !== undefined;

                                if (!hasPair) {
                                    return (
                                        <div key={ti} style={{
                                            position: 'absolute',
                                            top: y1 - 1, left: 0, right: 0, height: 2,
                                            background: color,
                                        }} />
                                    );
                                }

                                const top    = Math.min(y1, y2);
                                const bot    = Math.max(y1, y2);
                                const half   = CONN / 2;

                                return (
                                    <div key={ti} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
                                        <div style={{ position: 'absolute', top: y1 - 1, left: 0, width: half, height: 2, background: color }} />
                                        <div style={{ position: 'absolute', top: y2 - 1, left: 0, width: half, height: 2, background: color }} />
                                        <div style={{ position: 'absolute', top: top - 1, left: half - 1, width: 2, height: bot - top + 2, background: color }} />
                                        <div style={{ position: 'absolute', top: yTo - 1, left: half, right: 0, height: 2, background: color }} />
                                    </div>
                                );
                            });
                        };

                        return (
                            <div style={{ padding: `0 ${PAD}px` }}>
                                {/* Headers row */}
                                <div style={{ display: 'flex', marginBottom: 8, alignItems: 'center' }}>
                                    {rounds.map((r, ri) => {
                                        const isFinal = r.label === 'FINAL';
                                        return (
                                            <React.Fragment key={ri}>
                                                <div style={{ width: CW, textAlign: 'center', flexShrink: 0 }}>
                                                    <span style={{
                                                        fontSize: '0.45rem', fontWeight: 900, letterSpacing: '2px',
                                                        color: isFinal ? '#fbbf24' : '#475569',
                                                        textTransform: 'uppercase',
                                                    }}>
                                                        {r.label === 'SEMIS' ? 'SEMIFINAL' : isFinal ? '👑 GRAN FINAL' : r.label}
                                                    </span>
                                                </div>
                                                {ri < rounds.length - 1 && <div style={{ width: CONN, flexShrink: 0 }} />}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>

                                {/* Bracket */}
                                <div style={{ display: 'flex', position: 'relative', height: totalH, marginTop: hasFin ? TROPHY_BOX + 14 : 0 }}>
                                    {rounds.map((r, ri) => (
                                        <React.Fragment key={ri}>
                                            <div style={{ position: 'relative', width: CW, flexShrink: 0, height: totalH }}>
                                                {r.matches.map((m, mi) => {
                                                    const cardTop = allYs[ri]?.[mi] ?? 0;
                                                    const isFinalCard = r.label === 'FINAL';
                                                    return (
                                                        <React.Fragment key={m.id}>
                                                            {/* Trophy frame between label and final card */}
                                                            {isFinalCard && mi === 0 && (
                                                                <div style={{
                                                                    position: 'absolute',
                                                                    top: cardTop - TROPHY_BOX - 10,
                                                                    left: CW / 2 - TROPHY_BOX / 2,
                                                                    width: TROPHY_BOX,
                                                                    height: TROPHY_BOX,
                                                                    borderRadius: 12,
                                                                    border: '2px solid rgba(251,191,36,0.6)',
                                                                    background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(15,23,42,0.9) 100%)',
                                                                    boxShadow: '0 0 24px rgba(251,191,36,0.2), inset 0 0 16px rgba(251,191,36,0.05)',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    overflow: 'hidden',
                                                                }}>
                                                                    <img
                                                                        src={TROPHY_URL}
                                                                        alt="Trofeo"
                                                                        style={{
                                                                            width: '88%', height: '88%',
                                                                            objectFit: 'contain',
                                                                            filter: 'drop-shadow(0 0 12px rgba(251,191,36,0.6))',
                                                                            animation: 'trophyFloat 3s ease-in-out infinite',
                                                                        }}
                                                                    />
                                                                </div>
                                                            )}
                                                            <div style={{
                                                                position: 'absolute',
                                                                top: cardTop,
                                                                left: 0, width: CW,
                                                            }}>
                                                                <BracketCard
                                                                    partido={m}
                                                                    highlight={isFinalCard}
                                                                    x={0} y={0}
                                                                    cardW={CW}
                                                                    cardH={CH}
                                                                />
                                                            </div>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </div>

                                            {ri < rounds.length - 1 && (
                                                <div style={{ position: 'relative', width: CONN, flexShrink: 0, height: totalH }}>
                                                    {renderConnectors(ri)}
                                                </div>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                    {/* 3er lugar */}
                    {tercerLugar.length > 0 && (
                        <div style={{ margin: '20px 10px 0', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
                            <div style={{ textAlign: 'center', marginBottom: 8, fontSize: '0.5rem', fontWeight: 900, letterSpacing: '2px', color: '#78716c' }}>
                                🥉 TERCER LUGAR
                            </div>
                            {tercerLugar.map(m => (
                                <div key={m.id} style={{ position: 'relative', height: 82, marginBottom: 8 }}>
                                    <BracketCard partido={m} highlight={false} x={0} y={0} cardW={280} cardH={82} />
                                </div>
                            ))}
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