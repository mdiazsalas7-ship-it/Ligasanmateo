import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const LEAGUE_LOGO     = 'https://i.postimg.cc/FKgNmFpv/Whats_App_Image_2026_01_25_at_12_07_36_AM.jpg';
const DEFAULT_LOGO    = 'https://cdn-icons-png.flaticon.com/512/451/451716.png';
const DEFAULT_AVATAR  = '';   // vacío → usa iniciales

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
interface Team {
    id: string;
    nombre: string;
    logoUrl?: string;
    grupo?: string;
    entrenador?: string;
}

interface Player {
    id: string;
    nombre: string;
    numero?: number;
    fotoUrl?: string;
    puntos?: number;
    triples?: number;
    rebotes?: number;
    robos?: number;
    partidosJugados?: number;
}

// ─────────────────────────────────────────────
// HELPER: nombre de colección según categoría
// ─────────────────────────────────────────────
const getCol = (base: string, cat: string) =>
    cat.trim().toUpperCase() === 'MASTER40' ? base : `${base}_${cat.trim().toUpperCase()}`;

// ─────────────────────────────────────────────
// COMPONENTE: Avatar circular del jugador
// ─────────────────────────────────────────────
const Avatar: React.FC<{ player: Player; size?: number }> = ({ player, size = 52 }) => {
    const [err, setErr] = useState(false);
    const initial = (player.nombre || '?').charAt(0).toUpperCase();
    const palette  = ['#1e3a8a','#0369a1','#065f46','#7c2d12','#4c1d95','#831843','#92400e','#134e4a'];
    const bg       = palette[
        player.nombre.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length
    ];

    const base: React.CSSProperties = {
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '3px solid rgba(255,255,255,0.8)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    };

    if (player.fotoUrl && !err) return (
        <div style={base}>
            <img src={player.fotoUrl} alt={player.nombre}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => setErr(true)} />
        </div>
    );

    return (
        <div style={{ ...base, background: bg }}>
            <span style={{ color: 'white', fontWeight: 900, fontSize: size * 0.38 }}>{initial}</span>
        </div>
    );
};

// ─────────────────────────────────────────────
// COMPONENTE: Barajita del jugador (card modal)
// ─────────────────────────────────────────────
const PlayerCard: React.FC<{ player: Player; team: Team; onClose: () => void }> = ({
    player, team, onClose,
}) => {
    const pj    = player.partidosJugados || 1;
    const noPJ  = !player.partidosJugados;
    const [sharing, setSharing] = useState(false);

    const stats = [
        { label: 'PTS', icon: '🔥', color: '#ef4444', total: player.puntos  || 0 },
        { label: 'REB', icon: '🖐️', color: '#10b981', total: player.rebotes || 0 },
        { label: 'ROB', icon: '🛡️', color: '#6366f1', total: player.robos   || 0 },
        { label: '3PT', icon: '🏹', color: '#8b5cf6', total: player.triples || 0 },
    ].map(s => ({
        ...s,
        avg: noPJ ? '—' : (s.total / pj).toFixed(1),
    }));

    // ── Cargar imagen con CORS ──
    const loadImage = (src: string): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src + (src.includes('?') ? '&' : '?') + 't=' + Date.now();
        });

    const compartirBarajita = async () => {
        setSharing(true);
        try {
            const W = 600, H = 800;
            const canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            const ctx = canvas.getContext('2d')!;

            // ── Fondo degradado azul ──
            const grad = ctx.createLinearGradient(0, 0, W * 0.6, H * 0.7);
            grad.addColorStop(0, '#0f172a');
            grad.addColorStop(0.5, '#1e3a8a');
            grad.addColorStop(1, '#2563eb');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, H);

            // ── Patrón de puntos decorativos ──
            ctx.fillStyle = 'rgba(255,255,255,0.04)';
            for (let x = 0; x < W; x += 30)
                for (let y = 0; y < H; y += 30)
                    { ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill(); }

            // ── Número decorativo gigante ──
            if (player.numero != null) {
                ctx.font = 'bold 320px Arial';
                ctx.fillStyle = 'rgba(255,255,255,0.04)';
                ctx.textAlign = 'right';
                ctx.fillText(String(player.numero), W - 10, H * 0.62);
            }

            // ── Foto del jugador ──
            if (player.fotoUrl) {
                try {
                    const foto = await loadImage(player.fotoUrl);
                    // Foto centrada, ocupa ~55% del alto
                    const fh = H * 0.55;
                    const fw = (foto.naturalWidth / foto.naturalHeight) * fh;
                    const fx = (W - fw) / 2;
                    const fy = 40;
                    // Sombra bajo el jugador
                    ctx.save();
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    ctx.shadowBlur = 40;
                    ctx.shadowOffsetY = 20;
                    ctx.drawImage(foto, fx, fy, fw, fh);
                    ctx.restore();
                } catch (_) {}
            } else {
                // Círculo con inicial
                const cx = W / 2, cy = 220, r = 110;
                const accentColor = playerColor(player.nombre);
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fillStyle = accentColor; ctx.fill();
                ctx.font = 'bold 100px Arial';
                ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText((player.nombre || '?').charAt(0).toUpperCase(), cx, cy);
            }

            // ── Línea separadora ──
            const sepY = H * 0.62;
            const sepGrad = ctx.createLinearGradient(40, 0, W - 40, 0);
            sepGrad.addColorStop(0, 'transparent');
            sepGrad.addColorStop(0.3, 'rgba(255,165,0,0.8)');
            sepGrad.addColorStop(0.7, 'rgba(255,165,0,0.8)');
            sepGrad.addColorStop(1, 'transparent');
            ctx.strokeStyle = sepGrad;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(40, sepY); ctx.lineTo(W - 40, sepY); ctx.stroke();

            // ── Número de dorsal badge ──
            if (player.numero != null) {
                const badgeX = W / 2, badgeY = sepY - 16;
                ctx.beginPath();
                ctx.roundRect(badgeX - 35, badgeY - 14, 70, 28, 14);
                ctx.fillStyle = '#f97316'; ctx.fill();
                ctx.font = 'bold 14px Arial';
                ctx.fillStyle = 'white'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('#' + player.numero, badgeX, badgeY);
            }

            // ── Nombre ──
            ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            ctx.font = 'bold 42px Arial';
            ctx.fillStyle = 'white';
            ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10;
            ctx.fillText(player.nombre.toUpperCase(), W / 2, sepY + 52);
            ctx.shadowBlur = 0;

            // ── Equipo ──
            ctx.font = '600 18px Arial';
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fillText(team.nombre.toUpperCase(), W / 2, sepY + 80);

            // ── Panel stats ──
            const panelY = sepY + 100;
            const statColors = ['#ef4444','#10b981','#6366f1','#8b5cf6'];
            const statLabels = ['PTS','REB','ROB','3PT'];
            const statEmojis = ['🔥','🖐','🛡','🏹'];
            const statTotals = [player.puntos||0, player.rebotes||0, player.robos||0, player.triples||0];
            const statAvgs   = stats.map(s => s.avg);
            const colW = (W - 80) / 4;

            stats.forEach((s, i) => {
                const cx2 = 40 + colW * i + colW / 2;
                const cardX = 40 + colW * i + 4;
                const cardH = 130;

                // Card fondo oscuro sólido
                ctx.beginPath();
                ctx.roundRect(cardX, panelY, colW - 8, cardH, 12);
                ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();

                // Borde superior de color (acento)
                ctx.beginPath();
                ctx.roundRect(cardX, panelY, colW - 8, 4, [12, 12, 0, 0]);
                ctx.fillStyle = statColors[i]; ctx.fill();

                // Emoji
                ctx.font = '22px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(statEmojis[i], cx2, panelY + 26);

                // Total — blanco grande
                ctx.font = 'bold 40px Arial';
                ctx.fillStyle = 'white';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(String(statTotals[i]), cx2, panelY + 78);

                // Promedio — gris claro
                ctx.font = '500 13px Arial';
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.fillText(statAvgs[i] + ' x PJ', cx2, panelY + 98);

                // Label — color del stat
                ctx.font = 'bold 14px Arial';
                ctx.fillStyle = statColors[i];
                ctx.fillText(statLabels[i], cx2, panelY + 118);
            });

            // ── Logo liga dentro de círculo ──
            try {
                const logo = await loadImage(LEAGUE_LOGO);
                const cr = 36; // radio del círculo
                const cx3 = W / 2, cy3 = H - 58;

                // Sombra del círculo
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.4)';
                ctx.shadowBlur = 12;

                // Relleno blanco del círculo
                ctx.beginPath(); ctx.arc(cx3, cy3, cr, 0, Math.PI * 2);
                ctx.fillStyle = 'white'; ctx.fill();
                ctx.restore();

                // Borde naranja
                ctx.beginPath(); ctx.arc(cx3, cy3, cr, 0, Math.PI * 2);
                ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2.5; ctx.stroke();

                // Clip logo dentro del círculo
                ctx.save();
                ctx.beginPath(); ctx.arc(cx3, cy3, cr - 2, 0, Math.PI * 2);
                ctx.clip();
                const lh = (cr - 2) * 2;
                const lw = (logo.naturalWidth / logo.naturalHeight) * lh;
                ctx.drawImage(logo, cx3 - lw / 2, cy3 - lh / 2, lw, lh);
                ctx.restore();
            } catch (_) {}

            // ── Watermark ──
            ctx.font = '500 13px Arial';
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.textAlign = 'center';
            ctx.fillText('LIGA METROPOLITANA EJE ESTE', W / 2, H - 12);

            // ── Compartir ──
            canvas.toBlob(async (blob) => {
                if (!blob) return;
                const file = new File([blob], `${player.nombre.replace(/ /g,'_')}.png`, { type: 'image/png' });
                if (navigator.share && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: player.nombre,
                        text: `🏀 ${player.nombre} | ${team.nombre} | Liga Metropolitana Eje Este`,
                    });
                } else {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `${player.nombre.replace(/ /g,'_')}.png`;
                    a.click();
                    URL.revokeObjectURL(url);
                }
            }, 'image/png');
        } catch (e) {
            console.error(e);
            alert('Error al generar la imagen.');
        } finally {
            setSharing(false);
        }
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 5000,
                background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 20,
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    width: '100%', maxWidth: 340, borderRadius: 24,
                    overflow: 'hidden', boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
                    fontFamily: "'Inter','Segoe UI',sans-serif",
                }}
            >
                {/* ── Cabecera de la barajita ── */}
                <div style={{
                    background: 'linear-gradient(160deg, #1e3a8a 0%, #1e40af 60%, #2563eb 100%)',
                    padding: '28px 20px 20px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    position: 'relative',
                }}>
                    {/* Botón cerrar */}
                    <button
                        onClick={onClose}
                        style={{
                            position: 'absolute', top: 12, right: 12,
                            background: 'rgba(255,255,255,0.15)', border: 'none',
                            color: 'white', borderRadius: '50%', width: 30, height: 30,
                            cursor: 'pointer', fontSize: '0.9rem', fontWeight: 900,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >✕</button>

                    {/* Foto del jugador — sin logo encima, más grande */}
                    <Avatar player={player} size={160} />

                    {/* Número de dorsal */}
                    {player.numero != null && (
                        <div style={{
                            marginTop: 10, background: 'rgba(255,255,255,0.15)',
                            color: 'white', padding: '2px 14px', borderRadius: 20,
                            fontSize: '0.7rem', fontWeight: 900, letterSpacing: '1px',
                        }}>
                            #{player.numero}
                        </div>
                    )}

                    {/* Nombre */}
                    <h2 style={{
                        margin: '10px 0 2px', color: 'white',
                        fontSize: '1.25rem', fontWeight: 900,
                        textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.1,
                    }}>
                        {player.nombre}
                    </h2>
                    <p style={{
                        margin: 0, color: 'rgba(255,255,255,0.65)',
                        fontSize: '0.65rem', fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '1.5px',
                    }}>
                        {team.nombre}
                    </p>

                    {/* Partidos jugados */}
                    <div style={{
                        marginTop: 12, background: 'rgba(255,255,255,0.12)',
                        padding: '4px 14px', borderRadius: 20,
                        fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)',
                        letterSpacing: '1px',
                    }}>
                        {pj} PARTIDO{pj !== 1 ? 'S' : ''} JUGADO{pj !== 1 ? 'S' : ''}
                    </div>
                </div>

                {/* ── Stats ── */}
                <div style={{ background: 'white', padding: '14px 14px 18px' }}>
                    <p style={{
                        margin: '0 0 10px', fontSize: '0.55rem', fontWeight: 900,
                        color: '#94a3b8', letterSpacing: '2px', textTransform: 'uppercase',
                        textAlign: 'center',
                    }}>
                        ESTADÍSTICAS · {player.partidosJugados || 0} PJ
                    </p>

                    {/* Grid horizontal 5 columnas */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                        {stats.map(s => (
                            <div key={s.label} style={{
                                background: '#f8fafc', borderRadius: 10,
                                padding: '8px 4px', textAlign: 'center',
                                border: `1.5px solid ${s.color}22`,
                            }}>
                                <div style={{ fontSize: '1rem', lineHeight: 1, marginBottom: 3 }}>
                                    {s.icon}
                                </div>
                                {/* Total grande */}
                                <div style={{
                                    fontSize: '1.3rem', fontWeight: 900,
                                    color: s.color, lineHeight: 1,
                                }}>
                                    {s.total}
                                </div>
                                {/* Promedio pequeño */}
                                <div style={{
                                    fontSize: '0.62rem', fontWeight: 700,
                                    color: '#64748b', marginTop: 2,
                                }}>
                                    {s.avg}
                                </div>
                                {/* Etiqueta */}
                                <div style={{
                                    fontSize: '0.48rem', fontWeight: 900,
                                    color: '#94a3b8', letterSpacing: '0.5px',
                                    textTransform: 'uppercase', marginTop: 1,
                                }}>
                                    {s.label}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Logo liga */}
                    <div style={{ textAlign: 'center', marginTop: 12 }}>
                        <img src={LEAGUE_LOGO} alt="Liga" style={{ height: 20, opacity: 0.3 }} />
                    </div>

                    {/* ── Botón compartir ── */}
                    <button
                        onClick={compartirBarajita}
                        disabled={sharing}
                        style={{
                            width: '100%', marginTop: 14,
                            padding: '13px 0',
                            background: sharing
                                ? '#94a3b8'
                                : 'linear-gradient(90deg, #1e3a8a, #2563eb)',
                            color: 'white', border: 'none', borderRadius: 12,
                            fontWeight: 900, fontSize: '0.8rem',
                            cursor: sharing ? 'default' : 'pointer',
                            letterSpacing: '1px',
                            boxShadow: sharing ? 'none' : '0 4px 12px rgba(37,99,235,0.4)',
                            transition: 'all 0.2s',
                        }}
                    >
                        {sharing ? '⏳ GENERANDO...' : '📤 COMPARTIR BARAJITA'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────

const TeamsPublicViewer: React.FC<{
    onClose: () => void;
    categoria: string;
}> = ({ onClose, categoria }) => {

    const [view, setView]               = useState<'list' | 'roster'>('list');
    const [teams, setTeams]             = useState<Team[]>([]);
    const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
    const [roster, setRoster]           = useState<Player[]>([]);
    const [loading, setLoading]         = useState(true);
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

    const colEquipos   = getCol('equipos',   categoria);
    const colJugadores = getCol('jugadores', categoria);
    const colCalendario = getCol('calendario', categoria);

    // ── Carga de equipos según categoría ──
    useEffect(() => {
        setLoading(true);
        setView('list');
        setTeams([]);

        const fetchTeams = async () => {
            try {
                const snap = await getDocs(collection(db, colEquipos));
                const list = snap.docs
                    .map(d => ({ id: d.id, ...d.data() } as Team))
                    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
                setTeams(list);
            } catch (e) {
                console.error('Error equipos:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchTeams();
    }, [colEquipos]);

    // ── Ver roster ──
    // Fuente: stats_partido (misma que StatsViewer — única fuente correcta)
    // jugadores_* solo tiene puntos/triples actualizados; rebotes/robos quedan en 0
    const handleViewRoster = async (team: Team) => {
        setLoading(true);
        setSelectedTeam(team);
        try {
            // 1. Jugadores del equipo → base (nombre, número, foto)
            const qJ    = query(collection(db, colJugadores), where('equipoId', '==', team.id));
            const snapJ = await getDocs(qJ);

            const base: Record<string, Player> = {};
            snapJ.docs.forEach(d => {
                base[d.id] = {
                    id:             d.id,
                    nombre:         d.data().nombre  || 'Sin nombre',
                    numero:         d.data().numero  ?? undefined,
                    fotoUrl:        d.data().fotoUrl || '',
                    puntos: 0, triples: 0, rebotes: 0, robos: 0,
                    partidosJugados: 0,
                };
            });

            if (Object.keys(base).length === 0) {
                setRoster([]);
                setView('roster');
                return;
            }

            // 2. Partidos finalizados de esta categoría
            const qCal  = query(collection(db, colCalendario), where('estatus', '==', 'finalizado'));
            const snapC = await getDocs(qCal);
            const validIds = new Set(snapC.docs.map(d => d.id));

            // 3. Stats de todos los jugadores del equipo desde stats_partido
            //    Firestore 'in' soporta hasta 30 valores — nómina máx 15
            const playerIds = Object.keys(base);
            const qStats = query(
                collection(db, 'stats_partido'),
                where('jugadorId', 'in', playerIds)
            );
            const snapS = await getDocs(qStats);

            snapS.docs.forEach(d => {
                const s   = d.data();
                const pid = s.jugadorId;
                // Solo partidos finalizados
                if (!validIds.has(s.partidoId)) return;
                if (!base[pid]) return;

                const p   = base[pid];
                const dob = Number(s.dobles      || 0);
                const tri = Number(s.triples     || 0);
                const tl  = Number(s.tirosLibres || 0);

                p.puntos  = (p.puntos  || 0) + dob * 2 + tri * 3 + tl;
                p.triples = (p.triples || 0) + tri;
                p.rebotes = (p.rebotes || 0) + Number(s.rebotes || 0);
                p.robos   = (p.robos   || 0) + Number(s.robos   || 0);
                p.partidosJugados = (p.partidosJugados || 0) + 1;
            });

            // 4. Ordenar por dorsal; sin número al final
            const list = Object.values(base).sort((a, b) => {
                if (a.numero == null && b.numero == null) return 0;
                if (a.numero == null) return 1;
                if (b.numero == null) return -1;
                return a.numero - b.numero;
            });

            setRoster(list);
            setView('roster');
        } catch (e) {
            console.error('Error nómina:', e);
            setRoster([]);
            setView('roster');
        } finally {
            setLoading(false);
        }
    };


    // ─────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────
    return (
        <div style={{
            position: 'relative', minHeight: '100vh',
            background: '#f0f4f8',
            display: 'flex', flexDirection: 'column',
            fontFamily: "'Inter','Segoe UI',sans-serif",
        }}>
            {/* Barajita del jugador */}
            {selectedPlayer && selectedTeam && (
                <PlayerCard
                    player={selectedPlayer}
                    team={selectedTeam}
                    onClose={() => setSelectedPlayer(null)}
                />
            )}

            {/* ── Header ── */}
            <div style={{
                background: 'white', flexShrink: 0,
                borderBottom: '1px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}>
                {/* Fila superior: botón atrás + logo liga */}
                <div style={{
                    padding: '10px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    {/* Botón de regreso */}
                    <button
                        onClick={view === 'roster' ? () => setView('list') : onClose}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: '#f1f5f9', border: 'none', cursor: 'pointer',
                            borderRadius: 12, padding: '8px 14px',
                            color: '#1e3a8a', fontWeight: 800, fontSize: '0.72rem',
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                    >
                        <span style={{ fontSize: '1rem', lineHeight: 1 }}>
                            {view === 'roster' ? '←' : '✕'}
                        </span>
                        <span>{view === 'roster' ? 'Equipos' : 'Cerrar'}</span>
                    </button>

                    {/* Logo liga en círculo */}
                    <div style={{
                        width: 44, height: 44, borderRadius: '50%',
                        border: '2px solid #e2e8f0',
                        background: 'white',
                        overflow: 'hidden',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                        flexShrink: 0,
                    }}>
                        <img src={LEAGUE_LOGO} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Liga" />
                    </div>
                </div>

                {/* Fila inferior: título de la vista */}
                <div style={{
                    padding: '0 16px 10px',
                    display: 'flex', alignItems: 'center', gap: 10,
                }}>
                    {view === 'roster' && selectedTeam && (
                        /* Logo del equipo en círculo + nombre */
                        <>
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%',
                                background: '#f8fafc', border: '2px solid #e2e8f0',
                                overflow: 'hidden', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <img
                                    src={selectedTeam.logoUrl || DEFAULT_LOGO}
                                    alt={selectedTeam.nombre}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={e => { e.currentTarget.src = DEFAULT_LOGO; }}
                                />
                            </div>
                            <div>
                                <div style={{ fontWeight: 900, fontSize: '0.95rem', color: '#1e293b', textTransform: 'uppercase' }}>
                                    {selectedTeam.nombre}
                                </div>
                                <div style={{ fontSize: '0.58rem', color: '#94a3b8', fontWeight: 700 }}>
                                    Toca un jugador para ver su barajita
                                </div>
                            </div>
                        </>
                    )}
                    {view === 'list' && (
                        <div>
                            <div style={{ fontWeight: 900, fontSize: '0.95rem', color: '#1e293b', textTransform: 'uppercase' }}>
                                Equipos
                            </div>
                            <div style={{ fontSize: '0.58rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>
                                {categoria}
                            </div>
                        </div>
                    )}
                </div>
            </div>


            {/* ── Contenido ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 100px' }}>

                {loading ? (
                    <div style={{ textAlign: 'center', paddingTop: 60, color: '#1e3a8a', fontWeight: 700 }}>
                        <div style={{ fontSize: '2rem', marginBottom: 10 }}>🏀</div>
                        Cargando...
                    </div>

                ) : view === 'list' ? (
                    // ── Grid de equipos ──
                    <>
                        {teams.length === 0 ? (
                            <div style={{ textAlign: 'center', paddingTop: 60, color: '#94a3b8' }}>
                                <div style={{ fontSize: '2rem', marginBottom: 10 }}>🏀</div>
                                <p style={{ fontWeight: 700 }}>No hay equipos registrados en {categoria}</p>
                            </div>
                        ) : (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                                gap: 12,
                                maxWidth: 600, margin: '0 auto',
                            }}>
                                {teams.map(team => (
                                    <div
                                        key={team.id}
                                        onClick={() => handleViewRoster(team)}
                                        style={{
                                            background: 'white', borderRadius: 18,
                                            overflow: 'hidden', cursor: 'pointer',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                            border: '1px solid #e2e8f0',
                                            transition: 'transform 0.15s, box-shadow 0.15s',
                                            display: 'flex', flexDirection: 'column',
                                        }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.transform = 'translateY(-3px)';
                                            e.currentTarget.style.boxShadow = '0 10px 24px rgba(0,0,0,0.12)';
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
                                        }}
                                    >
                                        {/* Área del logo */}
                                        <div style={{
                                            background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
                                            padding: '20px 16px',
                                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                                            minHeight: 100,
                                        }}>
                                            <div style={{
                                                width: 80, height: 80, borderRadius: '50%',
                                                background: 'white',
                                                border: '3px solid #e2e8f0',
                                                boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                                                overflow: 'hidden', flexShrink: 0,
                                            }}>
                                                <img
                                                    src={team.logoUrl || DEFAULT_LOGO}
                                                    alt={team.nombre}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    onError={e => { e.currentTarget.src = DEFAULT_LOGO; }}
                                                />
                                            </div>
                                        </div>

                                        {/* Nombre y grupo */}
                                        <div style={{
                                            padding: '10px 12px 12px',
                                            borderTop: '1px solid #f1f5f9',
                                        }}>
                                            <div style={{
                                                fontWeight: 900, color: '#1e293b',
                                                fontSize: '0.8rem', textTransform: 'uppercase',
                                                lineHeight: 1.2, marginBottom: 5,
                                                textAlign: 'center',
                                            }}>
                                                {team.nombre}
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                                                {team.grupo && (
                                                    <span style={{
                                                        fontSize: '0.55rem', background: '#eff6ff',
                                                        color: '#1e3a8a', padding: '2px 8px',
                                                        borderRadius: 10, fontWeight: 800,
                                                    }}>
                                                        GRUPO {team.grupo}
                                                    </span>
                                                )}
                                                <span style={{
                                                    fontSize: '0.55rem', background: '#f0fdf4',
                                                    color: '#16a34a', padding: '2px 8px',
                                                    borderRadius: 10, fontWeight: 800,
                                                }}>
                                                    VER PLANTEL
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>

                ) : (
                    // ── Roster del equipo ──
                    <div style={{ maxWidth: 520, margin: '0 auto' }}>

                        {/* Banner equipo */}
                        <div style={{
                            background: 'white', borderRadius: 16, marginBottom: 14,
                            padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
                            border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                        }}>
                            <div style={{
                                width: 56, height: 56, borderRadius: '50%',
                                border: '2.5px solid #e2e8f0', overflow: 'hidden',
                                flexShrink: 0, background: 'white',
                            }}>
                                <img
                                    src={selectedTeam?.logoUrl || DEFAULT_LOGO}
                                    alt={selectedTeam?.nombre}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={e => { e.currentTarget.src = DEFAULT_LOGO; }}
                                />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, color: '#1e3a8a', textTransform: 'uppercase', fontSize: '1rem', fontWeight: 900 }}>
                                    {selectedTeam?.nombre}
                                </h3>
                                <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 700 }}>
                                    {roster.length} JUGADOR{roster.length !== 1 ? 'ES' : ''} REGISTRADO{roster.length !== 1 ? 'S' : ''}
                                </span>
                                {selectedTeam?.entrenador && (
                                    <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: 2 }}>
                                        DT: {selectedTeam.entrenador}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Lista de jugadores */}
                        <div style={{
                            background: 'white', borderRadius: 16,
                            border: '1px solid #e2e8f0', overflow: 'hidden',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                        }}>
                            {roster.length === 0 ? (
                                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: 8 }}>🏀</div>
                                    <p style={{ margin: 0, fontWeight: 700 }}>Sin jugadores registrados</p>
                                </div>
                            ) : (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, 1fr)',
                                    gap: 1, background: '#f1f5f9',
                                }}>
                                    {roster.map(p => (
                                        <div
                                            key={p.id}
                                            onClick={() => setSelectedPlayer(p)}
                                            style={{
                                                background: 'white', cursor: 'pointer',
                                                display: 'flex', flexDirection: 'column',
                                                alignItems: 'center',
                                                padding: '14px 8px 10px',
                                                gap: 8, transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
                                        >
                                            {/* Foto grande */}
                                            <Avatar player={p} size={80} />

                                            {/* Dorsal */}
                                            <div style={{
                                                background: '#1e3a8a', color: 'white',
                                                borderRadius: 6, padding: '2px 10px',
                                                fontWeight: 900, fontSize: '0.75rem',
                                            }}>
                                                #{p.numero ?? '—'}
                                            </div>

                                            {/* Nombre */}
                                            <span style={{
                                                fontWeight: 800, fontSize: '0.62rem',
                                                color: '#1e293b', textTransform: 'uppercase',
                                                textAlign: 'center', lineHeight: 1.2,
                                                wordBreak: 'break-word',
                                            }}>
                                                {p.nombre}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <p style={{ textAlign: 'center', fontSize: '0.6rem', color: '#94a3b8', marginTop: 12 }}>
                            Toca cualquier jugador para ver su barajita con estadísticas
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeamsPublicViewer;