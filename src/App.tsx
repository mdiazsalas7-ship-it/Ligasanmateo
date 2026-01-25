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

  if (loading) return <div style={{background:'#f8fafc', height:'100vh', color:'#1e3a8a', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:'bold'}}>Sincronizando Liga...</div>;

  const isAdmin = user?.rol === 'admin' || user?.email?.toLowerCase() === 'mdiazsalas7@gmail.com';

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.85), rgba(240, 244, 248, 0.9)), url('https://i.postimg.cc/wjPRcBLL/download.jpg')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      color: '#1e293b', 
      fontFamily: 'sans-serif' 
    }}>
      
      {/* HEADER CLARO ACTUALIZADO */}
      <header style={{ 
        background: '#ffffff', 
        color: '#1e3a8a', 
        padding: '15px 20px', 
        textAlign: 'center', 
        boxShadow: '0 2px 10px rgba(0,0,0,0.05)', 
        borderBottom: '2px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 1000
      }}>
        <img src="https://i.postimg.cc/hhF5fTPn/image.png" alt="Logo" style={{ height: '55px', marginBottom: '5px' }} />
        <h1 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 900, letterSpacing: '0.5px', color: '#111827' }}>
            LIGA METROPOLITANA EJE ESTE
        </h1>
        
        <div style={{marginTop:'8px'}}>
          {user ? (
            <div style={{display:'flex', justifyContent:'center', alignItems:'center', gap:'10px'}}>
               <span style={{fontSize:'0.65rem', background: isAdmin ? '#1e3a8a' : '#f1f5f9', color: isAdmin ? 'white' : '#64748b', padding:'4px 12px', borderRadius:'20px', fontWeight:'bold', border: isAdmin ? 'none' : '1px solid #e2e8f0'}}>
                  MODO: {isAdmin ? 'ADMINISTRADOR' : 'VISITANTE'}
               </span>
               <button onClick={() => { signOut(auth); setActiveView('dashboard'); }} style={{background:'#fef2f2', border:'1px solid #fee2e2', color:'#ef4444', padding:'4px 10px', borderRadius:'8px', cursor:'pointer', fontSize:'0.65rem', fontWeight:'bold'}}>Cerrar Sesión</button>
            </div>
          ) : (
            <button onClick={() => setActiveView('login')} style={{background:'#f1f5f9', border:'1px solid #e2e8f0', color:'#1e3a8a', padding:'6px 15px', borderRadius:'20px', fontSize:'0.7rem', cursor:'pointer', fontWeight:'bold'}}>🔑 ACCESO ADMINISTRACIÓN</button>
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

            <button className="menu-card" style={{borderBottom:'4px solid #f59e0b'}} onClick={() => setActiveView('noticias')}>
              <span className="icon">📰</span>
              <span className="label" style={{color:'#d97706'}}>NOTICIAS</span>
            </button>

            <button className="menu-card" onClick={() => setActiveView('equipos')}>
              <span className="icon">🛡️</span>
              <span className="label">EQUIPOS</span>
            </button>

            {isAdmin && (
              <div style={{ gridColumn: '1 / -1', marginTop: '20px', padding: '20px', background: 'white', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.05)' }}>
                <p style={{ textAlign: 'center', margin: '0 0 15px 0', fontWeight: '900', color: '#1e3a8a', fontSize:'0.75rem', textTransform: 'uppercase', letterSpacing: '1px' }}>⚙️ Panel de Gestión Oficial</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button className="admin-btn" style={{background: '#1e3a8a'}} onClick={() => setActiveView('mesa')}>⏱️ MESA TÉCNICA</button>
                  <button className="admin-btn" style={{background: '#334155'}} onClick={() => setActiveView('equipos')}>🛡️ GESTIÓN F21</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODAL LOGIN */}
        {activeView === 'login' && (
          <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(255,255,255,0.9)', zIndex:5000, display:'flex', justifyContent:'center', alignItems:'center', backdropFilter: 'blur(8px)' }}>
            <div style={{ background:'white', padding:'30px', borderRadius:'24px', width:'90%', maxWidth:'400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
              <Login />
              <button onClick={() => setActiveView('dashboard')} style={{ width:'100%', marginTop:'15px', background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontWeight: 'bold' }}>← Volver al inicio</button>
            </div>
          </div>
        )}

        {/* OTROS COMPONENTES */}
        {activeView === 'noticias' && (isAdmin ? <NewsAdmin onClose={() => setActiveView('dashboard')} /> : <NewsFeed onClose={() => setActiveView('dashboard')} />)}
        {activeView === 'equipos' && (isAdmin ? <AdminEquipos onClose={() => setActiveView('dashboard')} /> : <TeamsPublicViewer onClose={() => setActiveView('dashboard')} />)}
        {activeView === 'calendario' && <CalendarViewer rol={isAdmin ? 'admin' : 'fan'} onClose={() => setActiveView('dashboard')} />}
        {activeView === 'stats' && <StatsViewer onClose={() => setActiveView('dashboard')} />}
        {activeView === 'tabla' && <StandingsViewer equipos={equipos} onClose={() => setActiveView('dashboard')} />}
        {activeView === 'mesa' && isAdmin && <MesaTecnica onClose={() => setActiveView('dashboard')} />}
      </main>

      <style>{`
        .menu-card { 
          background: #ffffff; 
          border: 1px solid #f1f5f9; 
          border-radius: 24px; 
          padding: 25px 10px; 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
          justify-content: center; 
          gap: 8px; 
          cursor: pointer; 
          transition: all 0.2s ease; 
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); 
        }
        .menu-card:active { transform: scale(0.96); background: #f8fafc; }
        .menu-card .icon { font-size: 2rem; }
        .menu-card .label { font-weight: 800; font-size: 0.75rem; color: #1e3a8a; text-transform: uppercase; }
        .admin-btn { color: white; border: none; padding: 14px; border-radius: 12px; font-weight: 900; cursor: pointer; font-size: 0.7rem; text-transform: uppercase; }
      `}</style>
    </div>
  );
}

export default App;