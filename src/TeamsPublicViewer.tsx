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
const playerColor = (nombre: string) => {
    const palette = ['#1e3a8a','#0369a1','#065f46','#7c2d12','#4c1d95','#831843','#92400e'];
    return palette[nombre.split('').reduce((a,ch) => a + ch.charCodeAt(0), 0) % palette.length];
};

const PlayerCard: React.FC<{ player: Player; team: Team; onClose: () => void }> = ({
    player, team, onClose,
}) => {
    const pj   = player.partidosJugados || 1;
    const noPJ = !player.partidosJugados;
    const [sharing, setSharing] = useState(false);
    const accentColor = playerColor(player.nombre);

    const stats = [
        { label: 'PTS', icon: '🔥', color: '#ef4444', total: player.puntos  || 0 },
        { label: 'REB', icon: '🖐️', color: '#10b981', total: player.rebotes || 0 },
        { label: 'ROB', icon: '🛡️', color: '#6366f1', total: player.robos   || 0 },
        { label: '3PT', icon: '🏹', color: '#8b5cf6', total: player.triples || 0 },
    ].map(s => ({ ...s, avg: noPJ ? '—' : (s.total / pj).toFixed(1) }));

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
            const W = 540, H = 760;
            const canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            const ctx = canvas.getContext('2d')!;

            // ── Fondo oscuro premium ──
            const bgGrad = ctx.createLinearGradient(0, 0, W, H);
            bgGrad.addColorStop(0, '#080c18');
            bgGrad.addColorStop(0.5, '#0f1729');
            bgGrad.addColorStop(1, '#050a12');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, W, H);

            // Brillo lateral izquierdo
            const shine = ctx.createLinearGradient(0, 0, W * 0.6, 0);
            shine.addColorStop(0, accentColor + '18');
            shine.addColorStop(1, 'transparent');
            ctx.fillStyle = shine;
            ctx.fillRect(0, 0, W, H);

            // Patrón diagonal sutil
            ctx.strokeStyle = 'rgba(255,255,255,0.018)';
            ctx.lineWidth = 1;
            for (let i = -H; i < W + H; i += 28) {
                ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
            }

            // ── Franja superior de color ──
            const topGrad = ctx.createLinearGradient(0, 0, W, 0);
            topGrad.addColorStop(0, accentColor);
            topGrad.addColorStop(0.6, accentColor + 'aa');
            topGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = topGrad;
            ctx.fillRect(0, 0, W, 6);

            // ── Foto del jugador ──
            let photoDrawn = false;
            if (player.fotoUrl) {
                try {
                    const foto = await loadImage(player.fotoUrl);
                    // Foto ocupa zona superior, con fade al fondo
                    const fh = H * 0.58;
                    const fw = (foto.naturalWidth / foto.naturalHeight) * fh;
                    const fx = (W - fw) / 2;
                    const fy = 0;
                    ctx.save();
                    // Fade bottom de la foto
                    const fadeGrad = ctx.createLinearGradient(0, fy + fh * 0.5, 0, fy + fh);
                    fadeGrad.addColorStop(0, 'rgba(8,12,24,0)');
                    fadeGrad.addColorStop(1, 'rgba(8,12,24,1)');
                    ctx.drawImage(foto, fx, fy, fw, fh);
                    ctx.fillStyle = fadeGrad;
                    ctx.fillRect(0, fy, W, fh);
                    ctx.restore();
                    photoDrawn = true;
                } catch(_) {}
            }

            if (!photoDrawn) {
                // Círculo con inicial si no hay foto
                const cx = W / 2, cy = 200, r = 120;
                const circGrad = ctx.createRadialGradient(cx, cy-20, 0, cx, cy, r);
                circGrad.addColorStop(0, accentColor + 'cc');
                circGrad.addColorStop(1, accentColor + '33');
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fillStyle = circGrad; ctx.fill();
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.strokeStyle = accentColor + '66'; ctx.lineWidth = 2; ctx.stroke();
                ctx.font = 'bold 110px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText((player.nombre || '?').charAt(0).toUpperCase(), cx, cy);
            }

            // ── Número gigante decorativo ──
            if (player.numero != null) {
                ctx.save();
                ctx.font = `bold 260px system-ui`;
                ctx.fillStyle = 'rgba(255,255,255,0.04)';
                ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
                ctx.fillText(String(player.numero), W - 10, H * 0.62 + 20);
                ctx.restore();
            }

            // ── Badge dorsal ──
            const badgeY = H * 0.55;
            if (player.numero != null) {
                ctx.save();
                ctx.shadowColor = accentColor + '88'; ctx.shadowBlur = 18;
                ctx.beginPath();
                ctx.roundRect(W/2 - 40, badgeY - 16, 80, 32, 16);
                ctx.fillStyle = accentColor; ctx.fill();
                ctx.restore();
                ctx.font = 'bold 14px system-ui'; ctx.fillStyle = 'white';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('#' + String(player.numero), W/2, badgeY);
            }

            // ── Nombre ──
            const nameY = H * 0.62;
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 20;
            ctx.font = 'bold 38px system-ui'; ctx.fillStyle = 'white';
            ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            const nombre = player.nombre.toUpperCase();
            ctx.fillText(nombre, W/2, nameY);
            ctx.restore();

            // ── Equipo ──
            ctx.font = '600 15px system-ui';
            ctx.fillStyle = accentColor + 'cc';
            ctx.fillText(team.nombre.toUpperCase(), W/2, nameY + 24);

            // ── Línea divisoria con brillo ──
            const lineY = nameY + 38;
            const lineGrad = ctx.createLinearGradient(40, 0, W-40, 0);
            lineGrad.addColorStop(0, 'transparent');
            lineGrad.addColorStop(0.3, accentColor + 'aa');
            lineGrad.addColorStop(0.5, 'white');
            lineGrad.addColorStop(0.7, accentColor + 'aa');
            lineGrad.addColorStop(1, 'transparent');
            ctx.strokeStyle = lineGrad; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(40, lineY); ctx.lineTo(W-40, lineY); ctx.stroke();

            // ── Panel de stats ──
            const panelY = lineY + 14;
            const colW = (W - 40) / 4;
            const cardH = 118;

            stats.forEach((s, i) => {
                const cx = 20 + colW * i + colW / 2;
                const cx2 = 20 + colW * i + 3;

                // Card fondo glass
                ctx.save();
                ctx.shadowColor = s.color + '33'; ctx.shadowBlur = 12;
                ctx.beginPath(); ctx.roundRect(cx2, panelY, colW - 6, cardH, 10);
                ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
                ctx.strokeStyle = s.color + '44'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.roundRect(cx2, panelY, colW - 6, cardH, 10); ctx.stroke();
                ctx.restore();

                // Acento superior
                ctx.beginPath(); ctx.roundRect(cx2, panelY, colW - 6, 3, [10,10,0,0]);
                ctx.fillStyle = s.color; ctx.fill();

                // Icono
                ctx.font = '18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(s.icon, cx, panelY + 22);

                // Total
                ctx.save();
                ctx.shadowColor = s.color + '88'; ctx.shadowBlur = 10;
                ctx.font = 'bold 34px system-ui'; ctx.fillStyle = 'white';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(String(s.total), cx, panelY + 70);
                ctx.restore();

                // Avg
                ctx.font = '500 11px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText(s.avg + '/PJ', cx, panelY + 86);

                // Label
                ctx.font = 'bold 11px system-ui'; ctx.fillStyle = s.color;
                ctx.fillText(s.label, cx, panelY + 104);
            });

            // ── Logo liga ──
            const logoY = panelY + cardH + 18;
            try {
                const logo = await loadImage(LEAGUE_LOGO);
                const lr = 26;
                ctx.save();
                ctx.beginPath(); ctx.arc(W/2, logoY + lr, lr, 0, Math.PI * 2);
                ctx.fillStyle = 'white'; ctx.fill(); ctx.clip();
                const lh = lr * 2;
                const lw2 = (logo.naturalWidth / logo.naturalHeight) * lh;
                ctx.drawImage(logo, W/2 - lw2/2, logoY, lw2, lh);
                ctx.restore();
                ctx.beginPath(); ctx.arc(W/2, logoY + lr, lr, 0, Math.PI * 2);
                ctx.strokeStyle = accentColor + '99'; ctx.lineWidth = 1.5; ctx.stroke();
            } catch(_) {}

            // Watermark
            ctx.font = '500 11px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            ctx.fillText('LIGA METROPOLITANA EJE ESTE', W/2, H - 8);

            // ── Compartir ──
            canvas.toBlob(async (blob) => {
                if (!blob) return;
                const file = new File([blob], `${player.nombre.replace(/ /g,'_')}.png`, { type: 'image/png' });
                try {
                    if (navigator.share && navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: player.nombre });
                    } else {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = file.name; a.click();
                        URL.revokeObjectURL(url);
                    }
                } catch(_) {}
            }, 'image/png');
        } catch(e) { console.error(e); } finally { setSharing(false); }
    };

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, zIndex: 5000,
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
            <div onClick={e => e.stopPropagation()} style={{
                width: '100%', maxWidth: 320,
                borderRadius: 20, overflow: 'hidden',
                boxShadow: `0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px ${accentColor}44`,
                fontFamily: "'Inter','Segoe UI',sans-serif",
                background: '#080c18',
                position: 'relative',
            }}>
                {/* Franja color top */}
                <div style={{ height: 4, background: `linear-gradient(90deg, ${accentColor}, ${accentColor}44, transparent)` }} />

                {/* Foto / zona superior */}
                <div style={{
                    position: 'relative', height: 320, overflow: 'hidden',
                    background: `linear-gradient(160deg, ${accentColor}22, #080c18)`,
                }}>
                    {/* Shine lateral */}
                    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 30% 50%, ${accentColor}15, transparent 70%)` }} />

                    {/* Número decorativo */}
                    {player.numero != null && (
                        <div style={{
                            position: 'absolute', right: -10, bottom: -20,
                            fontSize: '9rem', fontWeight: 900, lineHeight: 1,
                            color: 'rgba(255,255,255,0.05)', userSelect: 'none',
                            fontFamily: 'system-ui',
                        }}>
                            {player.numero}
                        </div>
                    )}

                    {/* Foto */}
                    {player.fotoUrl ? (
                        <img src={player.fotoUrl} alt={player.nombre}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center center' }}
                            onError={e => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                        <div style={{
                            position: 'absolute', inset: 0, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            <div style={{
                                width: 110, height: 110, borderRadius: '50%',
                                background: `radial-gradient(circle, ${accentColor}cc, ${accentColor}44)`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                border: `2px solid ${accentColor}66`,
                                boxShadow: `0 0 40px ${accentColor}44`,
                                fontSize: '3.5rem', fontWeight: 900, color: 'white',
                            }}>
                                {(player.nombre || '?').charAt(0).toUpperCase()}
                            </div>
                        </div>
                    )}

                    {/* Fade bottom */}
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, background: 'linear-gradient(to top, #080c18, transparent)' }} />

                    {/* Botón cerrar */}
                    <button onClick={onClose} style={{
                        position: 'absolute', top: 10, right: 10,
                        background: 'rgba(0,0,0,0.5)', border: `1px solid rgba(255,255,255,0.15)`,
                        color: 'white', borderRadius: '50%', width: 30, height: 30,
                        cursor: 'pointer', fontSize: '0.85rem', fontWeight: 900,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        backdropFilter: 'blur(4px)',
                    }}>✕</button>

                    {/* Badge dorsal */}
                    {player.numero != null && (
                        <div style={{
                            position: 'absolute', top: 10, left: 10,
                            background: accentColor, color: 'white',
                            padding: '3px 12px', borderRadius: 20,
                            fontWeight: 900, fontSize: '0.75rem',
                            boxShadow: `0 4px 12px ${accentColor}66`,
                        }}>
                            #{player.numero}
                        </div>
                    )}
                </div>

                {/* Info + stats */}
                <div style={{ padding: '8px 12px 12px', background: '#080c18' }}>
                    {/* Nombre y equipo */}
                    <div style={{ textAlign: 'center', marginBottom: 12 }}>
                        <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'white', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {player.nombre}
                        </div>
                        <div style={{ fontSize: '0.6rem', fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: '1.5px', marginTop: 2 }}>
                            {team.nombre}
                        </div>

                    </div>

                    {/* Divider */}
                    <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${accentColor}66, transparent)`, marginBottom: 12 }} />

                    {/* Stats grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 10 }}>
                        {stats.map(s => (
                            <div key={s.label} style={{
                                background: 'rgba(255,255,255,0.04)',
                                border: `1px solid ${s.color}33`,
                                borderRadius: 10, padding: '6px 4px',
                                textAlign: 'center', position: 'relative', overflow: 'hidden',
                            }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: s.color, borderRadius: '10px 10px 0 0' }} />
                                <div style={{ fontSize: '0.9rem', marginBottom: 3 }}>{s.icon}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'white', lineHeight: 1, textShadow: `0 0 12px ${s.color}88` }}>{s.total}</div>
                                <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{s.avg}/PJ</div>
                                <div style={{ fontSize: '0.48rem', fontWeight: 900, color: s.color, letterSpacing: '0.5px', marginTop: 2 }}>{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Logo + compartir */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', border: `1px solid ${accentColor}44`, flexShrink: 0 }}>
                            <img src={LEAGUE_LOGO} alt="Liga" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <button onClick={compartirBarajita} disabled={sharing} style={{
                            flex: 1, padding: '11px 0', borderRadius: 12, border: 'none',
                            background: sharing ? '#1e293b' : `linear-gradient(90deg, ${accentColor}, ${accentColor}bb)`,
                            color: sharing ? '#64748b' : 'white',
                            fontWeight: 900, fontSize: '0.78rem', cursor: sharing ? 'default' : 'pointer',
                            boxShadow: sharing ? 'none' : `0 4px 16px ${accentColor}55`,
                            transition: 'all 0.2s',
                        }}>
                            {sharing ? '⏳ Generando...' : '📤 COMPARTIR BARAJITA'}
                        </button>
                    </div>
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
    categoria: string;          // ← recibe la categoría activa del dashboard
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
            position: 'fixed', inset: 0, zIndex: 1000,
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