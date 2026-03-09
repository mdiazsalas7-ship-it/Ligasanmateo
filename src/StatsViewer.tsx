import React, { useState, useEffect, useCallback, memo } from 'react';
import { db } from './firebase';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
interface PlayerStat {
    id: string;
    jugadorId: string;
    nombre: string;
    equipo: string;
    totalPuntos: number;
    totalRebotes: number;
    totalRobos: number;
    totalBloqueos: number;
    totalTriples: number;
    totalDobles: number;
    totalTirosLibres: number;
    totalValoracion: number;
    partidosJugados: number;
    juegosDelEquipo: number;
    ppg: number; rpg: number; spg: number; bpg: number;
    tpg: number; dpg: number; ftpg: number; valpg: number;
    logoUrl?: string;
    fotoUrl?: string;
}

type ViewMode = 'promedio' | 'total';

interface Category {
    id: string;
    label: string;
    icon: string;
    color: string;
    avgKey: keyof PlayerStat;
    totalKey: keyof PlayerStat;
    avgUnit: string;
    totalUnit: string;
}

const DEFAULT_LOGO = 'https://cdn-icons-png.flaticon.com/512/451/451716.png';

const CATEGORIES: Category[] = [
    { id: 'mvp',         label: 'MVP',      icon: '👑', color: '#eab308', avgKey: 'valpg',  totalKey: 'totalValoracion', avgUnit: 'VAL/PJ', totalUnit: 'VAL'  },
    { id: 'puntos',      label: 'PUNTOS',   icon: '🔥', color: '#ef4444', avgKey: 'ppg',    totalKey: 'totalPuntos',     avgUnit: 'PPG',    totalUnit: 'PTS'  },
    { id: 'rebotes',     label: 'REBOTES',  icon: '🖐️', color: '#10b981', avgKey: 'rpg',    totalKey: 'totalRebotes',    avgUnit: 'RPG',    totalUnit: 'REB'  },
    { id: 'robos',       label: 'ROBOS',    icon: '🛡️', color: '#6366f1', avgKey: 'spg',    totalKey: 'totalRobos',      avgUnit: 'SPG',    totalUnit: 'ROB'  },
    { id: 'bloqueos',    label: 'TAPONES',  icon: '🚫', color: '#f43f5e', avgKey: 'bpg',    totalKey: 'totalBloqueos',   avgUnit: 'BPG',    totalUnit: 'TAP'  },
    { id: 'triples',     label: 'TRIPLES',  icon: '🏹', color: '#8b5cf6', avgKey: 'tpg',    totalKey: 'totalTriples',    avgUnit: '3PG',    totalUnit: '3PT'  },
    { id: 'dobles',      label: 'DOBLES',   icon: '👟', color: '#f59e0b', avgKey: 'dpg',    totalKey: 'totalDobles',     avgUnit: '2PG',    totalUnit: '2PT'  },
    { id: 'tirosLibres', label: 'LIBRES',   icon: '⚪', color: '#64748b', avgKey: 'ftpg',   totalKey: 'totalTirosLibres',avgUnit: 'FTPG',   totalUnit: 'TL'   },
];

const sortPlayers = (players: PlayerStat[], cat: Category, mode: ViewMode): PlayerStat[] => {
    const key = mode === 'promedio' ? cat.avgKey : cat.totalKey;
    return [...players].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0));
};

const ViewToggle = memo(({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) => (
    <div style={{ display: 'flex', background: '#0f172a', borderRadius: 20, padding: 3, border: '1px solid #1e293b' }}>
        {(['promedio', 'total'] as ViewMode[]).map(m => (
            <button key={m} onClick={() => onChange(m)} style={{
                padding: '6px 14px', borderRadius: 16, border: 'none',
                background: mode === m ? 'white' : 'transparent',
                color: mode === m ? '#1e3a8a' : '#64748b',
                fontWeight: 900, fontSize: '0.65rem', cursor: 'pointer',
                transition: 'all 0.2s', textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
                {m === 'promedio' ? '📈 POR PARTIDO' : '📊 TOTALES'}
            </button>
        ))}
    </div>
));

// ─────────────────────────────────────────────
// HELPER: carga imagen remota vía fetch→blob→base64
// ─────────────────────────────────────────────
const loadRemoteImg = (url: string): Promise<HTMLImageElement | null> =>
    new Promise(async resolve => {
        try {
            const res = await fetch(url);
            if (!res.ok) { resolve(null); return; }
            const blob = await res.blob();
            const b64 = await new Promise<string>(r => {
                const fr = new FileReader();
                fr.onloadend = () => r(fr.result as string);
                fr.onerror   = () => r('');
                fr.readAsDataURL(blob);
            });
            const img = new Image();
            img.onload  = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = b64;
        } catch { resolve(null); }
    });

// ─────────────────────────────────────────────
// COMPONENTE: Sección de líderes activa
// (convertido de memo a función normal para usar useState)
// ─────────────────────────────────────────────
const LeaderSection = ({
    cat, players, viewMode, categoria,
}: {
    cat: Category;
    players: PlayerStat[];
    viewMode: ViewMode;
    categoria: string;
}) => {
    const [sharing, setSharing] = useState(false);

    if (!players.length) return (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>📭</div>
            <p style={{ fontWeight: 900, fontSize: '0.9rem', color: '#1e3a8a', textTransform: 'uppercase' }}>
                Temporada {categoria} por iniciar
            </p>
            <small style={{ display: 'block', marginTop: 5 }}>
                No hay estadísticas de Fase Regular registradas.
            </small>
        </div>
    );

    const sorted      = sortPlayers(players, cat, viewMode);
    const leader      = sorted[0];
    const others      = sorted.slice(1, 8);
    const primaryKey  = viewMode === 'promedio' ? cat.avgKey   : cat.totalKey;
    const primaryUnit = viewMode === 'promedio' ? cat.avgUnit  : cat.totalUnit;
    const secondKey   = viewMode === 'promedio' ? cat.totalKey : cat.avgKey;
    const secondUnit  = viewMode === 'promedio' ? cat.totalUnit : cat.avgUnit;

    const compartirLider = async () => {
        setSharing(true);
        try {
            const top3 = sorted.slice(0, 3);
            const W = 800, H = 600;
            const canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            const ctx = canvas.getContext('2d')!;

            // Fondo
            ctx.fillStyle = '#080f1f'; ctx.fillRect(0, 0, W, H);
            // Mancha de color suave en el centro
            const blob2 = ctx.createRadialGradient(W/2, H*0.4, 0, W/2, H*0.4, 340);
            blob2.addColorStop(0, cat.color + '55');
            blob2.addColorStop(1, 'transparent');
            ctx.fillStyle = blob2; ctx.fillRect(0, 0, W, H);
            // Textura puntos
            ctx.fillStyle = 'rgba(255,255,255,0.018)';
            for (let x = 0; x < W; x += 22) for (let y = 0; y < H; y += 22) ctx.fillRect(x, y, 2, 2);

            // ── Logo de la liga ──
            const LIGA_LOGO = 'https://i.postimg.cc/FKgNmFpv/Whats_App_Image_2026_01_25_at_12_07_36_AM.jpg';
            const ligaImg = await loadRemoteImg(LIGA_LOGO);
            const lr = 30, lcy = 42;
            ctx.save();
            ctx.beginPath(); ctx.arc(W/2, lcy, lr, 0, Math.PI*2);
            ctx.fillStyle = 'white'; ctx.fill(); ctx.clip();
            if (ligaImg) ctx.drawImage(ligaImg, W/2-lr, lcy-lr, lr*2, lr*2);
            ctx.restore();
            ctx.beginPath(); ctx.arc(W/2, lcy, lr, 0, Math.PI*2);
            ctx.strokeStyle = cat.color; ctx.lineWidth = 2; ctx.stroke();

            // ── Encabezado ──
            ctx.textAlign = 'center';
            ctx.font = 'bold 13px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillText('LIGA METROPOLITANA EJE ESTE  ·  ' + categoria.toUpperCase(), W/2, lcy + lr + 18);
            ctx.font = 'bold 26px system-ui'; ctx.fillStyle = 'white';
            ctx.fillText(cat.icon + '  LÍDER EN ' + cat.label, W/2, lcy + lr + 44);

            // Línea decorativa
            const gl = ctx.createLinearGradient(100, 0, W-100, 0);
            gl.addColorStop(0, 'transparent'); gl.addColorStop(0.4, cat.color);
            gl.addColorStop(0.6, cat.color);   gl.addColorStop(1, 'transparent');
            ctx.strokeStyle = gl; ctx.lineWidth = 1.5;
            const lineY = lcy + lr + 56;
            ctx.beginPath(); ctx.moveTo(100, lineY); ctx.lineTo(W-100, lineY); ctx.stroke();

            // ── Foto líder ──
            const photoR = 76, photoCX = W/2, photoCY = lineY + photoR + 16;
            const leaderImg = leader.fotoUrl ? await loadRemoteImg(leader.fotoUrl) : null;
            ctx.save();
            ctx.beginPath(); ctx.arc(photoCX, photoCY, photoR, 0, Math.PI*2);
            if (leaderImg) {
                ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip();
                ctx.drawImage(leaderImg, photoCX-photoR, photoCY-photoR, photoR*2, photoR*2);
            } else {
                ctx.fillStyle = cat.color + '99'; ctx.fill(); ctx.clip();
                ctx.font = 'bold 56px system-ui'; ctx.fillStyle = 'white'; ctx.textAlign = 'center';
                ctx.fillText((leader.nombre||'?').charAt(0).toUpperCase(), photoCX, photoCY+20);
            }
            ctx.restore();
            ctx.beginPath(); ctx.arc(photoCX, photoCY, photoR, 0, Math.PI*2);
            ctx.strokeStyle = 'white'; ctx.lineWidth = 3; ctx.stroke();
            // Badge #1
            const bx = photoCX + photoR - 10, by = photoCY - photoR + 10;
            ctx.fillStyle = cat.color;
            ctx.beginPath(); ctx.arc(bx, by, 18, 0, Math.PI*2); ctx.fill();
            ctx.font = 'bold 11px system-ui'; ctx.fillStyle = 'white'; ctx.textAlign = 'center';
            ctx.fillText('#1', bx, by + 4);

            // ── Nombre y equipo ──
            const nameY = photoCY + photoR + 30;
            ctx.textAlign = 'center';
            ctx.font = 'bold 28px system-ui'; ctx.fillStyle = 'white';
            ctx.fillText(leader.nombre.toUpperCase(), W/2, nameY);
            ctx.font = '13px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.fillText(leader.equipo.toUpperCase() + '  ·  ' + categoria.toUpperCase(), W/2, nameY + 22);

            // ── Stat grande — blanco con sombra para que contraste ──
            const statY = nameY + 90;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 16;
            ctx.font = 'bold 88px system-ui'; ctx.fillStyle = 'white';
            ctx.fillText(String(leader[primaryKey] as number), W/2, statY);
            ctx.restore();
            // Unidad con color de categoría
            ctx.font = 'bold 16px system-ui'; ctx.fillStyle = cat.color;
            ctx.fillText(primaryUnit + (viewMode === 'promedio' ? '  ·  POR PARTIDO' : '  ·  TOTAL'), W/2, statY + 22);

            // ── Franja Top 3 ──
            const rowY = H - 118;
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.roundRect(36, rowY, W-72, 96, 14); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(36, rowY, W-72, 96, 14); ctx.stroke();

            const medals = ['🥇','🥈','🥉'];
            const colW = (W-72)/3;
            top3.forEach((p, i) => {
                const rx = 36 + i*colW + colW/2;
                ctx.textAlign = 'center';
                ctx.font = '13px system-ui'; ctx.fillStyle = 'white';
                ctx.fillText(medals[i], rx, rowY + 18);
                ctx.font = 'bold 10px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
                let nm = p.nombre.toUpperCase();
                while (nm.length > 1 && ctx.measureText(nm).width > colW - 16) nm = nm.slice(0,-1);
                if (nm.length < p.nombre.length) nm += '…';
                ctx.fillText(nm, rx, rowY + 36);
                // Número blanco con sombra
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8;
                ctx.font = 'bold 24px system-ui'; ctx.fillStyle = 'white';
                ctx.fillText(String(p[primaryKey] as number), rx, rowY + 62);
                ctx.restore();
                ctx.font = '10px system-ui'; ctx.fillStyle = cat.color;
                ctx.fillText(primaryUnit, rx, rowY + 78);
            });

            // Footer
            ctx.textAlign = 'center'; ctx.font = '11px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillText('Liga Metropolitana Eje Este  ·  San Mateo, Aragua', W/2, H - 10);

            canvas.toBlob(async blob => {
                if (!blob) return;
                const file = new File([blob], 'lider_' + cat.id + '.png', { type: 'image/png' });
                try {
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: 'Líder ' + cat.label + ': ' + leader.nombre });
                    } else {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = 'lider_' + cat.id + '.png'; a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 2000);
                    }
                } catch { /* share cancelado */ }
                setSharing(false);
            }, 'image/png');
        } catch (e) { console.error(e); setSharing(false); }
    };

    return (
        <div style={{
            background: 'white', borderRadius: 28, overflow: 'hidden',
            boxShadow: '0 15px 35px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0',
        }}>
            {/* ── BARAJITA UPPER DECK ── */}
            <div style={{
                background: `linear-gradient(160deg, #0f172a 0%, ${cat.color}cc 100%)`,
                position: 'relative', color: 'white', overflow: 'hidden',
                padding: '10px 10px 0',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.6rem', fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.9 }}>
                        <span style={{ fontSize: '0.9rem' }}>{cat.icon}</span>
                        LÍDER {cat.label}
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.35)', padding: '3px 10px', borderRadius: 6, fontSize: '0.52rem', fontWeight: 900, letterSpacing: 1.5 }}>
                        #1
                    </div>
                </div>

                <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', border: '3px solid rgba(255,255,255,0.25)', boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.4)', position: 'relative' }}>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '35%', background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)', zIndex: 1 }} />
                    {leader.fotoUrl ? (
                        <img src={leader.fotoUrl} alt={leader.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
                            onError={e => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextSibling as HTMLElement)?.style.setProperty('display', 'flex'); }} />
                    ) : null}
                    <div style={{ display: leader.fotoUrl ? 'none' : 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', fontSize: '5rem', fontWeight: 900, background: 'rgba(255,255,255,0.08)' }}>
                        {(leader.nombre || '?').charAt(0).toUpperCase()}
                    </div>
                </div>

                <div style={{ padding: '12px 4px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontWeight: 900, fontSize: '1.1rem', textTransform: 'uppercase', lineHeight: 1, letterSpacing: 0.5, textShadow: '0 2px 6px rgba(0,0,0,0.4)' }}>
                        {leader.nombre}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: '3.6rem', fontWeight: 900, lineHeight: 1, textShadow: `0 4px 12px ${cat.color}99` }}>
                            {leader[primaryKey] as number}
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '1rem', fontWeight: 900, opacity: 0.9 }}>{primaryUnit}</span>
                            <span style={{ fontSize: '0.55rem', opacity: 0.6, fontWeight: 700 }}>{viewMode === 'promedio' ? 'POR PARTIDO' : 'TOTAL'}</span>
                        </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '5px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem', fontWeight: 700 }}>
                        <span style={{ opacity: 0.75 }}>{viewMode === 'promedio' ? 'TOTAL TEMPORADA' : 'PROMEDIO'}</span>
                        <span style={{ fontWeight: 900, fontSize: '0.8rem' }}>{leader[secondKey] as number} {secondUnit}</span>
                    </div>
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 8, marginTop: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.6rem', fontWeight: 800, opacity: 0.8, textTransform: 'uppercase' }}>{leader.equipo}</span>
                        <span style={{ fontSize: '0.55rem', fontWeight: 700, background: 'rgba(255,255,255,0.12)', borderRadius: 6, padding: '2px 8px', opacity: 0.85 }}>{leader.juegosDelEquipo} JJ</span>
                    </div>
                </div>
            </div>

            {/* Encabezado perseguidores */}
            <div style={{ background: '#f8fafc', padding: '10px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 900, color: cat.color, textTransform: 'uppercase', letterSpacing: '1px' }}>Top Perseguidores · Regular</span>
                <span style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600 }}>{primaryUnit} / {secondUnit}</span>
            </div>

            {/* Lista de perseguidores */}
            <div style={{ minHeight: 180 }}>
                {others.map((p, i) => (
                    <div key={p.id} style={{ padding: '13px 20px', display: 'flex', alignItems: 'center', borderBottom: '1px solid #f1f5f9', gap: 12 }}>
                        <span style={{ width: 28, fontWeight: 900, color: '#cbd5e1', fontSize: '1rem', flexShrink: 0, textAlign: 'center' }}>{i + 2}</span>
                        <div style={{ position: 'relative', flexShrink: 0, width: 38, height: 38 }}>
                            <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', border: '2px solid #e2e8f0', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {p.fotoUrl ? (
                                    <img src={p.fotoUrl} alt={p.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
                                        onError={e => { e.currentTarget.style.display = 'none'; (e.currentTarget.nextSibling as HTMLElement)?.style.setProperty('display', 'flex'); }} />
                                ) : null}
                                <div style={{ display: p.fotoUrl ? 'none' : 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1rem', color: '#94a3b8' }}>
                                    {(p.nombre || '?').charAt(0).toUpperCase()}
                                </div>
                            </div>
                            <img src={p.logoUrl || DEFAULT_LOGO} alt={p.equipo} style={{ position: 'absolute', bottom: -2, right: -4, width: 18, height: 18, borderRadius: '50%', border: '1.5px solid white', objectFit: 'contain', background: 'white' }}
                                onError={e => { e.currentTarget.src = DEFAULT_LOGO; }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, color: '#1e3a8a', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nombre}</div>
                            <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 600 }}>{p.equipo.toUpperCase()}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontWeight: 900, color: cat.color, fontSize: '1rem' }}>
                                {p[primaryKey] as number}
                                <span style={{ fontSize: '0.6rem', color: '#94a3b8', marginLeft: 3 }}>{primaryUnit}</span>
                            </div>
                            <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>{p[secondKey] as number} {secondUnit}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── BOTÓN COMPARTIR ── */}
            <div style={{ padding: '14px 16px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
                <button
                    onClick={compartirLider}
                    disabled={sharing}
                    style={{
                        width: '100%', padding: '13px', borderRadius: 14, border: 'none',
                        background: sharing ? '#94a3b8' : cat.color,
                        color: 'white', fontWeight: 900, fontSize: '0.85rem',
                        cursor: sharing ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        boxShadow: sharing ? 'none' : ('0 4px 14px ' + cat.color + '55'),
                        transition: 'all 0.2s',
                    }}
                >
                    {sharing ? '⏳ Generando imagen...' : '📤 COMPARTIR LÍDERES'}
                </button>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
const StatsViewer: React.FC<{ onClose: () => void; categoria: string }> = ({ onClose, categoria }) => {
    const [allPlayers, setAllPlayers] = useState<PlayerStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('mvp');
    const [viewMode, setViewMode] = useState<ViewMode>('promedio');

    useEffect(() => {
        let unsubscribe: (() => void) | undefined;
        setAllPlayers([]);
        setLoading(true);

        const initStats = async () => {
            try {
                const catStr = categoria.trim().toUpperCase();
                const isMaster = catStr === 'MASTER40' || catStr === 'MASTER';
                const colEquipos = isMaster ? 'equipos' : `equipos_${catStr}`;
                const colCalendario = isMaster ? 'calendario' : `calendario_${catStr}`;

                // 1. Logos por nombre de equipo
                const equiposSnap = await getDocs(collection(db, colEquipos));
                const logoMap: Record<string, string> = {};
                equiposSnap.forEach(d => {
                    const data = d.data();
                    if (data.nombre) logoMap[data.nombre.trim().toUpperCase()] = data.logoUrl || DEFAULT_LOGO;
                });

                // 1b. Fotos de jugadores (jugadorId → fotoUrl)
                const colJugadores = isMaster ? 'jugadores' : `jugadores_${catStr}`;
                const jugSnap = await getDocs(collection(db, colJugadores));
                const fotoMap: Record<string, string> = {};
                jugSnap.forEach(d => {
                    const url = d.data().fotoUrl;
                    if (url) fotoMap[d.id] = url;
                });

                // 2. Juegos de Fase Regular finalizados
                const calSnap = await getDocs(
                    query(collection(db, colCalendario), where('estatus', '==', 'finalizado'))
                );
                const teamGamesCount: Record<string, number> = {};
                const validGameIds = new Set<string>();

                calSnap.forEach(d => {
                    const g = d.data();
                    const fase = (g.fase || '').trim().toUpperCase();
                    if (fase !== 'REGULAR' && fase !== '') return;
                    validGameIds.add(d.id);
                    const loc = (g.equipoLocalNombre || '').trim().toUpperCase();
                    const vis = (g.equipoVisitanteNombre || '').trim().toUpperCase();
                    if (loc) teamGamesCount[loc] = (teamGamesCount[loc] || 0) + 1;
                    if (vis) teamGamesCount[vis] = (teamGamesCount[vis] || 0) + 1;
                });

                // 3. Listener en stats_partido
                unsubscribe = onSnapshot(
                    query(collection(db, 'stats_partido')),
                    snapshot => {
                        const aggregated: Record<string, any> = {};

                        snapshot.docs.forEach(d => {
                            const stat = d.data();
                            const juegoId = stat.partidoId || stat.juegoId;
                            if (!juegoId || !validGameIds.has(juegoId)) return;

                            const jId = stat.jugadorId;
                            if (!jId) return;

                            const equipoKey = (stat.equipo || '').trim().toUpperCase();
                            if (!aggregated[jId]) {
                                aggregated[jId] = {
                                    id: jId, jugadorId: jId,
                                    nombre: stat.nombre, equipo: stat.equipo,
                                    totalPuntos: 0, totalRebotes: 0, totalRobos: 0,
                                    totalBloqueos: 0, totalTriples: 0, totalDobles: 0,
                                    totalTirosLibres: 0, totalValoracion: 0,
                                    partidosJugados: 0,
                                    logoUrl: logoMap[equipoKey] || DEFAULT_LOGO,
                                    fotoUrl: fotoMap[jId] || '',
                                };
                            }
                            const acc = aggregated[jId];
                            const pts = (Number(stat.tirosLibres) || 0)
                                + (Number(stat.dobles) || 0) * 2
                                + (Number(stat.triples) || 0) * 3;

                            acc.totalPuntos    += pts;
                            acc.totalRebotes   += (Number(stat.rebotes)   || 0);
                            acc.totalRobos     += (Number(stat.robos)     || 0);
                            acc.totalBloqueos  += (Number(stat.bloqueos)  || 0);
                            acc.totalTriples   += (Number(stat.triples)   || 0);
                            acc.totalDobles    += (Number(stat.dobles)    || 0);
                            acc.totalTirosLibres += (Number(stat.tirosLibres) || 0);
                            acc.totalValoracion  += pts
                                + (Number(stat.rebotes) || 0)
                                + (Number(stat.robos)   || 0)
                                + (Number(stat.bloqueos)|| 0);
                            acc.partidosJugados += 1;
                        });

                        const processed: PlayerStat[] = Object.values(aggregated).map((p: any) => {
                            const eq = (p.equipo || '').trim().toUpperCase();
                            const den = teamGamesCount[eq] || p.partidosJugados || 1;
                            return {
                                ...p,
                                juegosDelEquipo: den,
                                ppg:   parseFloat((p.totalPuntos    / den).toFixed(1)),
                                rpg:   parseFloat((p.totalRebotes   / den).toFixed(1)),
                                spg:   parseFloat((p.totalRobos     / den).toFixed(1)),
                                bpg:   parseFloat((p.totalBloqueos  / den).toFixed(1)),
                                tpg:   parseFloat((p.totalTriples   / den).toFixed(1)),
                                dpg:   parseFloat((p.totalDobles    / den).toFixed(1)),
                                ftpg:  parseFloat((p.totalTirosLibres / den).toFixed(1)),
                                valpg: parseFloat((p.totalValoracion  / den).toFixed(1)),
                            };
                        });

                        setAllPlayers(processed.filter(p => p.partidosJugados > 0));
                        setLoading(false);
                    }
                );
            } catch (err) {
                console.error(err);
                setLoading(false);
            }
        };

        initStats();
        return () => { if (unsubscribe) unsubscribe(); };
    }, [categoria]);

    const activeCat = CATEGORIES.find(c => c.id === activeTab)!;

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 120 }}>

            {/* Header */}
            <div style={{
                background: '#1e3a8a', padding: '20px 18px 16px', color: 'white',
                boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                borderRadius: '0 0 28px 28px',
            }}>
                <div style={{
                    maxWidth: 800, margin: '0 auto',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontWeight: 900, fontSize: '1.5rem', letterSpacing: '-0.5px' }}>
                            📊 LÍDERES
                        </h2>
                        <p style={{ margin: '2px 0 0', opacity: 0.8, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#fbbf24' }}>
                            Fase Regular · {categoria}
                        </p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                        <button
                            onClick={onClose}
                            style={{
                                background: 'white', color: '#1e3a8a', border: 'none',
                                padding: '8px 18px', borderRadius: 12,
                                fontWeight: 900, fontSize: '0.72rem', cursor: 'pointer',
                            }}
                        >
                            CERRAR
                        </button>
                        <ViewToggle mode={viewMode} onChange={setViewMode} />
                    </div>
                </div>
            </div>

            {/* Tabs de categoría */}
            <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 }}>
                <div
                    className="no-scrollbar"
                    style={{ display: 'flex', overflowX: 'auto', padding: '12px 14px', gap: 10, maxWidth: 800, margin: '0 auto' }}
                >
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveTab(cat.id)}
                            style={{
                                flexShrink: 0, padding: '9px 18px', borderRadius: 18, border: 'none',
                                background: activeTab === cat.id ? cat.color : '#f1f5f9',
                                color: activeTab === cat.id ? 'white' : '#64748b',
                                fontWeight: 800, fontSize: '0.72rem', cursor: 'pointer',
                                transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
                                boxShadow: activeTab === cat.id ? `0 4px 12px ${cat.color}55` : 'none',
                            }}
                        >
                            <span>{cat.icon}</span>
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Contenido */}
            <div style={{ padding: '18px 14px', maxWidth: 650, margin: '0 auto' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '80px 20px', color: '#1e3a8a', fontWeight: 700 }}>
                        <div style={{ fontSize: '2rem', marginBottom: 10 }}>🏀</div>
                        Calculando {viewMode === 'promedio' ? 'promedios' : 'totales'}...
                    </div>
                ) : (
                    <LeaderSection
                        cat={activeCat}
                        players={allPlayers}
                        viewMode={viewMode}
                        categoria={categoria}
                    />
                )}
            </div>

            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
};

export default StatsViewer;