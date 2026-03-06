import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const LEAGUE_LOGO     = 'https://i.postimg.cc/hhF5fTPn/image.png';
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

    const stats = [
        { label: 'PTS', icon: '🔥', color: '#ef4444', total: player.puntos  || 0 },
        { label: 'REB', icon: '🖐️', color: '#10b981', total: player.rebotes || 0 },
        { label: 'ROB', icon: '🛡️', color: '#6366f1', total: player.robos   || 0 },
        { label: '3PT', icon: '🏹', color: '#8b5cf6', total: player.triples || 0 },
    ].map(s => ({
        ...s,
        avg: noPJ ? '—' : (s.total / pj).toFixed(1),
    }));

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

                    {/* Logo del equipo en círculo */}
                    <div style={{
                        width: 40, height: 40, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.15)',
                        border: '2px solid rgba(255,255,255,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden', marginBottom: 12, flexShrink: 0,
                    }}>
                        <img
                            src={team.logoUrl || DEFAULT_LOGO}
                            alt={team.nombre}
                            style={{ width: 30, height: 30, objectFit: 'contain' }}
                            onError={e => { e.currentTarget.src = DEFAULT_LOGO; }}
                        />
                    </div>

                    {/* Foto del jugador grande */}
                    <Avatar player={player} size={100} />

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
                background: '#1e3a8a', color: 'white',
                padding: '14px 18px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                        onClick={view === 'roster' ? () => setView('list') : onClose}
                        style={{
                            background: 'rgba(255,255,255,0.15)', border: 'none',
                            color: 'white', borderRadius: '50%',
                            width: 34, height: 34, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '1.1rem', fontWeight: 900,
                        }}
                    >
                        {view === 'roster' ? '←' : '✕'}
                    </button>
                    <div>
                        <div style={{ fontWeight: 900, fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {view === 'list' ? `Equipos · ${categoria}` : selectedTeam?.nombre}
                        </div>
                        {view === 'roster' && (
                            <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>
                                Toca un jugador para ver su barajita
                            </div>
                        )}
                    </div>
                </div>
                <img src={LEAGUE_LOGO} style={{ height: 32, opacity: 0.9 }} alt="Liga" />
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
                                                width: 72, height: 72, borderRadius: '50%',
                                                background: 'white',
                                                border: '2px solid #e2e8f0',
                                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                overflow: 'hidden', flexShrink: 0,
                                            }}>
                                                <img
                                                    src={team.logoUrl || DEFAULT_LOGO}
                                                    alt={team.nombre}
                                                    style={{ width: 58, height: 58, objectFit: 'contain' }}
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
                            <img
                                src={selectedTeam?.logoUrl || DEFAULT_LOGO}
                                alt={selectedTeam?.nombre}
                                style={{ width: 54, height: 54, objectFit: 'contain', flexShrink: 0 }}
                                onError={e => { e.currentTarget.src = DEFAULT_LOGO; }}
                            />
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
                            ) : roster.map((p, i) => (
                                <div
                                    key={p.id}
                                    onClick={() => setSelectedPlayer(p)}
                                    style={{
                                        padding: '10px 16px',
                                        borderBottom: i !== roster.length - 1 ? '1px solid #f1f5f9' : 'none',
                                        display: 'flex', alignItems: 'center', gap: 12,
                                        cursor: 'pointer', transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                >
                                    {/* Foto */}
                                    <Avatar player={p} size={44} />

                                    {/* Dorsal */}
                                    <div style={{
                                        width: 30, height: 30, borderRadius: 8,
                                        background: '#eff6ff', flexShrink: 0,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <span style={{ fontWeight: 900, fontSize: '0.8rem', color: '#1e3a8a' }}>
                                            {p.numero ?? '—'}
                                        </span>
                                    </div>

                                    {/* Nombre */}
                                    <span style={{
                                        flex: 1, fontWeight: 700, fontSize: '0.88rem',
                                        color: '#1e293b', textTransform: 'uppercase',
                                    }}>
                                        {p.nombre}
                                    </span>

                                    {/* Flecha */}
                                    <span style={{ color: '#cbd5e1', fontSize: '0.8rem', flexShrink: 0 }}>›</span>
                                </div>
                            ))}
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