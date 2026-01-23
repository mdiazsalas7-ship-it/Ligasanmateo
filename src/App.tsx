import { useEffect, useState } from 'react';
import './App.css'; 
import { db, auth } from './firebase'; 
import { doc, onSnapshot, collection, query, orderBy, getDocs } from 'firebase/firestore'; 
import { onAuthStateChanged, signOut } from 'firebase/auth'; 

// Componentes
import Login from './Login';
import AdminEquipos from './AdminEquipos'; 
import CalendarViewer from './CalendarViewer'; 
import MesaTecnica from './MesaTecnica'; 
import StatsViewer from './StatsViewer'; 
import StandingsViewer from './StandingsViewer'; 
import TeamsPublicViewer from './TeamsPublicViewer';

// TUS ARCHIVOS DE NOTICIAS
import NewsAdmin from './NewsAdmin'; 
import NewsFeed from './NewsFeed';

function App() {
  const [user, setUser] = useState<{uid: string, email: string | null, rol: string} | null>(null);
  const [equipos, setEquipos] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'dashboard' | 'equipos' | 'calendario' | 'mesa' | 'stats' | 'tabla' | 'login' | 'noticias'>('dashboard');

  // 1. SESIÓN CON LLAVE MAESTRA PARA MANUEL
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
      } else { 
        setUser(null); 
        setLoading(false); 
      }
    });
    return () => unsubscribe();
  }, [activeView]);

  // 2. CARGA DE EQUIPOS PARA POSICIONES
  useEffect(() => {
    const fetchEquipos = async () => {
      try {
        const q = query(collection(db, "equipos"), orderBy("puntos", "desc"));
        const snap = await getDocs(q);
        setEquipos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
    };
    fetchEquipos();
  }, [activeView]);

  if (loading) return <div style={{background:'#0f172a', height:'100vh', color:'white', display:'flex', alignItems:'center', justifyContent:'center'}}>Sincronizando Liga...</div>;

  const isAdmin = user?.rol === 'admin' || user?.email?.toLowerCase() === 'mdiazsalas7@gmail.com';

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', color: '#1e293b', fontFamily: 'sans-serif' }}>
      
      {/* HEADER */}
      <header style={{ background: '#1e3a8a', color: 'white', padding: '20px', textAlign: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <img src="https://i.postimg.cc/qMsBxr6P/image.png" alt="Logo" style={{ height: '60px', marginBottom: '10px' }} />
        <h1 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 900 }}>LIGA SAN MATEO</h1>
        
        <div style={{marginTop:'10px'}}>
          {user ? (
            <div style={{display:'flex', justifyContent:'center', alignItems:'center', gap:'10px'}}>
               <span style={{fontSize:'0.6rem', background: isAdmin ? '#ef4444' : 'rgba(255,255,255,0.2)', padding:'4px 12px', borderRadius:'20px', fontWeight:'bold'}}>
                  MODO: {isAdmin ? 'ADMINISTRADOR' : 'VISITANTE'}
               </span>
               <button onClick={() => { signOut(auth); setActiveView('dashboard'); }} style={{background:'none', border:'1px solid white', color:'white', padding:'2px 8px', borderRadius:'10px', cursor:'pointer', fontSize:'0.7rem'}}>Salir</button>
            </div>
          ) : (
            <button onClick={() => setActiveView('login')} style={{background:'rgba(255,255,255,0.1)', border:'1px solid white', color:'white', padding:'4px 12px', borderRadius:'20px', fontSize:'0.7rem', cursor:'pointer'}}>🔑 Acceso Admin</button>
          )}
        </div>
      </header>

      {/* DASHBOARD */}
      <main style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
        
        {activeView === 'dashboard' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
            
            <button className="menu-card" onClick={() => setActiveView('calendario')}>
              <span className="icon">📅</span>
              <span className="label">CALENDARIO</span>
            </button>

            <button className="menu-card" onClick={() => setActiveView('tabla')}>
              <span className="icon">🏆</span>
              <span className="label">POSICIONES</span>
            </button>

            <button className="menu-card" onClick={() => setActiveView('stats')}>
              <span className="icon">📊</span>
              <span className="label">LÍDERES</span>
            </button>

            <button className="menu-card" style={{border:'1px solid #f59e0b'}} onClick={() => setActiveView('noticias')}>
              <span className="icon">📰</span>
              <span className="label" style={{color:'#d97706'}}>NOTICIAS</span>
            </button>

            <button className="menu-card" onClick={() => setActiveView('equipos')}>
              <span className="icon">🛡️</span>
              <span className="label">EQUIPOS</span>
            </button>

            {isAdmin && (
              <div style={{ gridColumn: '1 / -1', marginTop: '20px', padding: '20px', background: '#fee2e2', borderRadius: '20px', border: '2px dashed #ef4444' }}>
                <p style={{ textAlign: 'center', margin: '0 0 15px 0', fontWeight: '900', color: '#b91c1c', fontSize:'0.8rem' }}>⚙️ PANEL DE CONTROL</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button className="admin-btn" onClick={() => setActiveView('mesa')}>⏱️ MESA TÉCNICA</button>
                  <button className="admin-btn" onClick={() => setActiveView('equipos')}>🛡️ GESTIÓN F21</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODAL LOGIN */}
        {activeView === 'login' && (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.9)', zIndex:5000, display:'flex', justifyContent:'center', alignItems:'center' }}>
            <div style={{ background:'white', padding:'20px', borderRadius:'15px', width:'90%', maxWidth:'400px' }}>
              <Login />
              <button onClick={() => setActiveView('dashboard')} style={{ width:'100%', marginTop:'10px', background:'none', border:'none', color:'#666', cursor:'pointer' }}>Volver</button>
            </div>
          </div>
        )}

        {/* COMPONENTES DE NOTICIAS */}
        {activeView === 'noticias' && (
          isAdmin 
            ? <NewsAdmin onClose={() => setActiveView('dashboard')} /> 
            : <NewsFeed onClose={() => setActiveView('dashboard')} />
        )}

        {/* RESTO DE COMPONENTES */}
        {activeView === 'equipos' && (isAdmin ? <AdminEquipos onClose={() => setActiveView('dashboard')} /> : <TeamsPublicViewer onClose={() => setActiveView('dashboard')} />)}
        {activeView === 'calendario' && <CalendarViewer rol={isAdmin ? 'admin' : 'fan'} onClose={() => setActiveView('dashboard')} />}
        {activeView === 'stats' && <StatsViewer onClose={() => setActiveView('dashboard')} />}
        {activeView === 'tabla' && <StandingsViewer equipos={equipos} onClose={() => setActiveView('dashboard')} />}
        {activeView === 'mesa' && isAdmin && <MesaTecnica onClose={() => setActiveView('dashboard')} />}
      </main>

      <style>{`
        .menu-card { background: white; border: 1px solid #e2e8f0; border-radius: 20px; padding: 30px 10px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.02); }
        .menu-card:active { transform: scale(0.95); background: #f1f5f9; }
        .menu-card .icon { font-size: 2.5rem; }
        .menu-card .label { font-weight: 800; font-size: 0.8rem; color: #1e3a8a; }
        .admin-btn { background: #b91c1c; color: white; border: none; padding: 15px; border-radius: 12px; font-weight: bold; cursor: pointer; font-size: 0.75rem; }
      `}</style>
    </div>
  );
}

export default App;