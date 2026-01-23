import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, onSnapshot, orderBy, deleteDoc, doc, getDocs, writeBatch, where } from 'firebase/firestore';
import MatchForm from './MatchForm'; 

const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/451/451716.png";

// --- COMPONENTE INTERNO: BOX SCORE (Resumen del Partido) ---
const BoxScoreModal = ({ match, onClose }: any) => {
    const [stats, setStats] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            const q = query(collection(db, 'stats_partido'), where('partidoId', '==', match.id));
            const snap = await getDocs(q);
            setStats(snap.docs.map(d => d.data()));
            setLoading(false);
        };
        fetchStats();
    }, [match.id]);

    const renderTable = (teamName: string) => {
        const players = stats.filter(s => s.equipo === teamName);
        return (
            <div style={{ marginBottom: '20px' }}>
                <div style={{ background: '#1e3a8a', color: 'white', padding: '10px', fontWeight: 'bold', fontSize: '0.9rem', borderRadius: '4px 4px 0 0' }}>{teamName}</div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'center' }}>
                        <thead style={{ background: '#f1f5f9' }}>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '10px' }}>JUGADOR</th>
                                <th>PTS</th><th>3P</th><th>REB</th><th>AST</th><th>ROB</th><th>F</th>
                            </tr>
                        </thead>
                        <tbody>
                            {players.map((p, i) => {
                                const pts = (Number(p.tirosLibres)||0) + (Number(p.dobles)||0)*2 + (Number(p.triples)||0)*3;
                                return (
                                    <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ textAlign: 'left', padding: '10px', fontWeight: 'bold' }}>{p.nombre}</td>
                                        <td style={{ background: '#fdf2f2', fontWeight: 'bold', fontSize: '1rem' }}>{pts}</td>
                                        <td>{p.triples || 0}</td>
                                        <td>{p.rebotes || 0}</td>
                                        <td>{p.asistencias || 0}</td>
                                        <td>{p.robos || 0}</td>
                                        <td style={{ color: p.faltas >= 5 ? 'red' : 'black', fontWeight: p.faltas >= 5 ? 'bold' : 'normal' }}>{p.faltas || 0}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 3000, display: 'flex', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}>
            <div style={{ background: 'white', width: '100%', maxWidth: '700px', borderRadius: '12px', height: 'fit-content', overflow: 'hidden' }}>
                <div style={{ padding: '15px', background: '#111', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>📊 Resumen Estadístico</h3>
                    <button onClick={onClose} style={{ color: 'white', background: 'none', border: '1px solid white', borderRadius: '4px', padding: '5px 10px', cursor: 'pointer' }}>CERRAR</button>
                </div>
                <div style={{ padding: '15px' }}>
                    {loading ? <p style={{textAlign:'center', padding:'20px'}}>Cargando estadísticas...</p> : (
                        <>
                            {renderTable(match.equipoLocalNombre)}
                            {renderTable(match.equipoVisitanteNombre)}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---
const CalendarViewer: React.FC<{ rol: string, onClose: () => void }> = ({ rol, onClose }) => {
    const [matches, setMatches] = useState<Match[]>([]);
    const [equipos, setEquipos] = useState<Equipo[]>([]);
    const [loading, setLoading] = useState(true);
    const [showMatchForm, setShowMatchForm] = useState(false); 
    const [selectedBoxScore, setSelectedBoxScore] = useState<Match | null>(null);

    useEffect(() => {
        const qM = query(collection(db, 'calendario'), orderBy('fechaAsignada', 'asc'));
        const unsubMatches = onSnapshot(qM, (snap) => {
            setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
        });

        const qE = query(collection(db, 'equipos'), orderBy('nombre', 'asc'));
        const unsubEquipos = onSnapshot(qE, (snap) => {
            setEquipos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Equipo)));
            setLoading(false);
        });

        return () => { unsubMatches(); unsubEquipos(); };
    }, []);

    const handleResetSeason = async () => {
        if (!window.confirm("⚠️ ATENCIÓN: Se borrarán TODOS los juegos y se pondrán en CERO las estadísticas de jugadores y equipos. ¿Continuar?")) return;
        if (!window.confirm("¿Estás REALMENTE seguro? No hay vuelta atrás.")) return;
        
        setLoading(true);
        try {
            const batch = writeBatch(db);
            const snapC = await getDocs(collection(db, 'calendario'));
            const snapS = await getDocs(collection(db, 'stats_partido'));
            const snapE = await getDocs(collection(db, 'equipos'));
            const snapJ = await getDocs(collection(db, 'jugadores'));

            snapC.docs.forEach(d => batch.delete(d.ref));
            snapS.docs.forEach(d => batch.delete(d.ref));
            snapE.docs.forEach(d => batch.update(d.ref, { victorias: 0, derrotas: 0, puntos: 0, puntos_favor: 0, puntos_contra: 0 }));
            snapJ.docs.forEach(d => batch.update(d.ref, { puntos: 0, triples: 0, dobles: 0, tirosLibres: 0, rebotes: 0, asistencias: 0, robos: 0, partidosJugados: 0 }));

            await batch.commit();
            alert("✅ Temporada reiniciada. Todo está en cero.");
        } catch (e) { alert("Error al reiniciar."); }
        setLoading(false);
    };

    const getLogo = (teamId: string) => equipos.find(e => e.id === teamId)?.logoUrl || DEFAULT_LOGO;

    const handleDelete = async (id: string) => {
        if(window.confirm("¿Eliminar este juego?")) await deleteDoc(doc(db, 'calendario', id));
    };

    const grupoA = equipos.filter(e => e.grupo === 'A');
    const grupoB = equipos.filter(e => e.grupo === 'B');

    if (loading) return <div style={{padding:'50px', color:'#1e3a8a', textAlign:'center', fontWeight:'bold'}}>PROCESANDO...</div>;

    return (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'#f3f4f6', zIndex:1000, display:'flex', flexDirection:'column' }}>
            
            {selectedBoxScore && <BoxScoreModal match={selectedBoxScore} onClose={() => setSelectedBoxScore(null)} />}

            <div style={{background:'#1e3a8a', color:'white', padding:'15px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0}}>
                <h2 style={{margin:0, fontSize:'1.2rem', fontWeight:'bold'}}>📅 Calendario Oficial</h2>
                <div style={{display:'flex', gap:'10px'}}>
                    {rol === 'admin' && (
                        <button onClick={handleResetSeason} style={{background:'#ef4444', color:'white', border:'none', padding:'6px 12px', borderRadius:'4px', cursor:'pointer', fontSize:'0.7rem', fontWeight:'bold'}}>REINICIAR TORNEO</button>
                    )}
                    <button onClick={onClose} style={{background:'rgba(255,255,255,0.2)', border:'none', color:'white', padding:'6px 15px', borderRadius:'4px', cursor:'pointer'}}>CERRAR</button>
                </div>
            </div>

            <div style={{flex:1, overflowY:'auto', padding:'20px'}}>
                <div style={{maxWidth:'900px', margin:'0 auto'}}>

                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px', marginBottom:'25px'}}>
                        <div style={{background:'white', padding:'15px', borderRadius:'12px', boxShadow:'0 2px 8px rgba(0,0,0,0.05)', borderTop:'5px solid #3b82f6'}}>
                            <h4 style={{marginTop:0, color:'#1e3a8a', textAlign:'center', fontSize:'0.9rem'}}>GRUPO A</h4>
                            <div style={{display:'flex', gap:'10px', overflowX:'auto', padding:'10px 0'}}>
                                {grupoA.map(eq => (
                                    <div key={eq.id} style={{textAlign:'center', minWidth:'65px'}}>
                                        <img src={eq.logoUrl || DEFAULT_LOGO} style={{width:'40px', height:'40px', borderRadius:'50%', objectFit:'cover', border:'1px solid #ddd'}} />
                                        <div style={{fontSize:'0.6rem', fontWeight:'bold', marginTop:'4px'}}>{eq.nombre}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{background:'white', padding:'15px', borderRadius:'12px', boxShadow:'0 2px 8px rgba(0,0,0,0.05)', borderTop:'5px solid #ef4444'}}>
                            <h4 style={{marginTop:0, color:'#1e3a8a', textAlign:'center', fontSize:'0.9rem'}}>GRUPO B</h4>
                            <div style={{display:'flex', gap:'10px', overflowX:'auto', padding:'10px 0'}}>
                                {grupoB.map(eq => (
                                    <div key={eq.id} style={{textAlign:'center', minWidth:'65px'}}>
                                        <img src={eq.logoUrl || DEFAULT_LOGO} style={{width:'40px', height:'40px', borderRadius:'50%', objectFit:'cover', border:'1px solid #ddd'}} />
                                        <div style={{fontSize:'0.6rem', fontWeight:'bold', marginTop:'4px'}}>{eq.nombre}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {rol === 'admin' && (
                        <button onClick={() => setShowMatchForm(true)} style={{ width:'100%', padding:'15px', background:'#10b981', color:'white', border:'none', borderRadius:'12px', fontWeight:'bold', fontSize:'1rem', cursor:'pointer', marginBottom:'20px' }}>
                            ➕ AGENDAR NUEVO JUEGO
                        </button>
                    )}

                    <h3 style={{color:'#1e3a8a', fontSize:'1rem', marginBottom:'15px', fontWeight:'bold'}}>🏀 CARTELERA DE JUEGOS</h3>
                    
                    <div style={{display:'flex', flexDirection:'column', gap:'12px', paddingBottom:'40px'}}>
                        {matches.map(m => {
                            const isFinished = m.estatus === 'finalizado';
                            return (
                                <div key={m.id} style={{
                                    background:'white', padding:'15px', borderRadius:'10px', 
                                    boxShadow:'0 2px 5px rgba(0,0,0,0.05)', display:'flex', 
                                    alignItems:'center', borderLeft:`6px solid ${isFinished ? '#1f2937' : (m.grupo === 'A' ? '#3b82f6' : '#ef4444')}`
                                }}>
                                    <div style={{flex:1, textAlign:'center'}}>
                                        <img src={getLogo(m.equipoLocalId)} style={{width:'40px', height:'40px', borderRadius:'50%', objectFit:'cover'}} />
                                        <div style={{fontWeight:'bold', fontSize:'0.8rem'}}>{m.equipoLocalNombre}</div>
                                        {isFinished && <div style={{fontSize:'1.8rem', fontWeight:'900', color:'#1e3a8a'}}>{m.marcadorLocal}</div>}
                                    </div>

                                    <div style={{flex:1.2, textAlign:'center', borderLeft:'1px solid #eee', borderRight:'1px solid #eee', padding:'0 10px'}}>
                                        <span style={{background: isFinished ? '#1f2937' : '#f1f5f9', color: isFinished ? 'white' : '#475569', fontSize:'0.6rem', padding:'3px 10px', borderRadius:'20px', fontWeight:'bold', textTransform:'uppercase'}}>
                                            {isFinished ? 'Finalizado' : `Grupo ${m.grupo}`}
                                        </span>
                                        <div style={{fontSize:'0.8rem', fontWeight:'bold', color:'#1e3a8a', marginTop:'6px'}}>{m.fechaAsignada}</div>
                                        {isFinished ? (
                                            <button onClick={() => setSelectedBoxScore(m)} style={{marginTop:'8px', background:'#1e3a8a', color:'white', border:'none', padding:'6px 12px', borderRadius:'4px', fontSize:'0.7rem', fontWeight:'bold', cursor:'pointer'}}>📊 BOX SCORE</button>
                                        ) : (
                                            rol === 'admin' && <button onClick={() => handleDelete(m.id)} style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'0.7rem', marginTop:'8px', textDecoration:'underline'}}>Eliminar</button>
                                        )}
                                    </div>

                                    <div style={{flex:1, textAlign:'center'}}>
                                        <img src={getLogo(m.equipoVisitanteId)} style={{width:'40px', height:'40px', borderRadius:'50%', objectFit:'cover'}} />
                                        <div style={{fontWeight:'bold', fontSize:'0.8rem'}}>{m.equipoVisitanteNombre}</div>
                                        {isFinished && <div style={{fontSize:'1.8rem', fontWeight:'900', color:'#1e3a8a'}}>{m.marcadorVisitante}</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {showMatchForm && (
                <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.85)', zIndex:2000, display:'flex', justifyContent:'center', alignItems:'center', padding:'20px'}}>
                    <div style={{width:'100%', maxWidth:'500px'}}><MatchForm onSuccess={() => setShowMatchForm(false)} onClose={() => setShowMatchForm(false)} /></div>
                </div>
            )}
        </div>
    );
};

export default CalendarViewer;