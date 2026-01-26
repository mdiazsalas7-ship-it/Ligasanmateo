import { useEffect, useState } from 'react';
import './App.css'; 
import { db, auth } from './firebase'; 
import { doc, onSnapshot, collection, query, orderBy, getDocs, limit } from 'firebase/firestore'; 
import { onAuthStateChanged, signOut } from 'firebase/auth'; 

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

function App() {
  const [user, setUser] = useState<{uid: string, email: string | null, rol: string} | null>(null);
  const [equiposA, setEquiposA] = useState<any[]>([]); 
  const [equiposB, setEquiposB] = useState<any[]>([]); 
  const [noticias, setNoticias] = useState<any[]>([]);
  const [proximosJuegos, setProximosJuegos] = useState<any[]>([]); 
  const [teamLogos, setTeamLogos] = useState<{[key: string]: string}>({});
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'dashboard' | 'equipos' | 'calendario' | 'mesa' | 'stats' | 'tabla' | 'login' | 'noticias'>('dashboard');
  
  const [noticiaIndex, setNoticiaIndex] = useState(0);
  const [juegoIndex, setJuegoIndex] = useState(0);
  const [tablaIndex, setTablaIndex] = useState(0);
  const [leaderIndex, setLeaderIndex] = useState(0);
  const [leadersList, setLeadersList] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        const superAdminEmail = 'mdiazsalas7@gmail.com'.toLowerCase();
        const isMaster = u.email?.toLowerCase() === superAdminEmail;
        onSnapshot(doc(db, 'usuarios', u.uid), (docSnap) => {
          const data = docSnap.data();
          const userRole = (isMaster || data?.rol === 'admin') ? 'admin' : 'fan';
          setUser({ uid: u.uid, email: u.email, rol: userRole });
          if (activeView === 'login') setActiveView('dashboard');
          setLoading(false);
        });
      } else { setUser(null); setLoading(false); }
    });
    return () => unsubscribe();
  }, [activeView]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const qEq = query(collection(db, "equipos"), orderBy("puntos", "desc"));
        const snapEq = await getDocs(qEq);
        const todosEq = snapEq.docs.map(d => ({ id: d.id, ...d.data() }));
        const logosMap: {[key: string]: string} = {};
        todosEq.forEach(eq => { if (eq.nombre) logosMap[eq.nombre] = eq.logoUrl || ""; });
        setTeamLogos(logosMap);
        setEquiposA(todosEq.filter(e => e.grupo === 'A' || e.grupo === 'a'));
        setEquiposB(todosEq.filter(e => e.grupo === 'B' || e.grupo === 'b'));

        const qStats = query(collection(db, 'stats_partido'));
        const snapStats = await getDocs(qStats);
        const aggregated: Record<string, any> = {};

        snapStats.forEach(docSnap => {
            const stat = docSnap.data();
            const jId = stat.jugadorId;
            if (!aggregated[jId]) {
                aggregated[jId] = {
                    nombre: stat.nombre, equipo: stat.equipo,
                    tPts: 0, tReb: 0, tRob: 0, tBloq: 0, t3p: 0, partidos: 0
                };
            }
            const acc = aggregated[jId];
            acc.tPts += (Number(stat.tirosLibres)||0) + (Number(stat.dobles)||0)*2 + (Number(stat.triples)||0)*3;
            acc.tReb += (Number(stat.rebotes)||0);
            acc.tRob += (Number(stat.robos)||0);
            acc.tBloq += (Number(stat.bloqueos)||0);
            acc.t3p += (Number(stat.triples)||0);
            acc.partidos += 1;
        });

        const list = Object.values(aggregated).map((p: any) => ({
            ...p,
            ppg: (p.tPts / p.partidos).toFixed(1),
            rpg: (p.tReb / p.partidos).toFixed(1),
            spg: (p.tRob / p.partidos).toFixed(1),
            bpg: (p.tBloq / p.partidos).toFixed(1),
            tpg: (p.t3p / p.partidos).toFixed(1),
            val: ((p.tPts + p.tReb + p.tRob + p.tBloq) / p.partidos).toFixed(1)
        }));

        if (list.length > 0) {
            // ASIGNACIÓN DE COLORES POR CATEGORÍA
            setLeadersList([
                { label: 'MVP (VALORACIÓN)', player: [...list].sort((a,b) => b.val - a.val)[0], val: [...list].sort((a,b) => b.val - a.val)[0].val, unit: 'VAL', style: 'mvp-gold' },
                { label: 'MÁXIMO ANOTADOR', player: [...list].sort((a,b) => b.ppg - a.ppg)[0], val: [...list].sort((a,b) => b.ppg - a.ppg)[0].ppg, unit: 'PPG', style: 'leader-pts' },
                { label: 'LÍDER REBOTES', player: [...list].sort((a,b) => b.rpg - a.rpg)[0], val: [...list].sort((a,b) => b.rpg - a.rpg)[0].rpg, unit: 'RPG', style: 'leader-reb' },
                { label: 'LÍDER TRIPLES', player: [...list].sort((a,b) => b.tpg - a.tpg)[0], val: [...list].sort((a,b) => b.tpg - a.tpg)[0].tpg, unit: '3PG', style: 'leader-3p' },
                { label: 'LÍDER ROBOS', player: [...list].sort((a,b) => b.spg - a.spg)[0], val: [...list].sort((a,b) => b.spg - a.spg)[0].spg, unit: 'SPG', style: 'leader-rob' },
                { label: 'LÍDER TAPONES', player: [...list].sort((a,b) => b.bpg - a.bpg)[0], val: [...list].sort((a,b) => b.bpg - a.bpg)[0].bpg, unit: 'BPG', style: 'leader-blk' }
            ]);
        }

        const qNews = query(collection(db, "noticias"), orderBy("fecha", "desc"), limit(5));
        const snapNews = await getDocs(qNews);
        setNoticias(snapNews.docs.map(d => ({ id: d.id, ...d.data() })));

        const qCal = query(collection(db, "calendario"), orderBy("fechaAsignada", "asc"));
        const snapCal = await getDocs(qCal);
        setProximosJuegos(snapCal.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.estatus !== 'finalizado').slice(0, 10));

      } catch (e) { console.error("Error en Dashboard:", e); }
    };
    fetchData();
  }, [activeView]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNoticiaIndex((prev) => (prev + 1) % (noticias.length || 1));
      setJuegoIndex((prev) => (prev + 1) % (proximosJuegos.length || 1));
      setTablaIndex((prev) => (prev + 1) % 2);
      setLeaderIndex((prev) => (prev + 1) % (leadersList.length || 1));
    }, 3000);
    return () => clearInterval(interval);
  }, [noticias, proximosJuegos, leadersList]);

  if (loading) return <div style={{background:'#f8fafc', height:'100vh', color:'#1e3a8a', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold'}}>Sincronizando Liga...</div>;

  const isAdmin = user?.rol === 'admin';

  const RenderTable = ({ title, data, color }: { title: string, data: any[], color: string }) => (
    <div className="fade-in" style={{ width: '100%', background: 'white', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', border: `2px solid ${color}` }}>
      <div style={{ background: color, padding: '10px', textAlign: 'center' }}><h4 style={{ fontSize: '0.8rem', color: 'white', margin: 0, fontWeight: '900', textTransform: 'uppercase' }}>{title}</h4></div>
      <div style={{ padding: '12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ color: '#94a3b8', borderBottom: '2px solid #f1f5f9' }}>
              <th style={{ textAlign: 'left', paddingBottom: '8px' }}>EQUIPO</th>
              <th style={{ textAlign: 'center' }}>JG</th><th style={{ textAlign: 'center' }}>JP</th><th style={{ textAlign: 'center' }}>DIF</th><th style={{ textAlign: 'center', color: color }}>PTS</th>
            </tr>
          </thead>
          <tbody>{data.map((eq, i) => {
            const diff = (Number(eq.puntos_favor) || 0) - (Number(eq.puntos_contra) || 0);
            return (
              <tr key={eq.id} style={{ borderBottom: i === data.length - 1 ? 'none' : '1px solid #f8fafc' }}>
                <td style={{ padding: '10px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontWeight: 'bold', color: '#cbd5e1', width: '15px' }}>{i + 1}</span>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid rgba(0,0,0,0.05)', padding: '3px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                    <img src={eq.logoUrl || ""} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="L" />
                  </div>
                  <span style={{ fontWeight: '800', color: '#1e293b', fontSize: '0.7rem' }}>{eq.nombre.toUpperCase()}</span>
                </td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{eq.victorias || 0}</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{eq.derrotas || 0}</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold', color: diff >= 0 ? '#10b981' : '#ef4444' }}>{diff > 0 ? `+${diff}` : diff}</td>
                <td style={{ textAlign: 'center', fontWeight: '900', color: color, fontSize: '0.85rem' }}>{eq.puntos || 0}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundImage: `linear-gradient(rgba(241, 245, 249, 0.35), rgba(241, 245, 249, 0.5)), url('https://i.postimg.cc/wjPRcBLL/download.jpg')`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed', color: '#1e293b', fontFamily: 'sans-serif', paddingBottom: '110px' }}>
      
      <header style={{ height: '65px', background: '#f8fafc', display: 'flex', alignItems: 'center', padding: '0 15px', justifyContent: 'space-between', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 1000 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{ position: 'relative' }}>
            <img src="https://i.postimg.cc/hhF5fTPn/image.png" alt="Logo" style={{ height: '45px', cursor: 'pointer' }} onClick={() => !user && setActiveView('login')} />
            {!isAdmin && <button onClick={() => setActiveView('login')} style={{ position: 'absolute', bottom: '-5px', right: '-5px', background: '#1e3a8a', color: 'white', border: '2px solid white', borderRadius: '50%', width: '22px', height: '22px', fontSize: '0.6rem', cursor: 'pointer' }}>🔑</button>}
          </div>
          <h1 style={{ fontSize: '0.8rem', fontWeight: 900, color: '#1e3a8a', textTransform: 'uppercase', lineHeight: '1.1' }}>LIGA METROPOLITANA<br/>EJE ESTE</h1>
        </div>
        {user && <button onClick={() => { signOut(auth); setUser(null); setActiveView('dashboard'); }} style={{background:'#fef2f2', border:'1px solid #fee2e2', color:'#ef4444', padding:'6px 12px', borderRadius:'10px', fontSize:'0.65rem', fontWeight:'bold'}}>SALIR</button>}
      </header>

      <main style={{ padding: '15px', maxWidth: '600px', margin: '0 auto' }}>
        {activeView === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: '12px' }}>
              <div>
                <p style={{ fontSize: '0.65rem', fontWeight: '900', color: '#1e3a8a', marginBottom: '8px', textTransform: 'uppercase' }}>📢 Prensa Oficial</p>
                <div onClick={() => setActiveView('noticias')} style={{ background: 'white', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', border: '2px solid #1e3a8a', position: 'relative', cursor: 'pointer' }}>
                  <div style={{ height: '100px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {noticias.length > 0 && <img key={noticias[noticiaIndex].id} src={noticias[noticiaIndex].imageUrl || 'https://i.postimg.cc/wjPRcBLL/download.jpg'} className="fade-in" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                  </div>
                  <div style={{ padding: '6px', background: '#1e3a8a', minHeight: '35px', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <p style={{ fontSize: '0.55rem', fontWeight: '800', margin: 0, color: 'white', textAlign: 'center' }}>{noticias[noticiaIndex]?.titulo.toUpperCase()}</p>
                  </div>
                </div>
              </div>

              <div>
                <p style={{ fontSize: '0.65rem', fontWeight: '900', color: '#1e3a8a', marginBottom: '8px', textTransform: 'uppercase' }}>📅 Próximos Juegos</p>
                <div onClick={() => setActiveView('calendario')} style={{ background: '#1e3a8a', borderRadius: '18px', padding: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', border: '2px solid white', cursor: 'pointer', height: '141px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  {proximosJuegos.length > 0 ? (
                    <div key={juegoIndex} className="fade-in" style={{ textAlign: 'center' }}>
                      <p style={{ color: '#f59e0b', fontSize: '0.55rem', fontWeight: '900', margin: '0 0 2px 0' }}>{proximosJuegos[juegoIndex].fechaAsignada}</p>
                      <p style={{ color: 'white', fontSize: '0.8rem', fontWeight: '900', marginBottom: '10px' }}>🕒 {proximosJuegos[juegoIndex].hora || 'POR DEFINIR'}</p>
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px' }}>
                        <div style={{ textAlign: 'center', flex: 1 }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', border: '2px solid rgba(255,255,255,0.8)', padding: '3px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
                            <img src={teamLogos[proximosJuegos[juegoIndex].equipoLocalNombre]} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          </div>
                          <p style={{ color: 'white', fontSize: '0.45rem', fontWeight: 'bold', marginTop: '5px' }}>{proximosJuegos[juegoIndex].equipoLocalNombre.toUpperCase()}</p>
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.7rem', fontWeight: 900 }}>VS</p>
                        <div style={{ textAlign: 'center', flex: 1 }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', border: '2px solid rgba(255,255,255,0.8)', padding: '3px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
                            <img src={teamLogos[proximosJuegos[juegoIndex].equipoVisitanteNombre]} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          </div>
                          <p style={{ color: 'white', fontSize: '0.45rem', fontWeight: 'bold', marginTop: '5px' }}>{proximosJuegos[juegoIndex].equipoVisitanteNombre.toUpperCase()}</p>
                        </div>
                      </div>
                    </div>
                  ) : <p style={{color:'white', fontSize:'0.5rem', textAlign:'center'}}>Cargando agenda...</p>}
                </div>
              </div>
            </div>

            {/* CARRUSEL DE LÍDERES MULTICOLOR */}
            <section>
              <p style={{ fontSize: '0.65rem', fontWeight: '900', color: '#1e3a8a', marginBottom: '8px', textTransform: 'uppercase' }}>⭐ Rendimiento Individual</p>
              <div onClick={() => setActiveView('stats')} style={{ cursor: 'pointer' }}>
                {leadersList.length > 0 ? (
                  <div key={leaderIndex} className={`card-leader ${leadersList[leaderIndex].style} fade-in`}>
                    <span className="badge">{leadersList[leaderIndex].label}</span>
                    {teamLogos[leadersList[leaderIndex].player?.equipo?.toUpperCase()] && (
                        <img src={teamLogos[leadersList[leaderIndex].player.equipo.toUpperCase()]} className="team-logo-card" alt="Logo" />
                    )}
                    <div className="content">
                        <p className="full-name">{leadersList[leaderIndex].player?.nombre || '---'}</p>
                        <p className="value">{leadersList[leaderIndex].val || 0} <small>{leadersList[leaderIndex].unit}</small></p>
                    </div>
                  </div>
                ) : <div className="card-leader score">Analizando mesa técnica...</div>}
              </div>
            </section>

            <section>
                <p style={{ fontSize: '0.65rem', fontWeight: '900', color: '#1e3a8a', marginBottom: '8px', textTransform: 'uppercase' }}>🏆 Posiciones de la Liga</p>
                <div onClick={() => setActiveView('tabla')} style={{ cursor: 'pointer' }}>
                  {tablaIndex === 0 ? (
                    equiposA.length > 0 && <RenderTable title="GRUPO A - ÉLITE" data={equiposA} color="#1e3a8a" />
                  ) : (
                    equiposB.length > 0 && <RenderTable title="GRUPO B - PRO" data={equiposB} color="#d97706" />
                  )}
                </div>
            </section>

            {isAdmin && (
              <div style={{ padding: '15px', background: '#1e3a8a', borderRadius: '24px', color: 'white', border: '2px solid white', boxShadow: '0 8px 16px rgba(30,58,138,0.2)' }}>
                <p style={{ textAlign: 'center', margin: '0 0 10px 0', fontWeight: 900, fontSize:'0.65rem' }}>⚙️ PANEL DE CONTROL MASTER</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button className="admin-btn-white-border" onClick={() => setActiveView('mesa')}>⏱️ MESA TÉCNICA</button>
                  <button className="admin-btn-white-border" onClick={() => setActiveView('equipos')}>🛡️ GESTIÓN F21</button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeView === 'noticias' && (isAdmin ? <NewsAdmin onClose={() => setActiveView('dashboard')} /> : <NewsFeed onClose={() => setActiveView('dashboard')} />)}
        {activeView === 'equipos' && (isAdmin ? <AdminEquipos onClose={() => setActiveView('dashboard')} /> : <TeamsPublicViewer onClose={() => setActiveView('dashboard')} />)}
        {activeView === 'calendario' && <CalendarViewer rol={isAdmin ? 'admin' : 'fan'} onClose={() => setActiveView('dashboard')} />}
        {activeView === 'stats' && <StatsViewer onClose={() => setActiveView('dashboard')} />}
        {activeView === 'tabla' && <StandingsViewer equipos={[...equiposA, ...equiposB]} onClose={() => setActiveView('dashboard')} />}
        {activeView === 'mesa' && isAdmin && <MesaTecnica onClose={() => setActiveView('dashboard')} />}
        {activeView === 'login' && (
          <div style={{ padding: '20px', background: 'white', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <Login />
            <button onClick={() => setActiveView('dashboard')} style={{ width: '100%', marginTop: '15px', background: 'none', border: 'none', color: '#94a3b8', fontWeight: 'bold', cursor: 'pointer' }}>← VOLVER</button>
          </div>
        )}
      </main>

      <nav style={{ position: 'fixed', bottom: '15px', left: '15px', right: '15px', background: '#1e3a8a', height: '70px', display: 'flex', justifyContent: 'space-around', alignItems: 'center', borderRadius: '20px', border: '2px solid white', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 1000 }}>
          {[
            { v: 'calendario', i: '📅', l: 'Calendario' },
            { v: 'tabla', i: '🏆', l: 'Tablas' },
            { v: 'dashboard', i: '🏠', l: 'Inicio' },
            { v: 'stats', i: '📊', l: 'Líderes' },
            { v: 'noticias', i: '📰', l: 'Noticias' }
          ].map(item => (
            <button key={item.v} onClick={() => setActiveView(item.v as any)} style={{ background: activeView === item.v ? 'rgba(255,255,255,0.2)' : 'none', border: activeView === item.v ? '1px solid white' : 'none', borderRadius: '12px', padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'white', cursor: 'pointer' }}>
              <span style={{ fontSize: '1.3rem' }}>{item.i}</span>
              <span style={{ fontSize: '0.55rem', fontWeight: 'bold' }}>{item.l}</span>
            </button>
          ))}
      </nav>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .fade-in { animation: fadeInEffect 0.8s ease-in-out; }
        @keyframes fadeInEffect { from { opacity: 0.2; } to { opacity: 1; } }
        .card-leader { padding: 15px; border-radius: 20px; color: white; position: relative; overflow: hidden; height: 100px; display: flex; align-items: flex-end; box-shadow: 0 8px 20px rgba(0,0,0,0.15); transition: 0.3s; }
        .score { background: linear-gradient(135deg, #1e3a8a, #3b82f6); }
        .mvp-gold { background: linear-gradient(135deg, #f59e0b, #d97706); }
        /* NUEVOS COLORES PARA LÍDERES */
        .leader-pts { background: linear-gradient(135deg, #ef4444, #991b1b); } /* Rojo */
        .leader-reb { background: linear-gradient(135deg, #10b981, #065f46); } /* Verde */
        .leader-3p { background: linear-gradient(135deg, #8b5cf6, #5b21b6); } /* Morado */
        .leader-rob { background: linear-gradient(135deg, #6366f1, #3730a3); } /* Azul Cobalto */
        .leader-blk { background: linear-gradient(135deg, #f43f5e, #9f1239); } /* Rosa Fuerte */
        
        .badge { position: absolute; top: 10px; left: 15px; font-size: 0.55rem; font-weight: 900; background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 6px; z-index: 2; }
        .team-logo-card { position: absolute; top: 10px; right: 10px; width: 45px; height: 45px; object-fit: contain; border-radius: 50%; background: white; border: 2px solid rgba(255,255,255,0.8); padding: 4px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); z-index: 1; }
        .full-name { font-size: 0.9rem; font-weight: 900; margin: 0; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; position: relative; z-index: 2; }
        .value { font-size: 1.4rem; font-weight: 900; margin: 0; position: relative; z-index: 2; }
        .value small { font-size: 0.7rem; opacity: 0.8; }
        .admin-btn-white-border { background: rgba(255,255,255,0.1); color: white; border: 1px solid white; padding: 10px; border-radius: 12px; font-weight: bold; cursor: pointer; font-size: 0.65rem; text-transform: uppercase; }
      `}</style>
    </div>
  );
}

export default App;