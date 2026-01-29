import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, onSnapshot, orderBy, deleteDoc, doc, getDocs, where } from 'firebase/firestore';
import MatchForm from './MatchForm'; 

const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/451/451716.png";

// --- COMPONENTE INTERNO: BOX SCORE ---
const BoxScoreModal = ({ match, onClose, getLogo }: any) => {
    const [stats, setStats] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const q = query(collection(db, 'stats_partido'), where('partidoId', '==', match.id));
                const snap = await getDocs(q);
                setStats(snap.docs.map(d => d.data()));
            } catch(e) { console.error(e); }
            setLoading(false);
        };
        fetchStats();
    }, [match.id]);

    const renderTable = (teamName: string, teamColor: string) => {
        const players = stats.filter(s => s.equipo === teamName);
        return (
            <div style={{ marginBottom: '25px' }}>
                <div style={{ background: teamColor, color: 'white', padding: '10px', fontWeight: 'bold', fontSize: '0.9rem', borderRadius: '12px 12px 0 0', textTransform: 'uppercase' }}>{teamName}</div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'center', color: '#334155' }}>
                        <thead style={{ background: '#f8fafc', color: '#64748b', borderBottom: '2px solid #f1f5f9' }}>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '12px' }}>JUGADOR</th>
                                <th style={{ color: teamColor }}>PTS</th>
                                <th>2P</th><th>3P</th><th>TL</th><th>REB</th><th>TAP</th><th>ROB</th>
                            </tr>
                        </thead>
                        <tbody>
                            {players.map((p, i) => {
                                const pts = (Number(p.tirosLibres)||0) + (Number(p.dobles)||0)*2 + (Number(p.triples)||0)*3;
                                return (
                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ textAlign: 'left', padding: '12px', fontWeight: 'bold', color: '#1e293b' }}>{p.nombre.toUpperCase()}</td>
                                        <td style={{ background: 'rgba(0,0,0,0.02)', fontWeight: '900', fontSize: '1rem', color: teamColor }}>{pts}</td>
                                        <td>{p.dobles || 0}</td>
                                        <td>{p.triples || 0}</td>
                                        <td>{p.tirosLibres || 0}</td>
                                        <td>{p.rebotes || 0}</td>
                                        <td>{p.tapones || 0}</td>
                                        <td>{p.robos || 0}</td>
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(241, 245, 249, 0.98)', zIndex: 3000, display: 'flex', justifyContent: 'center', padding: '15px', overflowY: 'auto' }}>
            <div style={{ background: '#fff', width: '100%', maxWidth: '750px', borderRadius: '25px', height: 'fit-content', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                <div style={{ padding: '15px', background: '#f8fafc', color: '#1e3a8a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', textTransform: 'uppercase' }}>📊 ESTADÍSTICAS DEL JUEGO</h3>
                    <button onClick={onClose} style={{ color: 'white', background: '#ef4444', border: 'none', borderRadius: '10px', padding: '8px 15px', cursor: 'pointer', fontWeight: 'bold', fontSize:'0.7rem' }}>CERRAR</button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '25px 15px', background: '#fff' }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'white', border: '2px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', padding: '5px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                            <img src={getLogo(match.equipoLocalId)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="L" />
                        </div>
                        <div style={{ color: '#3b82f6', fontWeight: '900', fontSize: '2rem', marginTop: '8px' }}>{match.marcadorLocal}</div>
                        <div style={{ fontSize: '0.6rem', fontWeight: '900', color: '#94a3b8' }}>LOCAL</div>
                    </div>

                    <div style={{ fontSize: '1rem', color: '#cbd5e1', fontWeight: '900' }}>VS</div>

                    <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'white', border: '2px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', padding: '5px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                            <img src={getLogo(match.equipoVisitanteId)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="V" />
                        </div>
                        <div style={{ color: '#ef4444', fontWeight: '900', fontSize: '2rem', marginTop: '8px' }}>{match.marcadorVisitante}</div>
                        <div style={{ fontSize: '0.6rem', fontWeight: '900', color: '#94a3b8' }}>VISITANTE</div>
                    </div>
                </div>

                <div style={{ padding: '0 15px 15px 15px' }}>
                    {loading ? <p style={{textAlign:'center', color: '#666', padding:'20px'}}>Cargando estadísticas...</p> : (
                        <>
                            {renderTable(match.equipoLocalNombre, '#3b82f6')}
                            {renderTable(match.equipoVisitanteNombre, '#ef4444')}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---
const CalendarViewer: React.FC<{ rol: string, onClose: () => void, categoria: string }> = ({ rol, onClose, categoria }) => {
    const [matches, setMatches] = useState<any[]>([]);
    const [equipos, setEquipos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showMatchForm, setShowMatchForm] = useState(false); 
    const [selectedBoxScore, setSelectedBoxScore] = useState<any | null>(null);
    const [activeFilter, setActiveFilter] = useState<'TODOS' | 'A' | 'B'>('TODOS');
    const [matchToEdit, setMatchToEdit] = useState<any | null>(null);

    // CATEGORÍAS QUE SON "NUEVAS" Y DEBEN EMPEZAR DE CERO
    // Todo lo que NO esté aquí, se mostrará en Master 40
    const NUEVAS_CATEGORIAS = ['U19', 'FEMENINO', 'LIBRE']; 

    useEffect(() => {
        setLoading(true);
        // 1. ESCUCHAR JUEGOS
        const qM = query(collection(db, 'calendario'), orderBy('fechaAsignada', 'asc'));
        const unsubMatches = onSnapshot(qM, (snap) => {
            const allMatches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // --- FILTRO DE HIERRO PARA QUE NO FALLE ---
            const filteredByCat = allMatches.filter(m => {
                // Normalizamos la categoría del juego (si no existe, es string vacío)
                const catJuego = (m.categoria || '').trim().toUpperCase();
                const categoriaActual = categoria.trim().toUpperCase();

                if (categoriaActual === 'MASTER40') {
                    // SI ESTAMOS EN MASTER 40:
                    // Mostramos el juego SI es explícitamente Master 40
                    // O SI NO pertenece a ninguna de las categorías nuevas (así rescatamos los viejos)
                    return catJuego === 'MASTER40' || !NUEVAS_CATEGORIAS.includes(catJuego);
                } else {
                    // SI ESTAMOS EN U19 / FEMENINO / ETC:
                    // El juego debe tener la etiqueta exacta. Si no, no entra.
                    return catJuego === categoriaActual;
                }
            });

            setMatches(filteredByCat);
            setLoading(false);
        });

        // 2. ESCUCHAR EQUIPOS (Para los logos)
        const qE = query(collection(db, 'equipos'), orderBy('nombre', 'asc'));
        const unsubEquipos = onSnapshot(qE, (snap) => {
            setEquipos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        
        return () => { unsubMatches(); unsubEquipos(); };
    }, [categoria]); // Se recarga si cambia la categoría

    const getLogo = (teamId: string) => equipos.find(e => e.id === teamId)?.logoUrl || DEFAULT_LOGO;

    const handleDeleteMatch = async (id: string) => {
        if (window.confirm("⚠️ ¿Estás seguro de ELIMINAR este juego? Se borrará permanentemente del calendario.")) {
            try {
                await deleteDoc(doc(db, 'calendario', id));
                alert("Juego eliminado con éxito.");
            } catch (e) {
                alert("Error al intentar eliminar el juego.");
            }
        }
    };

    const handleEditMatch = (match: any) => {
        setMatchToEdit(match);
        setShowMatchForm(true);
    };

    // Filtro visual por Grupo A/B dentro de los juegos ya filtrados por categoría
    const filteredMatches = matches.filter(m => {
        if (activeFilter === 'TODOS') return true;
        // Normalizamos también el grupo por si acaso (algunos pueden ser 'a' o 'A')
        const grupoJuego = (m.grupo || '').toUpperCase();
        return grupoJuego === activeFilter;
    });

    if (loading) return <div style={{padding:'100px', color:'#1e3a8a', textAlign:'center', fontWeight:'bold'}}>CARGANDO CALENDARIO {categoria}...</div>;

    return (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'#f8fafc', zIndex:1000, display:'flex', flexDirection:'column' }}>
            
            {selectedBoxScore && <BoxScoreModal match={selectedBoxScore} onClose={() => setSelectedBoxScore(null)} getLogo={getLogo} />}

            <div style={{background:'#1e3a8a', color:'white', padding:'15px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'4px solid #f59e0b'}}>
                <div>
                    <h2 style={{margin:0, fontSize:'1rem', fontWeight:'900'}}>📅 CALENDARIO {categoria}</h2>
                    <p style={{margin:0, fontSize:'0.6rem', opacity:0.8}}>LIGA METROPOLITANA EJE ESTE</p>
                </div>
                <button onClick={onClose} style={{background:'white', color:'#1e3a8a', border:'none', padding:'8px 15px', borderRadius:'12px', fontWeight:'bold', fontSize:'0.7rem'}}>VOLVER</button>
            </div>

            <div style={{ background:'white', padding:'10px', display:'flex', justifyContent:'center', gap:'10px', boxShadow:'0 2px 10px rgba(0,0,0,0.05)' }}>
                {['TODOS', 'A', 'B'].map((f: any) => (
                    <button 
                        key={f} 
                        onClick={() => setActiveFilter(f)}
                        style={{
                            padding:'8px 20px', borderRadius:'20px', border:'2px solid #1e3a8a',
                            background: activeFilter === f ? '#1e3a8a' : 'white',
                            color: activeFilter === f ? 'white' : '#1e3a8a',
                            fontSize:'0.7rem', fontWeight:'bold', cursor:'pointer', transition:'0.2s'
                        }}
                    >
                        {f === 'TODOS' ? 'VER TODOS' : `GRUPO ${f}`}
                    </button>
                ))}
            </div>

            <div style={{flex:1, overflowY:'auto', padding:'15px'}}>
                <div style={{maxWidth:'600px', margin:'0 auto'}}>

                    {rol === 'admin' && (
                        <button onClick={() => { setMatchToEdit(null); setShowMatchForm(true); }} style={{ width:'100%', padding:'12px', background:'#10b981', color:'white', border:'none', borderRadius:'12px', fontWeight:'bold', fontSize:'0.8rem', cursor:'pointer', marginBottom:'15px', borderBottom:'4px solid #059669' }}>
                            ➕ PROGRAMAR JUEGO EN {categoria}
                        </button>
                    )}

                    <div style={{display:'flex', flexDirection:'column', gap:'15px', paddingBottom:'100px'}}>
                        {filteredMatches.length > 0 ? filteredMatches.map(m => {
                            const isFinished = m.estatus === 'finalizado';
                            return (
                                <div key={m.id} style={{
                                    background:'white', borderRadius:'18px', overflow:'hidden',
                                    boxShadow:'0 4px 15px rgba(0,0,0,0.05)', 
                                    border: isFinished ? '1px solid #e2e8f0' : (m.grupo === 'A' ? '2px solid #3b82f6' : '2px solid #ef4444')
                                }}>
                                    <div style={{ background:'#f8fafc', padding:'8px 15px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #f1f5f9' }}>
                                        <span style={{ fontSize:'0.6rem', fontWeight:'900', color: m.grupo === 'A' ? '#3b82f6' : '#ef4444' }}>GRUPO {m.grupo}</span>
                                        <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
                                            <span style={{ fontSize:'0.65rem', fontWeight:'bold', color:'#64748b' }}>📅 {m.fechaAsignada}</span>
                                            <span style={{ fontSize:'0.65rem', fontWeight:'900', color:'#1e3a8a', background:'#e0f2fe', padding:'2px 6px', borderRadius:'4px' }}>⏰ {m.hora || 'POR DEFINIR'}</span>
                                        </div>
                                    </div>

                                    <div style={{ display:'flex', padding:'15px', alignItems:'center', justifyContent:'space-between' }}>
                                        <div style={{ flex:1, textAlign:'center' }}>
                                            <img src={getLogo(m.equipoLocalId)} style={{width:'45px', height:'45px', borderRadius:'50%', objectFit:'cover', border:'2px solid #f1f5f9'}} />
                                            <div style={{fontWeight:'900', fontSize:'0.7rem', marginTop:'5px', color:'#1e293b'}}>{m.equipoLocalNombre.toUpperCase()}</div>
                                            {isFinished && <div style={{fontSize:'1.5rem', fontWeight:'900', color:'#1e3a8a'}}>{m.marcadorLocal}</div>}
                                        </div>

                                        <div style={{ flex:0.5, textAlign:'center' }}>
                                            {isFinished ? (
                                                <div style={{background:'#1e3a8a', color:'white', fontSize:'0.5rem', padding:'4px', borderRadius:'6px', fontWeight:'bold'}}>FINAL</div>
                                            ) : (
                                                <div style={{fontSize:'0.8rem', fontWeight:'900', color:'#cbd5e1'}}>VS</div>
                                            )}
                                        </div>

                                        <div style={{ flex:1, textAlign:'center' }}>
                                            <img src={getLogo(m.equipoVisitanteId)} style={{width:'45px', height:'45px', borderRadius:'50%', objectFit:'cover', border:'2px solid #f1f5f9'}} />
                                            <div style={{fontWeight:'900', fontSize:'0.7rem', marginTop:'5px', color:'#1e293b'}}>{m.equipoVisitanteNombre.toUpperCase()}</div>
                                            {isFinished && <div style={{fontSize:'1.5rem', fontWeight:'900', color:'#1e3a8a'}}>{m.marcadorVisitante}</div>}
                                        </div>
                                    </div>

                                    {rol === 'admin' && !isFinished && (
                                        <div style={{ display:'flex', gap:'1px', background:'#e2e8f0', borderTop:'1px solid #f1f5f9' }}>
                                            <button onClick={() => handleEditMatch(m)} style={{ flex:1, background:'white', border:'none', padding:'10px', fontSize:'0.65rem', fontWeight:'bold', color:'#1e3a8a', cursor:'pointer' }}>✏️ EDITAR CITA</button>
                                            <button onClick={() => handleDeleteMatch(m.id)} style={{ flex:1, background:'white', border:'none', padding:'10px', fontSize:'0.65rem', fontWeight:'bold', color:'#ef4444', cursor:'pointer' }}>🗑️ ELIMINAR</button>
                                        </div>
                                    )}

                                    {isFinished && (
                                        <button onClick={() => setSelectedBoxScore(m)} style={{ width:'100%', background:'#f1f5f9', border:'none', padding:'10px', color:'#1e3a8a', fontSize:'0.7rem', fontWeight:'bold', cursor:'pointer', borderTop:'1px solid #f1f5f9' }}>
                                            📊 VER ESTADÍSTICAS COMPLETAS
                                        </button>
                                    )}
                                </div>
                            );
                        }) : (
                            <div style={{textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'0.8rem'}}>No hay juegos programados en este grupo para {categoria}.</div>
                        )}
                    </div>
                </div>
            </div>

            {showMatchForm && (
                <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', zIndex:2000, display:'flex', justifyContent:'center', alignItems:'center', padding:'20px'}}>
                    <div style={{width:'100%', maxWidth:'450px', background:'white', borderRadius:'20px', overflow:'hidden'}}>
                        {/* IMPORTANTE: PASAMOS LA CATEGORÍA PARA QUE EL JUEGO SE CREE EN LA LIGA CORRECTA */}
                        <MatchForm 
                            matchToEdit={matchToEdit}
                            categoriaActiva={categoria} 
                            onSuccess={() => { setShowMatchForm(false); setMatchToEdit(null); }} 
                            onClose={() => { setShowMatchForm(false); setMatchToEdit(null); }} 
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default CalendarViewer;