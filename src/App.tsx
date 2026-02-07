import { useEffect, useState, memo } from 'react';
import './App.css'; 
import { db, auth, messaging } from './firebase'; 
import { doc, onSnapshot, collection, query, orderBy, getDocs, limit, setDoc, where } from 'firebase/firestore'; 
import { onAuthStateChanged, signOut } from 'firebase/auth'; 
import { getToken } from 'firebase/messaging'; 

// Componentes
import Login from './Login';
import AdminEquipos from './AdminEquipos'; 
import CalendarViewer from './CalendarViewer'; 
import MesaTecnica from './MesaTecnica'; 
import StatsViewer from './StatsViewer'; 
import StandingsViewer from './StandingsViewer'; 
import TeamsPublicViewer from './TeamsPublicViewer';
import NewsAdmin from './NewsAdmin'; 
import NewsFeed from './NewsFeed';
import PlayoffViewer from './PlayoffViewer'; 

const CATEGORIAS_DISPONIBLES = [
  { id: 'MASTER40', label: '🍷 MASTER 40' },
  { id: 'U19', label: '⚡ U19' },
  { id: 'LIBRE', label: '🏀 LIBRE' },
  { id: 'FEMENINO', label: '‍♀️ FEMENINO' }
];

const getCollectionName = (baseName, cat) => (cat === 'MASTER40' ? baseName : `${baseName}_${cat}`);

// 1. TABLA RESUMIDA CON JG/JP Y LÓGICA FIBA
const RenderTableSummary = memo(({ title, data, color }) => (
  <div className="fade-in" style={{ width: '100%', background: 'white', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 8px 20px rgba(0,0,0,0.06)', border: `2.5px solid ${color}` }}>
    <div style={{ background: color, padding: '10px', textAlign: 'center' }}>
      <h4 style={{ fontSize: '0.7rem', color: 'white', margin: 0, fontWeight: '900', textTransform: 'uppercase' }}>{title}</h4>
    </div>
    <div style={{ padding: '10px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
        <thead>
          <tr style={{ color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>
            <th style={{ textAlign: 'left', paddingBottom: '5px' }}>EQUIPO</th>
            <th style={{ textAlign: 'center' }}>JG</th>
            <th style={{ textAlign: 'center' }}>JP</th>
            <th style={{ textAlign: 'center' }}>DIF</th>
            <th style={{ textAlign: 'center', color: color }}>PTS</th>
          </tr>
        </thead>
        <tbody>
          {data.length > 0 ? data.slice(0, 4).map((eq) => {
             const difGlobal = (eq.puntos_favor || 0) - (eq.puntos_contra || 0);
             return (
              <tr key={eq.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '8px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', border: '1px solid #eee', background: 'white', flexShrink: 0 }}>
                      <img src={eq.logoUrl || "https://cdn-icons-png.flaticon.com/512/166/166344.png"} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="L" />
                  </div>
                  <span style={{ fontWeight: '800', color: '#1e293b', fontSize: '0.65rem' }}>{eq.nombre.toUpperCase()}</span>
                </td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{eq.victorias || 0}</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{eq.derrotas || 0}</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold', color: difGlobal >= 0 ? '#3b82f6' : '#ef4444' }}>{difGlobal > 0 ? `+${difGlobal}` : difGlobal}</td>
                <td style={{ textAlign: 'center', fontWeight: '900', color: color }}>{eq.puntos || 0}</td>
              </tr>
             );
          }) : (
             <tr><td colSpan="5" style={{textAlign:'center', padding:'10px', color:'#94a3b8', fontStyle:'italic'}}>Registrando equipos...</td></tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
));

function App() {
  const [user, setUser] = useState(null);
  const [categoriaActiva, setCategoriaActiva] = useState('MASTER40');
  const [equiposA, setEquiposA] = useState([]); 
  const [equiposB, setEquiposB] = useState([]); 
  const [noticias, setNoticias] = useState([]);
  const [proximosJuegos, setProximosJuegos] = useState([]); 
  const [resultadosRecientes, setResultadosRecientes] = useState([]); 
  const [teamLogos, setTeamLogos] = useState({});
  const [allMatchesGlobal, setAllMatchesGlobal] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('dashboard');
  
  const [noticiaIndex, setNoticiaIndex] = useState(0);
  const [juegoIndex, setJuegoIndex] = useState(0);
  const [tablaIndex, setTablaIndex] = useState(0);
  const [leaderIndex, setLeaderIndex] = useState(0);
  const [leadersList, setLeadersList] = useState([]);

  // --- LÓGICA DE NOMBRES DE GRUPO (NBA STYLE) ---
  const getGroupLabel = (grupo, cat) => {
      const g = (grupo || '').toUpperCase();
      const c = (cat || '').toUpperCase();
      
      if (c === 'LIBRE') {
          if (g === 'A') return 'CONF. ESTE';
          if (g === 'B') return 'CONF. OESTE';
      }
      return `GRUPO ${g}`;
  };

  useEffect(() => {
    onAuthStateChanged(auth, (u) => {
      if (u) {
        onSnapshot(doc(db, 'usuarios', u.uid), (snap) => {
          const data = snap.data();
          setUser({ uid: u.uid, email: u.email, rol: (u.email === 'mdiazsalas7@gmail.com' || data?.rol === 'admin') ? 'admin' : 'fan' });
          if (activeView === 'login') setActiveView('dashboard');
        });
      } else { setUser(null); }
      setLoading(false);
    });
  }, [activeView]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true); 
        setLeadersList([]);

        // 1. CARGA DE EQUIPOS (Confianza en la Colección)
        const nombreColEquipos = getCollectionName('equipos', categoriaActiva);
        const equiposSnap = await getDocs(collection(db, nombreColEquipos));
        
        const logoMap = {};
        const equiposDelMundo = [];

        equiposSnap.forEach(d => {
            const data = d.data();
            const n = data.nombre?.trim().toUpperCase();
            if (n) {
                logoMap[n] = data.logoUrl || "https://cdn-icons-png.flaticon.com/512/166/166344.png";
                
                // LÓGICA DE FILTRADO FLEXIBLE
                const esColeccionEspecifica = categoriaActiva !== 'MASTER40';
                const pertenece = esColeccionEspecifica ? true : (!data.categoria || data.categoria === 'MASTER40');

                if (pertenece) {
                    equiposDelMundo.push({ id: d.id, ...data });
                }
            }
        });
        setTeamLogos(logoMap);

        // 2. CALENDARIO CON ORDEN CRONOLÓGICO
        const nombreColCalendario = getCollectionName('calendario', categoriaActiva);
        const calendarSnap = await getDocs(query(collection(db, nombreColCalendario), orderBy("fechaAsignada", "asc")));
        const allMatches = calendarSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllMatchesGlobal(allMatches);

        setResultadosRecientes(allMatches.filter(m => m.estatus === 'finalizado').reverse().slice(0, 5));

        const proximosOrdenados = allMatches
            .filter(m => m.estatus !== 'finalizado')
            .sort((a, b) => {
                const fComp = (a.fechaAsignada || "").localeCompare(b.fechaAsignada || "");
                if (fComp !== 0) return fComp;
                return (a.hora || "00:00").localeCompare(b.hora || "00:00");
            });
        setProximosJuegos(proximosOrdenados);

        // 3. LÓGICA FIBA D.1.3 (ORDENAMIENTO)
        const sortTeamsFIBA = (teams) => {
            return [...teams].sort((a, b) => {
                if ((b.puntos || 0) !== (a.puntos || 0)) return (b.puntos || 0) - (a.puntos || 0);
                const tiedIds = teams.filter(t => t.puntos === a.puntos).map(t => t.id);
                const h2hMatches = allMatches.filter(p => p.estatus === 'finalizado' && tiedIds.includes(p.equipoLocalId) && tiedIds.includes(p.equipoVisitanteId));
                const getH2H = (id) => {
                    let pts = 0, pf = 0, pc = 0;
                    h2hMatches.forEach(m => {
                        if (m.equipoLocalId === id) { pf += m.marcadorLocal; pc += m.marcadorVisitante; pts += m.marcadorLocal > m.marcadorVisitante ? 2 : 1; }
                        else if (m.equipoVisitanteId === id) { pf += m.marcadorVisitante; pc += m.marcadorLocal; pts += m.marcadorVisitante > m.marcadorLocal ? 2 : 1; }
                    });
                    return { pts, dif: pf - pc, pf };
                };
                const sA = getH2H(a.id), sB = getH2H(b.id);
                if (sB.pts !== sA.pts) return sB.pts - sA.pts;
                if (sB.dif !== sA.dif) return sB.dif - sA.dif;
                if (sB.pf !== sA.pf) return sB.pf - sA.pf;
                return ((b.puntos_favor || 0) - (b.puntos_contra || 0)) - ((a.puntos_favor || 0) - (a.puntos_contra || 0));
            });
        };

        setEquiposA(sortTeamsFIBA(equiposDelMundo.filter(e => e.grupo === 'A' || e.grupo === 'a' || categoriaActiva === 'U19')));
        setEquiposB(sortTeamsFIBA(equiposDelMundo.filter(e => e.grupo === 'B' || e.grupo === 'b')));

        // 4. LÍDERES (CORREGIDO: FILTRADO ESTRICTO POR CATEGORÍA)
        const teamGamesCount = {};
        allMatches.filter(m => m.estatus === 'finalizado').forEach(game => {
            const loc = game.equipoLocalNombre?.trim().toUpperCase();
            const vis = game.equipoVisitanteNombre?.trim().toUpperCase();
            if (loc) teamGamesCount[loc] = (teamGamesCount[loc] || 0) + 1;
            if (vis) teamGamesCount[vis] = (teamGamesCount[vis] || 0) + 1;
        });

        // Leemos stats globales (o específicas si existen)
        const statsSnap = await getDocs(collection(db, 'stats_partido')); 
        const aggregated = {};
        const nombresEquiposValidos = equiposDelMundo.map(e => e.nombre);

        statsSnap.forEach(docSnap => {
            const stat = docSnap.data();
            const eqStat = (stat.equipo || stat.nombreEquipo || '').trim().toUpperCase();
            const statCat = (stat.categoria || '').toUpperCase(); // Leemos la categoría de la estadística

            // VERIFICACIÓN DOBLE: 
            // 1. Que el equipo exista en esta liga.
            // 2. Que la estadística pertenezca a la categoría activa (O sea Master si es Master, Libre si es Libre)
            // (Si no tiene categoría, asumimos Master por compatibilidad antigua)
            const esMismaCategoria = statCat === categoriaActiva || (!statCat && categoriaActiva === 'MASTER40');

            if (nombresEquiposValidos.includes(eqStat) && esMismaCategoria) {
                const jId = stat.jugadorId;
                if (!aggregated[jId]) aggregated[jId] = { nombre: stat.nombre, equipo: eqStat, pts: 0, reb: 0, pj: 0 };
                const acc = aggregated[jId];
                acc.pts += (Number(stat.tirosLibres)||0) + (Number(stat.dobles)||0)*2 + (Number(stat.triples)||0)*3;
                acc.reb += (Number(stat.rebotes)||0);
                acc.pj += 1;
            }
        });

        const playerList = Object.values(aggregated).map((p) => {
            const den = teamGamesCount[p.equipo] || p.pj || 1;
            return { ...p, ppg: parseFloat((p.pts / den).toFixed(1)), rpg: parseFloat((p.reb / den).toFixed(1)) };
        });

        if (playerList.length > 0) {
            setLeadersList([
                { label: 'PUNTOS', p: [...playerList].sort((a,b) => b.ppg - a.ppg)[0], val: [...playerList].sort((a,b) => b.ppg - a.ppg)[0].ppg, unit: 'PPG', icon: '🔥', color:'#ef4444' },
                { label: 'REBOTES', p: [...playerList].sort((a,b) => b.rpg - a.rpg)[0], val: [...playerList].sort((a,b) => b.rpg - a.rpg)[0].rpg, unit: 'RPG', icon: '🖐️', color:'#10b981' }
            ]);
        }

        const newsSnap = await getDocs(query(collection(db, "noticias"), orderBy("fecha", "desc"), limit(5)));
        setNoticias(newsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      } catch (e) { console.error(e); setLoading(false); }
    };
    fetchData();
  }, [categoriaActiva, activeView]);

  useEffect(() => {
    const itv = setInterval(() => {
      setNoticiaIndex(p => (p + 1) % (noticias.length || 1));
      setJuegoIndex(p => (p + 1) % (resultadosRecientes.length || 1));
      setTablaIndex(p => (p + 1) % 2);
      setLeaderIndex(p => (p + 1) % (leadersList.length || 1));
    }, 6000);
    return () => clearInterval(itv);
  }, [noticias.length, resultadosRecientes.length, leadersList.length]);

  const isAdmin = user?.rol === 'admin';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#ffffff', color: '#1e293b', fontFamily: 'sans-serif', paddingBottom: '110px' }}>
      
      <header style={{ background: '#ffffff', padding: '15px 15px 10px 15px', borderBottom: '1px solid #f1f5f9', position: 'sticky', top: 0, zIndex: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom:'15px' }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
            <img src="https://i.postimg.cc/hhF5fTPn/image.png" alt="Logo" style={{ height: '45px', cursor:'pointer' }} onClick={() => setActiveView('dashboard')} />
            <div onClick={() => setActiveView('login')} style={{ fontSize:'0.7rem', opacity:0.1, marginTop:'2px', cursor:'pointer' }}>🔑</div>
          </div>
          <div style={{ textAlign: 'center', flex: 2 }}>
            <h1 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#1e3a8a', margin:0, textTransform:'uppercase' }}>Liga Metropolitana</h1>
            <p style={{ fontSize: '0.5rem', color: '#94a3b8', margin:0, fontWeight:'bold' }}>EJE ESTE • 2026</p>
          </div>
          
          <div style={{ flex: 1, textAlign: 'right' }}>
             <button 
                onClick={() => window.open('https://firebasestorage.googleapis.com/v0/b/liga-de-san-mateo.firebasestorage.app/o/REGLAMENTO%20INTERNO.pdf?alt=media', '_blank')} 
                style={{ 
                    background: 'white', 
                    border: '1px solid #e2e8f0', 
                    padding: '6px 8px', 
                    borderRadius: '10px', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    float: 'right',
                    cursor: 'pointer',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
                }}
             >
                <span style={{ fontSize:'1.2rem', lineHeight:'1' }}>📜</span>
                <span style={{ fontSize:'0.35rem', fontWeight:'900', color:'#1e3a8a', marginTop:'2px', lineHeight:'1' }}>REGLAMENTO<br/>INTERNO</span>
             </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px' }} className="no-scrollbar">
          {CATEGORIAS_DISPONIBLES.map(cat => (
            <button key={cat.id} onClick={() => setCategoriaActiva(cat.id)} style={{ padding: '8px 16px', borderRadius: '20px', border: 'none', whiteSpace: 'nowrap', background: categoriaActiva === cat.id ? '#1e3a8a' : '#f1f5f9', color: categoriaActiva === cat.id ? 'white' : '#64748b', fontSize: '0.65rem', fontWeight: '900', transition: '0.3s' }}>{cat.label}</button>
          ))}
        </div>
      </header>

      <main style={{ padding: '15px', maxWidth: '500px', margin: '0 auto' }}>
        {activeView === 'login' ? (
           <div className="fade-in"><Login /><button onClick={() => setActiveView('dashboard')} style={{ width:'100%', marginTop:'20px', background:'none', border:'none', color:'#94a3b8', fontWeight:'bold', cursor:'pointer', fontSize:'0.7rem' }}>← VOLVER</button></div>
        ) : activeView === 'dashboard' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
              
              <section>
                <h2 style={{ fontSize: '0.7rem', fontWeight: '900', color: '#1e3a8a', marginBottom: '10px', textTransform:'uppercase' }}>🏀 Marcadores {categoriaActiva}</h2>
                <div style={{ position: 'relative', height: '180px', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(30,58,138,0.12)' }}>
                  {resultadosRecientes.length > 0 ? (
                    <div key={juegoIndex} className="fade-in" style={{ height: '100%', background: 'linear-gradient(135deg, #1e3a8a, #1e40af)', color: 'white', padding: '20px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <div style={{ textAlign: 'center', flex: 1 }}>
                          <div style={{ width:'50px', height:'50px', borderRadius:'50%', background:'white', margin:'0 auto', overflow:'hidden', border:'2px solid white' }}><img src={teamLogos[resultadosRecientes[juegoIndex].equipoLocalNombre?.trim().toUpperCase()]} style={{ width:'100%', height:'100%', objectFit:'contain' }} /></div>
                          <p style={{ fontSize: '0.55rem', fontWeight: '900', marginTop: '5px' }}>{resultadosRecientes[juegoIndex].equipoLocalNombre}</p>
                        </div>
                        <div style={{ textAlign: 'center', flex: 1 }}>
                          <p style={{ fontSize: '1.8rem', fontWeight: 900, margin: 0 }}>{resultadosRecientes[juegoIndex].marcadorLocal ?? 0} - {resultadosRecientes[juegoIndex].marcadorVisitante ?? 0}</p>
                          <span style={{ fontSize: '0.45rem', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '10px' }}>FINALIZADO</span>
                        </div>
                        <div style={{ textAlign: 'center', flex: 1 }}>
                          <div style={{ width:'50px', height:'50px', borderRadius:'50%', background:'white', margin:'0 auto', overflow:'hidden', border:'2px solid white' }}><img src={teamLogos[resultadosRecientes[juegoIndex].equipoVisitanteNombre?.trim().toUpperCase()]} style={{ width:'100%', height:'100%', objectFit:'contain' }} /></div>
                          <p style={{ fontSize: '0.55rem', fontWeight: '900', marginTop: '5px' }}>{resultadosRecientes[juegoIndex].equipoVisitanteNombre}</p>
                        </div>
                      </div>
                      <button onClick={() => window.open('https://www.youtube.com/@barbakanzler', '_blank')} style={{ width: '100%', padding: '10px', borderRadius: '15px', border: 'none', background: '#f59e0b', color: 'white', fontWeight: '900', fontSize: '0.65rem', cursor: 'pointer' }}>▶ CANAL @BARBAKANZLER</button>
                    </div>
                  ) : <div style={{height:'100%', background:'#f8fafc', borderRadius:'24px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.7rem'}}>No hay resultados aún</div>}
                </div>
              </section>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div onClick={() => setActiveView('noticias')} style={{ height: '220px', background: 'white', borderRadius: '24px', border: '2.5px solid #1e3a8a', cursor: 'pointer', overflow:'hidden', boxShadow:'0 8px 25px rgba(30,58,138,0.1)' }}>
                  <div style={{ background: '#1e3a8a', padding: '6px 12px' }}><p style={{ fontSize: '0.6rem', fontWeight: '900', color: 'white', margin: 0 }}>📢 PRENSA LIGA</p></div>
                  <div style={{ height: '110px', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8fafc', padding:'5px' }}>{noticias.length > 0 && <img key={noticiaIndex} src={noticias[noticiaIndex].imageUrl} className="fade-in" style={{ maxWidth: '100%', maxHeight:'100%', objectFit: 'contain' }} />}</div>
                  <p style={{ fontSize: '0.6rem', fontWeight: '800', padding: '8px 12px', textAlign:'center', color:'#1e293b' }}>{noticias[noticiaIndex]?.titulo?.toUpperCase()}</p>
                </div>

                <div onClick={() => setActiveView('stats')} style={{ height: '220px', background: '#ffffff', borderRadius: '24px', border: `2.5px solid ${leadersList[leaderIndex]?.color || '#eee'}`, cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection:'column', position:'relative', overflow:'hidden', boxShadow:`0 8px 25px ${leadersList[leaderIndex]?.color}20` }}>
                  {leadersList.length > 0 ? (
                    <div key={leaderIndex} className="fade-in" style={{ height:'100%', display:'flex', flexDirection:'column' }}>
                      <div style={{ background: leadersList[leaderIndex].color, padding: '6px 12px', color:'white', fontSize:'0.6rem', fontWeight:'900' }}>{leadersList[leaderIndex].icon} LÍDER {leadersList[leaderIndex].label}</div>
                      <div style={{ flex: 1, display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', padding:'10px' }}>
                        <div style={{ width:'55px', height:'55px', borderRadius:'50%', background:'white', overflow:'hidden', border:`2.5px solid ${leadersList[leaderIndex].color}`, marginBottom:'8px' }}><img src={teamLogos[leadersList[leaderIndex].p?.equipo?.toUpperCase()] || ""} style={{ width:'100%', height:'100%', objectFit:'contain' }} /></div>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 900, color:'#1e3a8a', margin: 0 }}>{leadersList[leaderIndex].p?.nombre}</h3>
                        <div style={{ fontSize: '1.8rem', fontWeight: '900', color: leadersList[leaderIndex].color }}>{leadersList[leaderIndex].val}<span style={{ fontSize:'0.65rem', color:'#94a3b8' }}>{leadersList[leaderIndex].unit}</span></div>
                      </div>
                    </div>
                  ) : <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6rem', color:'#94a3b8', padding:'20px'}}>Cargando líderes...</div>}
                </div>
              </div>

              <section>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                  <h2 style={{ fontSize: '0.75rem', fontWeight: '900', color: '#1e3a8a', margin: 0 }}>🏆 Clasificación {categoriaActiva}</h2>
                  <span style={{ fontSize:'0.55rem', fontWeight:'900', color:'#94a3b8', background:'#f1f5f9', padding:'3px 10px', borderRadius:'12px', textTransform:'uppercase' }}>
                    {getGroupLabel(tablaIndex === 0 ? 'A' : 'B', categoriaActiva)}
                  </span>
                </div>
                <div onClick={() => setActiveView('tabla')} style={{ cursor: 'pointer' }}><RenderTableSummary title={`TABLA OFICIAL`} data={tablaIndex === 0 ? equiposA : equiposB} color={tablaIndex === 0 ? "#1e3a8a" : "#d97706"} /></div>
              </section>

              {/* PRÓXIMOS JUEGOS: ORDENADOS POR HORA Y CON BORDE AZUL */}
              <section>
                <div style={{ background: 'white', borderRadius: '24px', border: '2.5px solid #1e3a8a', overflow: 'hidden', boxShadow: '0 10px 30px rgba(30,58,138,0.1)' }}>
                  <div style={{ background: '#1e3a8a', padding: '10px 15px' }}>
                    <h2 style={{ fontSize: '0.75rem', fontWeight: '900', color: 'white', margin: 0, textTransform:'uppercase' }}>📅 Próxima Jornada {categoriaActiva}</h2>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', padding: '10px', gap: '10px' }}>
                    {proximosJuegos.length > 0 ? proximosJuegos.slice(0, 5).map(j => (
                      <div key={j.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#f8fafc', borderRadius: '18px', border: '1px solid #e2e8f0' }}>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                          <span style={{ fontSize: '0.65rem', fontWeight: '900', textAlign:'right', lineHeight:'1.1' }}>{j.equipoLocalNombre.toUpperCase()}</span>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'white', border: '1px solid #eee', overflow: 'hidden', flexShrink: 0 }}><img src={teamLogos[j.equipoLocalNombre?.trim().toUpperCase()]} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="L" /></div>
                        </div>
                        <div style={{ flex: 0.8, textAlign: 'center', margin: '0 5px' }}>
                          <span style={{ fontSize:'0.45rem', fontWeight:'900', color:'#94a3b8', display:'block', marginBottom:'2px' }}>
                            {getGroupLabel(j.grupo, categoriaActiva)}
                          </span>
                          <span style={{ background: '#1e3a8a', color: 'white', padding: '3px 10px', borderRadius: '10px', fontSize: '0.55rem', fontWeight: '900' }}>{j.hora || 'VS'}</span>
                          <p style={{ fontSize: '0.45rem', color: '#94a3b8', marginTop: '3px', fontWeight: 'bold' }}>{j.fechaAsignada}</p>
                        </div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'white', border: '1px solid #eee', overflow: 'hidden', flexShrink: 0 }}><img src={teamLogos[j.equipoVisitanteNombre?.trim().toUpperCase()]} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="V" /></div>
                          <span style={{ fontSize: '0.65rem', fontWeight: '900', lineHeight:'1.1' }}>{j.equipoVisitanteNombre.toUpperCase()}</span>
                        </div>
                      </div>
                    )) : <div style={{textAlign:'center', padding:'20px', fontSize:'0.7rem', color:'#94a3b8'}}>Sin juegos programados</div>}
                  </div>
                </div>
              </section>

              {isAdmin && (
                <div style={{ padding: '15px', background: '#1e3a8a', borderRadius: '24px', color: 'white', textAlign: 'center', boxShadow:'0 10px 25px rgba(0,0,0,0.1)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button onClick={() => setActiveView('mesa')} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid white', padding: '10px', borderRadius: '15px', fontSize: '0.6rem', fontWeight: 'bold' }}>⏱ MESA</button>
                    <button onClick={() => setActiveView('equipos')} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid white', padding: '10px', borderRadius: '15px', fontSize: '0.6rem', fontWeight:'bold' }}>🛡 EQUIPOS</button>
                  </div>
                  <button onClick={() => signOut(auth)} style={{ marginTop:'10px', background:'none', border:'none', color:'rgba(255,255,255,0.5)', fontSize:'0.5rem', fontWeight:'bold', cursor:'pointer' }}>SALIR ADMIN</button>
                </div>
              )}
            </div>
        ) : (
          <>
            {activeView === 'noticias' && (isAdmin ? <NewsAdmin onClose={() => setActiveView('dashboard')} /> : <NewsFeed onClose={() => setActiveView('dashboard')} />)}
            {activeView === 'stats' && <StatsViewer categoria={categoriaActiva} onClose={() => setActiveView('dashboard')} />}
            {activeView === 'playoff' && <PlayoffViewer categoria={categoriaActiva} onClose={() => setActiveView('dashboard')} />}
            {activeView === 'tabla' && <StandingsViewer equipos={[...equiposA, ...equiposB]} partidos={allMatchesGlobal} categoria={categoriaActiva} onClose={() => setActiveView('dashboard')} />}
            {activeView === 'calendario' && <CalendarViewer categoria={categoriaActiva} rol={user?.rol} onClose={() => setActiveView('dashboard')} />}
            {activeView === 'mesa' && isAdmin && <MesaTecnica categoria={categoriaActiva} onClose={() => setActiveView('dashboard')} />}
            {activeView === 'equipos' && isAdmin && <AdminEquipos categoria={categoriaActiva} onClose={() => setActiveView('dashboard')} />}
          </>
        )}
      </main>

      <nav style={{ position: 'fixed', bottom: '20px', left: '20px', right: '20px', background: 'rgba(255,255,255,0.98)', backdropFilter: 'blur(10px)', height: '75px', display: 'flex', justifyContent: 'space-around', alignItems: 'center', borderRadius: '35px', boxShadow: '0 15px 40px rgba(0,0,0,0.12)', border: '1.5px solid #f1f5f9', zIndex: 1000 }}>
          {[{v:'calendario',i:'📅',l:'Juegos'},{v:'tabla',i:'🏆',l:'Tablas'},{v:'dashboard',i:'🏠',l:'Inicio'},{v:'playoff',i:'🔥',l:'Playoff'},{v:'stats',i:'📊',l:'Líderes'},{v:'noticias',i:'📰',l:'Noticias'}].map(item => (
            <button key={item.v} onClick={() => setActiveView(item.v as any)} style={{ background: 'none', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: activeView === item.v ? '#1e3a8a' : '#94a3b8', cursor: 'pointer', transition:'0.3s' }}>
              <span style={{ fontSize: '1.3rem', transform: activeView === item.v ? 'scale(1.25)' : 'scale(1)' }}>{item.i}</span>
              <span style={{ fontSize: '0.55rem', fontWeight: '900', textTransform:'uppercase' }}>{item.l}</span>
            </button>
          ))}
      </nav>
    </div>
  );
}

export default App;