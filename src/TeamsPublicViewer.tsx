import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const LEAGUE_LOGO     = '/logo-liga.jpg';
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

const PlayerCard: React.FC<{ player: Player; team: Team; categoria: string; onClose: () => void }> = ({
    player, team, categoria, onClose,
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
            // ═══════════════════════════════════════════════════════
            //  BARAJITA ESTILO UPPER DECK — bordes dorados
            //  Lienzo 540x820: marco dorado, cabecera con 2 logos,
            //  foto, placa de nombre dorada, 4 stats, pie de colección.
            // ═══════════════════════════════════════════════════════
            const W = 540, H = 820;
            const canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            const ctx = canvas.getContext('2d')!;

            const GOLD       = '#d4af37';
            const GOLD_LIGHT = '#f0d060';
            const GOLD_DARK  = '#b8860b';
            const NAVY       = '#0f1729';
            const NAVY_DEEP  = '#080c18';

            const rr = (x: number, y: number, w: number, h: number, r: number | number[]) => {
                ctx.beginPath(); ctx.roundRect(x, y, w, h, r as any);
            };

            // ── Marco dorado exterior ──
            ctx.fillStyle = GOLD_DARK;
            rr(0, 0, W, H, 26); ctx.fill();

            // ── Carta interior ──
            const M = 10;               // grosor del borde dorado
            const cardX = M, cardY = M, cardW = W - M * 2, cardH = H - M * 2;
            ctx.fillStyle = NAVY_DEEP;
            rr(cardX, cardY, cardW, cardH, 18); ctx.fill();
            ctx.strokeStyle = GOLD_LIGHT; ctx.lineWidth = 2;
            rr(cardX + 1, cardY + 1, cardW - 2, cardH - 2, 17); ctx.stroke();

            // ── CABECERA ──
            const headH = 84;
            ctx.fillStyle = '#0a0f1e';
            ctx.save();
            rr(cardX, cardY, cardW, headH + 18, 17); ctx.clip();
            ctx.fillRect(cardX, cardY, cardW, headH);
            ctx.restore();
            // línea dorada bajo la cabecera
            ctx.strokeStyle = GOLD_DARK; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(cardX, cardY + headH); ctx.lineTo(cardX + cardW, cardY + headH); ctx.stroke();

            // logo redondo con aro dorado
            const drawLogoCircle = async (url: string | undefined, cx: number, cy: number, r: number, fallbackBg: string, fallbackTxt: string) => {
                ctx.save();
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fillStyle = fallbackBg; ctx.fill();
                let drawn = false;
                if (url) {
                    try {
                        const img = await loadImage(url);
                        ctx.save();
                        ctx.beginPath(); ctx.arc(cx, cy, r - 3, 0, Math.PI * 2); ctx.clip();
                        const s = (r - 3) * 2;
                        const ratio = Math.max(s / img.naturalWidth, s / img.naturalHeight);
                        const iw = img.naturalWidth * ratio, ih = img.naturalHeight * ratio;
                        ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih);
                        ctx.restore();
                        drawn = true;
                    } catch (_) {}
                }
                if (!drawn) {
                    ctx.fillStyle = 'rgba(255,255,255,0.92)';
                    ctx.font = `bold ${Math.round(r * 0.7)}px system-ui`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(fallbackTxt, cx, cy + 1);
                }
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5; ctx.stroke();
                ctx.restore();
            };

            const headCY = cardY + headH / 2;
            const teamInitials = (team.nombre || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();
            await drawLogoCircle(LEAGUE_LOGO, cardX + 34, headCY, 24, '#f8fafc', 'LM');
            await drawLogoCircle(team.logoUrl, cardX + cardW - 34, headCY, 24, '#1e3a8a', teamInitials);

            // título centrado
            ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = GOLD_LIGHT;
            ctx.font = '500 17px system-ui';
            const espaciar = (t: string, ls: number, y: number, cx: number) => {
                const widths = t.split('').map(c => ctx.measureText(c).width + ls);
                const total = widths.reduce((a, b) => a + b, 0) - ls;
                let x = cx - total / 2;
                for (let i = 0; i < t.length; i++) {
                    ctx.fillText(t[i], x + widths[i] / 2 - ls / 2, y);
                    x += widths[i];
                }
            };
            espaciar('LIGA METROPOLITANA', 3, headCY - 2, cardX + cardW / 2);
            ctx.fillStyle = '#8a97ad';
            ctx.font = '400 12px system-ui';
            espaciar('EJE ESTE', 6, headCY + 18, cardX + cardW / 2);

            // ── ZONA DE FOTO ──
            const photoY = cardY + headH;
            const photoH = 330;
            ctx.save();
            ctx.beginPath(); ctx.rect(cardX, photoY, cardW, photoH); ctx.clip();
            ctx.fillStyle = NAVY; ctx.fillRect(cardX, photoY, cardW, photoH);

            let photoDrawn = false;
            if (player.fotoUrl) {
                try {
                    const foto = await loadImage(player.fotoUrl);
                    const fh = photoH;
                    const fw = (foto.naturalWidth / foto.naturalHeight) * fh;
                    const fx = cardX + (cardW - fw) / 2;
                    ctx.drawImage(foto, fx, photoY, fw, fh);
                    photoDrawn = true;
                } catch (_) {}
            }
            if (!photoDrawn) {
                const cx = cardX + cardW / 2, cy = photoY + photoH * 0.42, r = 96;
                const g = ctx.createRadialGradient(cx, cy - 16, 0, cx, cy, r);
                g.addColorStop(0, accentColor + 'cc'); g.addColorStop(1, accentColor + '22');
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
                ctx.font = 'bold 96px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText((player.nombre || '?').charAt(0).toUpperCase(), cx, cy);
            }
            // fundido inferior de la foto hacia el fondo
            const fade = ctx.createLinearGradient(0, photoY + photoH * 0.55, 0, photoY + photoH);
            fade.addColorStop(0, 'rgba(8,12,24,0)');
            fade.addColorStop(1, NAVY_DEEP);
            ctx.fillStyle = fade; ctx.fillRect(cardX, photoY, cardW, photoH);

            // dorsal gigante en marca de agua
            if (player.numero != null) {
                ctx.font = 'bold 200px system-ui';
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
                ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
                ctx.fillText(String(player.numero), cardX + cardW - 12, photoY + photoH - 2);
            }
            ctx.restore();

            // ── PLACA DORADA DEL NOMBRE ──
            const plateY = photoY + photoH;
            const plateH = 58;
            ctx.fillStyle = GOLD;
            ctx.fillRect(cardX, plateY, cardW, plateH);

            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
            ctx.fillStyle = '#231603';
            ctx.font = '500 24px system-ui';
            let nombre = (player.nombre || '').toUpperCase();
            while (ctx.measureText(nombre).width > cardW - 120 && nombre.length > 4) {
                nombre = nombre.slice(0, -1);
            }
            if (nombre !== (player.nombre || '').toUpperCase()) nombre = nombre.trimEnd() + '…';
            ctx.fillText(nombre, cardX + 18, plateY + 30);

            ctx.fillStyle = '#6b4d10';
            ctx.font = '500 12px system-ui';
            const sub = `${team.nombre.toUpperCase()} · ${categoria.toUpperCase()}`;
            ctx.fillText(sub, cardX + 18, plateY + 48);

            // badge dorsal a la derecha de la placa
            if (player.numero != null) {
                const bw = 54, bh = 30, bx = cardX + cardW - bw - 16, by = plateY + plateH / 2 - bh / 2;
                ctx.fillStyle = '#231603';
                rr(bx, by, bw, bh, 8); ctx.fill();
                ctx.fillStyle = GOLD_LIGHT;
                ctx.font = '500 15px system-ui';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('#' + player.numero, bx + bw / 2, by + bh / 2 + 1);
            }

            // ── PANEL DE STATS (4 celdas, borde superior dorado) ──
            const statsY = plateY + plateH + 14;
            const pad = 16, gap = 8;
            const colW = (cardW - pad * 2 - gap * 3) / 4;
            const cellH = 92;
            ctx.textAlign = 'center';
            stats.forEach((s, i) => {
                const x = cardX + pad + i * (colW + gap);
                ctx.fillStyle = '#0d1526';
                rr(x, statsY, colW, cellH, 8); ctx.fill();
                ctx.strokeStyle = GOLD_DARK + '55'; ctx.lineWidth = 1;
                rr(x + 0.5, statsY + 0.5, colW - 1, cellH - 1, 8); ctx.stroke();
                // acento dorado superior
                ctx.fillStyle = GOLD;
                rr(x, statsY, colW, 3, [8, 8, 0, 0]); ctx.fill();

                const cx = x + colW / 2;
                ctx.fillStyle = '#ffffff';
                ctx.font = '500 26px system-ui'; ctx.textBaseline = 'alphabetic';
                ctx.fillText(String(s.total), cx, statsY + 42);
                ctx.fillStyle = '#8a97ad';
                ctx.font = '400 11px system-ui';
                ctx.fillText(s.avg === '—' ? '—' : s.avg + '/PJ', cx, statsY + 60);
                ctx.fillStyle = GOLD_LIGHT;
                ctx.font = '500 12px system-ui';
                ctx.fillText(s.label, cx, statsY + 80);
            });

            // ── PIE DE COLECCIÓN ──
            const footY = statsY + cellH + 22;
            ctx.strokeStyle = GOLD_DARK + '44'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cardX + 16, footY - 10); ctx.lineTo(cardX + cardW - 16, footY - 10); ctx.stroke();

            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#5b6b85';
            ctx.font = '500 11px system-ui';
            ctx.textAlign = 'left';
            ctx.save();
            ctx.letterSpacing = '2px';
            ctx.fillText('EDICIÓN OFICIAL', cardX + 16, footY);
            ctx.restore();
            ctx.textAlign = 'right';
            ctx.fillStyle = GOLD_LIGHT;
            const cardNo = 'N° ' + String((player.numero ?? 0)).padStart(3, '0');
            ctx.fillText(cardNo, cardX + cardW - 16, footY);

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
            minHeight: '100vh',
            background: '#f0f4f8',
            fontFamily: "'Inter','Segoe UI',sans-serif",
        }}>
            {/* Barajita del jugador */}
            {selectedPlayer && selectedTeam && (
                <PlayerCard
                    player={selectedPlayer}
                    team={selectedTeam}
                    categoria={categoria}
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
            <div style={{ padding: '16px 14px 100px' }}>

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
