import { useEffect, useState, useRef, memo, lazy, Suspense } from 'react';
import './App.css';
import { db, auth } from './firebase';
import { doc, onSnapshot, collection, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';

// Componentes que cargan siempre (críticos)
import Login    from './Login';
import NewsFeed from './NewsFeed';
import { useNotifications } from './useNotifications';

// Componentes lazy — solo cargan cuando el usuario los abre
const AdminEquipos      = lazy(() => import('./AdminEquipos'));
const TeamsPublicViewer = lazy(() => import('./TeamsPublicViewer'));
const CalendarViewer    = lazy(() => import('./CalendarViewer'));
const MesaTecnica       = lazy(() => import('./MesaTecnica'));
const StatsViewer       = lazy(() => import('./StatsViewer'));
const StandingsViewer   = lazy(() => import('./StandingsViewer'));
const NewsAdmin         = lazy(() => import('./NewsAdmin'));
const PlayoffViewer     = lazy(() => import('./PlayoffViewer'));
const AdminVideos       = lazy(() => import('./AdminVideos'));
const ResetTemporada    = lazy(() => import('./ResetTemporada'));

// Spinner de carga mientras se descarga el componente
const PageLoader = () => (
    <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 200, flexDirection: 'column', gap: 12,
    }}>
        <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: '4px solid #e2e8f0', borderTop: '4px solid #1e3a8a',
            animation: 'spin 0.7s linear infinite',
        }} />
        <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700 }}>Cargando...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
);

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────

const CATEGORIAS_DISPONIBLES = [
    { id: 'MASTER40',        label: '🍷 MASTER 40'       },
    { id: 'LIBRE',           label: '🏀 LIBRE'           },
    { id: 'INTERINDUSTRIAL', label: '🏭 INTERINDUSTRIAL'  },
    { id: 'U16_FEMENINO',    label: '🏀 U16 FEMENINO'    },
    { id: 'U16M',            label: '🏀 U16M'            },
];

const DEFAULT_LOGO = 'https://cdn-icons-png.flaticon.com/512/15568/15568903.png';

const getColName = (base: string, cat: string) =>
    cat === 'MASTER40' ? base : `${base}_${cat}`;

// ─────────────────────────────────────────────
// HELPER: ORDENAMIENTO FIBA CORRECTO
// Bug original: tiedIds se recalculaba dentro del comparador de .sort()
// causando que el grupo de empatados cambiara a mitad de la ordenación.
// Fix: resolver empates ANTES de ordenar, una vez por grupo.
// ─────────────────────────────────────────────
const resolverEmpate = (teams: any[], matchesRegulares: any[]): any[] => {
    if (teams.length <= 1) return teams;

    // Ordenar por puntos totales primero
    const sorted = [...teams].sort((a, b) => b.puntos - a.puntos);
    const result: any[] = [];
    let i = 0;

    while (i < sorted.length) {
        // Detectar grupo empatado en puntos
        let j = i + 1;
        while (j < sorted.length && sorted[j].puntos === sorted[i].puntos) j++;
        const grupo = sorted.slice(i, j);

        if (grupo.length === 1) {
            result.push(grupo[0]);
        } else {
            // Partidos H2H calculados UNA SOLA VEZ para este grupo
            const ids = new Set(grupo.map((t: any) => t.id));
            const h2h = matchesRegulares.filter((m: any) =>
                ids.has(m.equipoLocalId) && ids.has(m.equipoVisitanteId)
            );

            const calcH2H = (id: string) => {
                let pts = 0, pf = 0, pc = 0;
                h2h.forEach((m: any) => {
                    if (m.equipoLocalId === id) {
                        pf += m.marcadorLocal; pc += m.marcadorVisitante;
                        pts += m.marcadorLocal > m.marcadorVisitante ? 2 : 1;
                    } else if (m.equipoVisitanteId === id) {
                        pf += m.marcadorVisitante; pc += m.marcadorLocal;
                        pts += m.marcadorVisitante > m.marcadorLocal ? 2 : 1;
                    }
                });
                return { pts, dif: pf - pc, pf };
            };

            const conH2H = grupo.map((t: any) => ({ ...t, _h2h: calcH2H(t.id) }));

            // FIBA Appendix D: criterios 1 → 2 → 3 → 4
            const resuelto = conH2H.sort((a: any, b: any) => {
                // 1. Récord H2H (puntos: 2=victoria, 1=derrota)
                if (b._h2h.pts !== a._h2h.pts) return b._h2h.pts - a._h2h.pts;
                // 2. Diferencia de puntos en H2H
                if (b._h2h.dif !== a._h2h.dif) return b._h2h.dif - a._h2h.dif;
                // 3. Puntos anotados en H2H
                if (b._h2h.pf !== a._h2h.pf) return b._h2h.pf - a._h2h.pf;
                // 4. Diferencia de puntos global (toda la fase regular)
                const difA = a.puntos_favor - a.puntos_contra;
                const difB = b.puntos_favor - b.puntos_contra;
                return difB - difA;
            });

            result.push(...resuelto.map(({ _h2h, ...t }: any) => t));
        }
        i = j;
    }
    return result;
};

// ─────────────────────────────────────────────
// COMPONENTE: Tabla resumen del dashboard
// ─────────────────────────────────────────────
const RenderTableSummary = memo(({ title, data, color }: {
    title: string; data: any[]; color: string;
}) => (
    <div className="fade-in" style={{
        width: '100%', background: 'white', borderRadius: 24,
        overflow: 'hidden', boxShadow: '0 8px 20px rgba(0,0,0,0.06)',
        border: `2.5px solid ${color}`,
    }}>
        <div style={{ background: color, padding: 10, textAlign: 'center' }}>
            <h4 style={{ fontSize: '0.7rem', color: 'white', margin: 0, fontWeight: 900, textTransform: 'uppercase' }}>
                {title}
            </h4>
        </div>
        <div style={{ padding: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                <thead>
                    <tr style={{ color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>
                        <th style={{ textAlign: 'left', paddingBottom: 5 }}>EQUIPO</th>
                        <th style={{ textAlign: 'center' }}>JG</th>
                        <th style={{ textAlign: 'center' }}>JP</th>
                        <th style={{ textAlign: 'center' }}>DIF</th>
                        <th style={{ textAlign: 'center', color }}>PTS</th>
                    </tr>
                </thead>
                <tbody>
                    {data.length > 0 ? data.slice(0, 4).map((eq) => {
                        const dif = (eq.puntos_favor || 0) - (eq.puntos_contra || 0);
                        return (
                            <tr key={eq.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                                <td style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{ width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', border: '1px solid #eee', background: 'white', flexShrink: 0 }}>
                                        <img
                                            src={eq.logoUrl || DEFAULT_LOGO}
                                            onError={(e) => { e.currentTarget.src = DEFAULT_LOGO; }}
                                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                            alt="L"
                                        />
                                    </div>
                                    <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.65rem' }}>
                                        {eq.nombre.toUpperCase()}
                                    </span>
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{eq.victorias || 0}</td>
                                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{eq.derrotas || 0}</td>
                                <td style={{ textAlign: 'center', fontWeight: 'bold', color: dif >= 0 ? '#3b82f6' : '#ef4444' }}>
                                    {dif > 0 ? `+${dif}` : dif}
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 900, color }}>{eq.puntos || 0}</td>
                            </tr>
                        );
                    }) : (
                        <tr>
                            <td colSpan={5} style={{ textAlign: 'center', padding: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                                Registrando equipos...
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
));

// ─────────────────────────────────────────────
// APP PRINCIPAL
// ─────────────────────────────────────────────
function App() {
    const [user, setUser]                           = useState<any>(null);
    const [categoriaActiva, setCategoriaActiva]     = useState('MASTER40');
    const [equiposA, setEquiposA]                   = useState<any[]>([]);
    const [equiposB, setEquiposB]                   = useState<any[]>([]);
    const [noticias, setNoticias]                   = useState<any[]>([]);
    const [entrevistas, setEntrevistas]             = useState<any[]>([]);
    const [entrevistasCargadas, setEntrevistasCargadas] = useState(false);
    const [videoSeleccionado, setVideoSeleccionado] = useState<any>(null);
    const [proximosJuegos, setProximosJuegos]       = useState<any[]>([]);
    const [resultadosRecientes, setResultadosRecientes] = useState<any[]>([]);
    const [teamLogos, setTeamLogos]                 = useState<Record<string, string>>({});
    const [allMatchesGlobal, setAllMatchesGlobal]   = useState<any[]>([]);
    const [loading, setLoading]                     = useState(true);
    const [activeView, setActiveView]               = useState('dashboard');
    const [showReset, setShowReset]                   = useState(false);

    const [noticiaIndex, setNoticiaIndex]   = useState(0);
    const [juegoIndex, setJuegoIndex]       = useState(0);
    const [tablaIndex, setTablaIndex]       = useState(0);
    const [leaderIndex, setLeaderIndex]     = useState(0);
    const [leadersList, setLeadersList]     = useState<any[]>([]);

    // Registrar token FCM para notificaciones push
    useNotifications(user?.uid);

    // Ref para cancelar fetchData si cambia categoría antes de terminar
    const fetchAbort = useRef<{ cancelled: boolean }>({ cancelled: false });

    const getGroupLabel = (grupo: string, cat: string) => {
        const g = (grupo || '').toUpperCase();
        const c = (cat  || '').toUpperCase();
        if (c === 'LIBRE') {
            if (g === 'A') return 'CONF. ESTE';
            if (g === 'B') return 'CONF. OESTE';
        }
        return `GRUPO ${g}`;
    };

    // ── Auth — sin activeView en las dependencias ──
    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            if (u) {
                onSnapshot(doc(db, 'usuarios', u.uid), (snap) => {
                    const data = snap.data();
                    setUser({
                        uid: u.uid,
                        email: u.email,
                        rol: (u.email === 'mdiazsalas7@gmail.com' || data?.rol === 'admin')
                            ? 'admin' : 'fan',
                    });
                });
            } else {
                setUser(null);
            }
            setLoading(false);
        });
        return () => unsub();
    }, []); // ← sin activeView: no re-suscribir al auth en cada cambio de pantalla

    // ── Carga de datos principal ──
    useEffect(() => {
        // Cancelar fetch anterior si cambia la categoría antes de terminar
        const abortToken = { cancelled: false };
        fetchAbort.current = abortToken;

        const fetchData = async () => {
            try {
                setLoading(true);
                setLeadersList([]);

                // 1. Equipos
                const colEquipos = getColName('equipos', categoriaActiva);
                const equiposSnap = await getDocs(collection(db, colEquipos));
                if (abortToken.cancelled) return;

                const logoMap: Record<string, string> = {};
                const equiposBase: any[] = [];

                equiposSnap.forEach(d => {
                    const data = d.data();
                    const n = data.nombre?.trim().toUpperCase();
                    if (!n) return;
                    logoMap[n] = data.logoUrl || DEFAULT_LOGO;
                    const esCatEspecifica = categoriaActiva !== 'MASTER40';
                    const pertenece = esCatEspecifica
                        ? true
                        : (!data.categoria || data.categoria === 'MASTER40');
                    if (pertenece) equiposBase.push({ id: d.id, ...data });
                });
                setTeamLogos(logoMap);

                // 2. Calendario completo
                const colCal = getColName('calendario', categoriaActiva);
                const calSnap = await getDocs(
                    query(collection(db, colCal), orderBy('fechaAsignada', 'asc'))
                );
                if (abortToken.cancelled) return;

                const allMatches: any[] = calSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                // FILTRO MAESTRO: solo fase regular finalizada
                const regularFinalizados = allMatches.filter(m => {
                    const fase = (m.fase || '').trim().toUpperCase();
                    return m.estatus === 'finalizado' && (fase === 'REGULAR' || fase === '');
                });
                const validRegularIds = new Set(regularFinalizados.map(m => m.id));
                setAllMatchesGlobal(allMatches);
                setResultadosRecientes([...regularFinalizados].reverse().slice(0, 5));

                // Próximos juegos
                const proximos = allMatches
                    .filter(m => m.estatus !== 'finalizado')
                    .sort((a, b) =>
                        (a.fechaAsignada || '').localeCompare(b.fechaAsignada || '') ||
                        (a.hora || '00:00').localeCompare(b.hora || '00:00')
                    )
                    .slice(0, 2);
                setProximosJuegos(proximos);

                // 3. Recalcular stats de equipos (solo con fase regular)
                const equiposConStats = equiposBase.map(eq => {
                    let victorias = 0, derrotas = 0, pf = 0, pc = 0, puntos = 0;
                    regularFinalizados.forEach(m => {
                        if (m.equipoLocalId === eq.id) {
                            pf += m.marcadorLocal; pc += m.marcadorVisitante;
                            if (m.marcadorLocal > m.marcadorVisitante) { victorias++; puntos += 2; }
                            else { derrotas++; puntos += 1; }
                        } else if (m.equipoVisitanteId === eq.id) {
                            pf += m.marcadorVisitante; pc += m.marcadorLocal;
                            if (m.marcadorVisitante > m.marcadorLocal) { victorias++; puntos += 2; }
                            else { derrotas++; puntos += 1; }
                        }
                    });
                    return { ...eq, victorias, derrotas, puntos, puntos_favor: pf, puntos_contra: pc };
                });

                // 4. Ordenamiento FIBA correcto (función separada, sin bug)
                const grupoA = equiposConStats.filter(e =>
                    e.grupo?.toUpperCase() === 'A' || e.grupo?.toUpperCase() === 'ÚNICO'
                );
                const grupoB = equiposConStats.filter(e => e.grupo?.toUpperCase() === 'B');

                setEquiposA(resolverEmpate(grupoA, regularFinalizados));
                setEquiposB(resolverEmpate(grupoB, regularFinalizados));

                // 5. Líderes del dashboard
                const teamGamesCount: Record<string, number> = {};
                regularFinalizados.forEach(g => {
                    const loc = g.equipoLocalNombre?.trim().toUpperCase();
                    const vis = g.equipoVisitanteNombre?.trim().toUpperCase();
                    if (loc) teamGamesCount[loc] = (teamGamesCount[loc] || 0) + 1;
                    if (vis) teamGamesCount[vis] = (teamGamesCount[vis] || 0) + 1;
                });

                // Fotos de jugadores para el card del líder
                const colJugadores = getColName('jugadores', categoriaActiva);
                const jugSnap = await getDocs(collection(db, colJugadores));
                if (abortToken.cancelled) return;
                const fotoMap: Record<string, string> = {};
                jugSnap.forEach(d => { if (d.data().fotoUrl) fotoMap[d.id] = d.data().fotoUrl; });

                const statsSnap = await getDocs(collection(db, 'stats_partido'));
                if (abortToken.cancelled) return;

                const aggregated: Record<string, any> = {};
                statsSnap.forEach(d => {
                    const stat = d.data();
                    const jId = stat.partidoId || stat.juegoId;
                    if (!jId || !validRegularIds.has(jId) || !stat.jugadorId) return;

                    const plyId = stat.jugadorId;
                    const eqKey = (stat.equipo || '').trim().toUpperCase();
                    if (!aggregated[plyId]) {
                        aggregated[plyId] = {
                            nombre: stat.nombre, equipo: eqKey,
                            pts: 0, reb: 0, rob: 0, tri: 0, blq: 0, pj: 0,
                            fotoUrl: fotoMap[plyId] || '',
                        };
                    }
                    const acc = aggregated[plyId];
                    acc.pts += (Number(stat.tirosLibres) || 0)
                        + (Number(stat.dobles) || 0) * 2
                        + (Number(stat.triples) || 0) * 3;
                    acc.reb += (Number(stat.rebotes)  || 0);
                    acc.rob += (Number(stat.robos)    || 0);
                    acc.tri += (Number(stat.triples)  || 0);
                    acc.blq += (Number(stat.bloqueos) || 0);
                    acc.pj  += 1;
                });

                const playerList = Object.values(aggregated).map((p: any) => {
                    const den = teamGamesCount[p.equipo] || p.pj || 1;
                    return {
                        ...p,
                        ppg:  parseFloat((p.pts / den).toFixed(1)),
                        rpg:  parseFloat((p.reb / den).toFixed(1)),
                        spg:  parseFloat((p.rob / den).toFixed(1)),
                        tpg:  parseFloat((p.tri / den).toFixed(1)),
                        bpg:  parseFloat((p.blq / den).toFixed(1)),
                    };
                });

                // Construir un líder por cada categoría estadística
                if (playerList.length > 0) {
                    const top = (key: string) => [...playerList].sort((a: any, b: any) => b[key] - a[key])[0];
                    const cats = [
                        { key: 'ppg',  label: 'PUNTOS',   unit: 'PPG', icon: '🔥', color: '#ef4444' },
                        { key: 'rpg',  label: 'REBOTES',  unit: 'RPG', icon: '🖐️', color: '#10b981' },
                        { key: 'spg',  label: 'ROBOS',    unit: 'RPG', icon: '🛡️', color: '#6366f1' },
                        { key: 'tpg',  label: 'TRIPLES',  unit: '3PG', icon: '🏹', color: '#8b5cf6' },
                        { key: 'bpg',  label: 'BLOQUEOS', unit: 'BPG', icon: '🚫', color: '#f43f5e' },
                    ];
                    const nuevosLideres: any[] = [];
                    cats.forEach(cat => {
                        const lider = top(cat.key);
                        if (lider && (lider[cat.key] as number) > 0) {
                            nuevosLideres.push({
                                label: cat.label, unit: cat.unit,
                                icon: cat.icon, color: cat.color,
                                p: lider, val: lider[cat.key],
                            });
                        }
                    });
                    setLeadersList(nuevosLideres);
                }

                // 6. Noticias y entrevistas
                const [newsSnap, interviewsSnap] = await Promise.all([
                    getDocs(query(collection(db, 'noticias'),    orderBy('fecha', 'desc'), limit(5))),
                    getDocs(query(collection(db, 'entrevistas'), limit(20))),
                ]);
                if (abortToken.cancelled) return;

                setNoticias(newsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                const todasEntrevistas = interviewsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                // Ordenar: los que tienen createdAt primero, luego por fecha string, tomar 5 más recientes
                todasEntrevistas.sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
                setEntrevistas(todasEntrevistas.slice(0, 5));
                setEntrevistasCargadas(true);

                setLoading(false);
            } catch (e) {
                if (!abortToken.cancelled) {
                    console.error(e);
                    setLoading(false);
                }
            }
        };

        fetchData();
        return () => { abortToken.cancelled = true; };
    }, [categoriaActiva]); // ← solo categoría, no activeView

    // ── Carrusel automático ──
    useEffect(() => {
        const itv = setInterval(() => {
            setNoticiaIndex(p => (p + 1) % (noticias.length   || 1));
            setJuegoIndex  (p => (p + 1) % (resultadosRecientes.length || 1));
            setTablaIndex  (p => (p + 1) % 2);
            setLeaderIndex (p => (p + 1) % (leadersList.length || 1));
        }, 6000);
        return () => clearInterval(itv);
    }, [noticias.length, resultadosRecientes.length, leadersList.length]);

    const isAdmin = user?.rol === 'admin';

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', color: '#1e293b', fontFamily: 'sans-serif', paddingBottom: 110 }}>

            {/* ── Header ── */}
            <header style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #1d4ed8 100%)',
                padding: '12px 15px 0',
                position: 'sticky', top: 0, zIndex: 1000,
                boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
            }}>
                {/* Fondo con textura sutil de puntos */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none',
                    backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
                    backgroundSize: '18px 18px',
                }} />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, position: 'relative', zIndex: 1 }}>

                    {/* Logo en circunferencia */}
                    <div
                        onClick={() => setActiveView('dashboard')}
                        style={{
                            flex: 1,
                            display: 'flex', alignItems: 'center',
                        }}
                    >
                    <div style={{
                            width: 54, height: 54, borderRadius: '50%', flexShrink: 0,
                            background: 'rgba(255,255,255,0.12)',
                            border: '2px solid rgba(255,255,255,0.35)',
                            boxShadow: '0 4px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            overflow: 'hidden', cursor: 'pointer',
                            backdropFilter: 'blur(4px)',
                        }}
                    >
                        <img
                            src="https://i.postimg.cc/FKgNmFpv/Whats_App_Image_2026_01_25_at_12_07_36_AM.jpg"
                            alt="Logo"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    </div>
                    </div>

                    {/* Nombre central */}
                    <div style={{ textAlign: 'center', flex: 2 }}>
                        <h1 style={{
                            fontSize: '0.9rem', fontWeight: 900, color: 'white',
                            margin: 0, textTransform: 'uppercase', letterSpacing: '1.5px',
                            textShadow: '0 2px 8px rgba(0,0,0,0.4)',
                        }}>
                            Liga Metropolitana
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 3 }}>
                            <div style={{ height: 1, width: 20, background: 'rgba(255,255,255,0.3)' }} />
                            <p style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.65)', margin: 0, fontWeight: 800, letterSpacing: 2 }}>
                                EJE ESTE • 2026
                            </p>
                            <div style={{ height: 1, width: 20, background: 'rgba(255,255,255,0.3)' }} />
                        </div>
                    </div>

                    {/* Botones reglamento + árbitro virtual */}
                    <div style={{ flex: 1, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                        <div style={{ display: 'flex', gap: 5 }}>
                            {/* Árbitro Virtual */}
                            <button
                                onClick={() => window.open('https://zona-fiba-app-2026.vercel.app/', '_blank')}
                                style={{
                                    background: 'rgba(255,255,255,0.12)',
                                    border: '1px solid rgba(255,255,255,0.25)',
                                    padding: '4px 6px', borderRadius: 10,
                                    display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                                    cursor: 'pointer', backdropFilter: 'blur(4px)',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                    gap: 2,
                                }}
                            >
                                <img
                                    src="/icon/arbitro-icon.png"
                                    alt="Árbitro"
                                    style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid rgba(255,255,255,0.3)' }}
                                    onError={e => { (e.target as HTMLImageElement).style.display='none'; }}
                                />
                                <span style={{ fontSize: '0.32rem', fontWeight: 900, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>ÁRBITRO</span>
                            </button>
                            {/* Reglamento */}
                            <button
                                onClick={() => window.open('https://firebasestorage.googleapis.com/v0/b/liga-de-san-mateo.firebasestorage.app/o/documentos%2FReglamento%20Interno%20Baloncesto%202026.pdf?alt=media&token=ee680a1c-b93d-4159-ae99-0aef67cb4703', '_blank')}
                                style={{
                                    background: 'rgba(255,255,255,0.12)',
                                    border: '1px solid rgba(255,255,255,0.25)',
                                    padding: '4px 6px', borderRadius: 10,
                                    display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                                    cursor: 'pointer', backdropFilter: 'blur(4px)',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                    gap: 2,
                                }}
                            >
                                <span style={{ fontSize: '1.1rem' }}>📜</span>
                                <span style={{ fontSize: '0.32rem', fontWeight: 900, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.8 }}>REGLAMENTO</span>
                            </button>
                        </div>
                        <div
                            onClick={() => setActiveView('login')}
                            style={{ fontSize: '0.7rem', opacity: 0.08, marginTop: 2, cursor: 'pointer', textAlign: 'right' }}
                        >🔑</div>
                    </div>
                </div>

                {/* Selector de categorías */}
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, position: 'relative', zIndex: 1 }} className="no-scrollbar">
                    {CATEGORIAS_DISPONIBLES.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setCategoriaActiva(cat.id)}
                            style={{
                                padding: '7px 14px', borderRadius: 20, border: 'none',
                                whiteSpace: 'nowrap',
                                background: categoriaActiva === cat.id
                                    ? 'rgba(255,255,255,1)'
                                    : 'rgba(255,255,255,0.12)',
                                color: categoriaActiva === cat.id ? '#1e3a8a' : 'rgba(255,255,255,0.75)',
                                fontSize: '0.65rem', fontWeight: 900, transition: '0.2s',
                                boxShadow: categoriaActiva === cat.id ? '0 3px 10px rgba(0,0,0,0.25)' : 'none',
                            }}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
            </header>

            {/* ── Contenido principal ── */}
            <main style={{ padding: 15, maxWidth: 500, margin: '0 auto' }}>
                <Suspense fallback={<PageLoader />}>
                {activeView === 'login' ? (
                    <div className="fade-in">
                        <Login />
                        <button
                            onClick={() => setActiveView('dashboard')}
                            style={{ width: '100%', marginTop: 20, background: 'none', border: 'none', color: '#94a3b8', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.7rem' }}
                        >
                            ← VOLVER
                        </button>
                    </div>
                ) : activeView === 'dashboard' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 25 }}>

                        {/* Resultados recientes */}
                        <section>
                            <h2 style={{ fontSize: '0.7rem', fontWeight: 900, color: '#1e3a8a', marginBottom: 10, textTransform: 'uppercase' }}>
                                🏀 Resultados Fase Regular {categoriaActiva}
                            </h2>
                            <div style={{ position: 'relative', height: 180, borderRadius: 24, overflow: 'hidden', boxShadow: '0 10px 30px rgba(30,58,138,0.12)' }}>
                                {resultadosRecientes.length > 0 ? (
                                    <div key={juegoIndex} className="fade-in" style={{ height: '100%', background: 'linear-gradient(135deg, #1e3a8a, #1e40af)', color: 'white', padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                                            {/* Local */}
                                            <div style={{ textAlign: 'center', flex: 1 }}>
                                                <img src={teamLogos[resultadosRecientes[juegoIndex].equipoLocalNombre?.trim().toUpperCase()] || DEFAULT_LOGO} onError={(e) => { e.currentTarget.src = DEFAULT_LOGO; }} style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: '50%', background: 'white' }} alt="" />
                                                <p style={{ fontSize: '0.55rem', fontWeight: 900, marginTop: 5 }}>{resultadosRecientes[juegoIndex].equipoLocalNombre}</p>
                                            </div>
                                            {/* Marcador */}
                                            <div style={{ textAlign: 'center', flex: 1 }}>
                                                <p style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0 }}>
                                                    {resultadosRecientes[juegoIndex].marcadorLocal} - {resultadosRecientes[juegoIndex].marcadorVisitante}
                                                </p>
                                            </div>
                                            {/* Visitante */}
                                            <div style={{ textAlign: 'center', flex: 1 }}>
                                                <img src={teamLogos[resultadosRecientes[juegoIndex].equipoVisitanteNombre?.trim().toUpperCase()] || DEFAULT_LOGO} onError={(e) => { e.currentTarget.src = DEFAULT_LOGO; }} style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: '50%', background: 'white' }} alt="" />
                                                <p style={{ fontSize: '0.55rem', fontWeight: 900, marginTop: 5 }}>{resultadosRecientes[juegoIndex].equipoVisitanteNombre}</p>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                            <button
                                                onClick={e => { e.stopPropagation(); window.open('https://www.youtube.com/@ligametropolitanadelejeeste', '_blank'); }}
                                                style={{ flex: 1, padding: '8px 6px', borderRadius: 12, border: 'none', background: '#ff0000', color: 'white', fontWeight: 900, fontSize: '0.55rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                                            >
                                                <img src="https://i.postimg.cc/XJ6rWrrL/image.png" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} alt="" />
                                                LIGA OFICIAL
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); window.open('https://www.tiktok.com/@barbakanzler', '_blank'); }}
                                                style={{ flex: 1, padding: '8px 6px', borderRadius: 12, border: 'none', background: '#010101', color: 'white', fontWeight: 900, fontSize: '0.55rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                                            >
                                                <img src="https://i.postimg.cc/RZ9XnGD5/channels4_profile.jpg" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} alt="" />
                                                @BARBAKANZLER
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ height: '100%', background: '#f8fafc', borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#94a3b8' }}>
                                        No hay resultados de fase regular aún
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* Noticias + Líder */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                            {/* Noticias */}
                            <div onClick={() => setActiveView('noticias')} style={{ height: 220, background: 'white', borderRadius: 24, border: '2.5px solid #1e3a8a', cursor: 'pointer', overflow: 'hidden', boxShadow: '0 8px 25px rgba(30,58,138,0.1)' }}>
                                <div style={{ background: '#1e3a8a', padding: '6px 12px' }}>
                                    <p style={{ fontSize: '0.6rem', fontWeight: 900, color: 'white', margin: 0, textAlign: 'center' }}>📢 PRENSA LIGA</p>
                                </div>
                                <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 5 }}>
                                    {noticias.length > 0 && (
                                        <img key={noticiaIndex} src={noticias[noticiaIndex].imageUrl} className="fade-in" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="" />
                                    )}
                                </div>
                                <p style={{ fontSize: '0.6rem', fontWeight: 800, padding: '8px 12px', textAlign: 'center', color: '#1e293b' }}>
                                    {noticias[noticiaIndex]?.titulo?.toUpperCase()}
                                </p>
                            </div>

                            {/* Líder */}
                            <div onClick={() => setActiveView('stats')} style={{ height: 220, background: '#ffffff', borderRadius: 24, border: `2.5px solid ${leadersList[leaderIndex]?.color || '#eee'}`, cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', boxShadow: `0 8px 25px ${leadersList[leaderIndex]?.color || '#eee'}20` }}>
                                {leadersList.length > 0 ? (() => {
                                    const ldr = leadersList[leaderIndex];
                                    const fotoUrl = ldr.p?.fotoUrl || '';
                                    const logoUrl = teamLogos[ldr.p?.equipo?.toUpperCase()] || DEFAULT_LOGO;
                                    const inicial = (ldr.p?.nombre || '?').charAt(0).toUpperCase();
                                    return (
                                        <div key={leaderIndex} className="fade-in" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                            {/* Header coloreado */}
                                            <div style={{ background: ldr.color, padding: '6px 10px', color: 'white', fontSize: '0.58rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                                {ldr.icon} LÍDER {ldr.label}
                                            </div>

                                            {/* Cuerpo */}
                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '8px 10px', gap: 5 }}>
                                                {/* Foto del jugador */}
                                                <div style={{ width: 58, height: 58, borderRadius: '50%', overflow: 'hidden', border: `2.5px solid ${ldr.color}`, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    {fotoUrl ? (
                                                        <img src={fotoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt=""
                                                            onError={e => { e.currentTarget.style.display='none'; (e.currentTarget.nextSibling as any).style.display='flex'; }}
                                                        />
                                                    ) : null}
                                                    <div style={{ display: fotoUrl ? 'none' : 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: ldr.color, color: 'white', fontSize: '1.4rem', fontWeight: 900 }}>
                                                        {inicial}
                                                    </div>
                                                </div>

                                                {/* Nombre del jugador */}
                                                <div style={{ fontSize: '0.72rem', fontWeight: 900, color: '#1e293b', lineHeight: 1.1, textAlign: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                                                    {ldr.p?.nombre}
                                                </div>

                                                {/* Logo + nombre del equipo */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <img src={logoUrl} style={{ width: 16, height: 16, objectFit: 'contain', borderRadius: '50%', background: '#f1f5f9', border: '1px solid #e2e8f0' }} alt="" onError={e => { e.currentTarget.src = DEFAULT_LOGO; }} />
                                                    <span style={{ fontSize: '0.5rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                                                        {ldr.p?.equipo}
                                                    </span>
                                                </div>

                                                {/* Estadística */}
                                                <div style={{ fontSize: '1.9rem', fontWeight: 900, color: ldr.color, lineHeight: 1 }}>
                                                    {ldr.val}
                                                    <span style={{ fontSize: '0.6rem', color: '#94a3b8', marginLeft: 2 }}>{ldr.unit}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })() : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#94a3b8', padding: 20 }}>
                                        Cargando líderes...
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tabla regular */}
                        <section>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <h2 style={{ fontSize: '0.75rem', fontWeight: 900, color: '#1e3a8a', margin: 0 }}>
                                    🏆 Tabla Regular {categoriaActiva}
                                </h2>
                                <span style={{ fontSize: '0.55rem', fontWeight: 900, color: '#94a3b8', background: '#f1f5f9', padding: '3px 10px', borderRadius: 12, textTransform: 'uppercase' }}>
                                    {getGroupLabel(tablaIndex === 0 ? 'A' : 'B', categoriaActiva)}
                                </span>
                            </div>
                            <div onClick={() => setActiveView('tabla')} style={{ cursor: 'pointer' }}>
                                <RenderTableSummary
                                    title="TABLA OFICIAL"
                                    data={tablaIndex === 0 ? equiposA : equiposB}
                                    color={tablaIndex === 0 ? '#1e3a8a' : '#d97706'}
                                />
                            </div>
                        </section>

                        {/* Próximos juegos */}
                        <section>
                            <div style={{ background: 'white', borderRadius: 24, border: '2.5px solid #1e3a8a', overflow: 'hidden', boxShadow: '0 10px 30px rgba(30,58,138,0.1)' }}>
                                <div style={{ background: '#1e3a8a', padding: '10px 15px' }}>
                                    <h2 style={{ fontSize: '0.75rem', fontWeight: 900, color: 'white', margin: 0, textTransform: 'uppercase' }}>
                                        📅 Próxima Jornada {categoriaActiva}
                                    </h2>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', padding: 10, gap: 10 }}>
                                    {proximosJuegos.length > 0 ? proximosJuegos.map(j => (
                                        <div key={j.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: '#f8fafc', borderRadius: 18, border: '1px solid #e2e8f0' }}>
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 900, textAlign: 'right', lineHeight: 1.1 }}>{j.equipoLocalNombre.toUpperCase()}</span>
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'white', border: '1px solid #eee', overflow: 'hidden', flexShrink: 0 }}>
                                                    <img src={teamLogos[j.equipoLocalNombre?.trim().toUpperCase()]} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />
                                                </div>
                                            </div>
                                            <div style={{ flex: 0.8, textAlign: 'center', margin: '0 5px' }}>
                                                <span style={{ background: '#1e3a8a', color: 'white', padding: '3px 10px', borderRadius: 10, fontSize: '0.55rem', fontWeight: 900 }}>
                                                    {j.hora || 'VS'}
                                                </span>
                                                <p style={{ fontSize: '0.45rem', color: '#94a3b8', marginTop: 3, fontWeight: 'bold' }}>{j.fechaAsignada}</p>
                                            </div>
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8 }}>
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'white', border: '1px solid #eee', overflow: 'hidden', flexShrink: 0 }}>
                                                    <img src={teamLogos[j.equipoVisitanteNombre?.trim().toUpperCase()]} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="" />
                                                </div>
                                                <span style={{ fontSize: '0.65rem', fontWeight: 900, lineHeight: 1.1 }}>{j.equipoVisitanteNombre.toUpperCase()}</span>
                                            </div>
                                        </div>
                                    )) : (
                                        <div style={{ textAlign: 'center', padding: 20, fontSize: '0.7rem', color: '#94a3b8' }}>
                                            Sin juegos programados
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* Entrevistas */}
                        <section>
                            <h2 style={{ fontSize: '0.75rem', fontWeight: 900, color: '#1e3a8a', marginBottom: 10, textTransform: 'uppercase' }}>
                                🎙️ Zona de Entrevistas
                            </h2>
                            <div style={{ display: 'flex', overflowX: 'auto', gap: 12, paddingBottom: 10, scrollSnapType: 'x mandatory' }} className="no-scrollbar">
                                {!entrevistasCargadas ? (
                                    <p style={{ textAlign: 'center', fontSize: '0.6rem', color: '#94a3b8', width: '100%' }}>Cargando...</p>
                                ) : entrevistas.length === 0 ? (
                                    <p style={{ textAlign: 'center', fontSize: '0.6rem', color: '#94a3b8', width: '100%' }}>No hay videos disponibles</p>
                                ) : entrevistas.map(video => (
                                    <div key={video.id} onClick={() => setVideoSeleccionado(video)}
                                        style={{ minWidth: 110, cursor: 'pointer', scrollSnapAlign: 'start', textAlign: 'center', flexShrink: 0 }}>
                                        <div style={{
                                            width: 110, height: 150, borderRadius: 12,
                                            overflow: 'hidden', border: '2px solid #1e3a8a',
                                            position: 'relative', background: '#000',
                                        }}>
                                            {/* Thumbnail guardado (preferido) o frame del video */}
                                            {video.thumbnailUrl ? (
                                                <img src={video.thumbnailUrl} alt={video.titulo}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <video
                                                    src={video.videoUrl}
                                                    muted playsInline preload="metadata"
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                                                    onLoadedMetadata={e => {
                                                        const v = e.target as HTMLVideoElement;
                                                        v.currentTime = Math.min(v.duration * 0.15, 3);
                                                    }}
                                                    onSeeked={e => {
                                                        // forzar repaint para que el frame aparezca
                                                        const v = e.target as HTMLVideoElement;
                                                        v.style.opacity = '0.99';
                                                        setTimeout(() => { v.style.opacity = '1'; }, 50);
                                                    }}
                                                />
                                            )}
                                            {/* Overlay semitransparente con play */}
                                            <div style={{
                                                position: 'absolute', inset: 0,
                                                background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: '50%',
                                                    background: 'rgba(255,255,255,0.88)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
                                                }}>
                                                    <span style={{ fontSize: '0.9rem', marginLeft: 3 }}>▶</span>
                                                </div>
                                            </div>
                                            {/* Fecha en la parte de abajo */}
                                            {video.fecha && (
                                                <div style={{
                                                    position: 'absolute', bottom: 0, left: 0, right: 0,
                                                    padding: '4px 6px', textAlign: 'center',
                                                    fontSize: '0.4rem', color: 'rgba(255,255,255,0.85)', fontWeight: 600,
                                                }}>
                                                    {video.fecha}
                                                </div>
                                            )}
                                        </div>
                                        <p style={{
                                            fontSize: '0.52rem', fontWeight: 700, color: '#1e293b',
                                            marginTop: 6, lineHeight: 1.2, textTransform: 'uppercase',
                                            overflow: 'hidden', textOverflow: 'ellipsis',
                                            display: '-webkit-box', WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical', maxWidth: 110,
                                        }}>
                                            {video.titulo}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Modal de video */}
                        {videoSeleccionado && (
                            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 5000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <button onClick={() => setVideoSeleccionado(null)} style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: '50%', width: 40, height: 40, fontSize: '1.2rem', fontWeight: 'bold', cursor: 'pointer', zIndex: 5001 }}>✕</button>
                                <div style={{ width: '100%', maxWidth: 500, height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <video src={videoSeleccionado.videoUrl} controls autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10, boxShadow: '0 0 30px rgba(0,0,0,0.5)' }} />
                                </div>
                                <div style={{ color: 'white', textAlign: 'center', padding: 10 }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem' }}>{videoSeleccionado.titulo}</h3>
                                    <p style={{ margin: '5px 0 0', fontSize: '0.7rem', color: '#ccc' }}>{videoSeleccionado.fecha}</p>
                                </div>
                            </div>
                        )}

                        {/* Panel admin */}
                        {isAdmin && (
                            <div style={{ padding: 15, background: '#1e3a8a', borderRadius: 24, color: 'white', textAlign: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <button onClick={() => setActiveView('mesa')}   style={adminBtnStyle}>⏱ MESA</button>
                                    <button onClick={() => setActiveView('equipos')} style={adminBtnStyle}>🛡 EQUIPOS</button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, marginTop: 10 }}>
                                    <button onClick={() => setActiveView('adminVideos')} style={adminBtnStyle}>🎥 VIDEOS</button>
                                <button onClick={() => setShowReset(true)} style={{ ...adminBtnStyle, background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: '#fca5a5' }}>☢️ RESET TEMPORADA</button>
                                </div>
                                <button onClick={() => signOut(auth)} style={{ marginTop: 10, background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: '0.5rem', fontWeight: 'bold', cursor: 'pointer' }}>
                                    SALIR ADMIN
                                </button>

                        {showReset && (
                            <ResetTemporada
                                categoria={categoriaActiva}
                                onClose={() => setShowReset(false)}
                            />
                        )}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        {activeView === 'noticias'    && (isAdmin ? <NewsAdmin onClose={() => setActiveView('dashboard')} /> : <NewsFeed onClose={() => setActiveView('dashboard')} />)}
                        {activeView === 'stats'       && <StatsViewer categoria={categoriaActiva} onClose={() => setActiveView('dashboard')} />}
                        {activeView === 'playoff'     && <PlayoffViewer categoria={categoriaActiva} onClose={() => setActiveView('dashboard')} />}
                        {activeView === 'tabla'       && <StandingsViewer equipos={[...equiposA, ...equiposB]} partidos={allMatchesGlobal} categoria={categoriaActiva} onClose={() => setActiveView('dashboard')} />}
                        {activeView === 'calendario'  && <CalendarViewer categoria={categoriaActiva} rol={user?.rol} onClose={() => setActiveView('dashboard')} />}
                        {activeView === 'mesa'        && isAdmin && <MesaTecnica categoria={categoriaActiva} onClose={() => setActiveView('dashboard')} />}
                        {activeView === 'equipos_pub'  && <TeamsPublicViewer categoria={categoriaActiva} onClose={() => setActiveView('dashboard')} />}
                        {activeView === 'equipos'     && isAdmin && <AdminEquipos categoria={categoriaActiva} onClose={() => setActiveView('dashboard')} />}
                        {activeView === 'adminVideos' && isAdmin && <AdminVideos onClose={() => setActiveView('dashboard')} />}
                    </>
                )}
                </Suspense>
            </main>

            {/* ── Barra de navegación ── */}
            <nav style={{
                position: 'fixed', bottom: 20, left: 20, right: 20,
                background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(10px)',
                height: 75, display: 'flex', justifyContent: 'flex-start',
                alignItems: 'center', overflowX: 'auto',
                borderRadius: 35, boxShadow: '0 15px 40px rgba(0,0,0,0.12)',
                border: '1.5px solid #f1f5f9', zIndex: 1000,
                padding: '0 10px', gap: 2,
                scrollbarWidth: 'none',
            }}
                className="no-scrollbar"
            >
                {[
                    { v: 'calendario',  i: '📅', l: 'Juegos'   },
                    { v: 'tabla',       i: '🏆', l: 'Tablas'   },
                    { v: 'dashboard',   i: '🏠', l: 'Inicio'   },
                    { v: 'playoff',     i: '🔥', l: 'Playoff'  },
                    { v: 'stats',       i: '📊', l: 'Líderes'  },
                    { v: 'equipos_pub', i: '🛡️', l: 'Equipos'  },
                    { v: 'noticias',    i: '📰', l: 'Noticias' },
                ].map(item => (
                    <button
                        key={item.v}
                        onClick={() => setActiveView(item.v)}
                        style={{
                            background: 'none', border: 'none',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            color: activeView === item.v ? '#1e3a8a' : '#94a3b8',
                            cursor: 'pointer', transition: '0.3s',
                            flex: '1 0 auto', minWidth: 52, padding: '0 4px',
                        }}
                    >
                        <span style={{ fontSize: '1.3rem', transform: activeView === item.v ? 'scale(1.25)' : 'scale(1)', transition: '0.3s' }}>{item.i}</span>
                        <span style={{ fontSize: '0.55rem', fontWeight: 900, textTransform: 'uppercase' }}>{item.l}</span>
                    </button>
                ))}
            </nav>

            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                .fade-in { animation: fadeIn 0.4s ease; }
            `}</style>
        </div>
    );
}

const adminBtnStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.1)', color: 'white',
    border: '1px solid white', padding: 10,
    borderRadius: 15, fontSize: '0.6rem', fontWeight: 'bold', cursor: 'pointer',
};

export default App;