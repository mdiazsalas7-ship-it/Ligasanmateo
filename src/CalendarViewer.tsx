import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, onSnapshot, orderBy, deleteDoc, doc, getDocs, where, updateDoc } from 'firebase/firestore';
import MatchForm from './MatchForm'; 

const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/451/451716.png";

// --- COMPONENTE INTERNO: BOX SCORE (CORREGIDO Y BLINDADO) ---
const BoxScoreModal = ({ match, onClose, getLogo, rol }) => {
    const [stats, setStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editedStats, setEditedStats] = useState({}); 

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const q = query(collection(db, 'stats_partido'), where('partidoId', '==', match.id));
                const snap = await getDocs(q);
                // IMPORTANTE: Aseguramos que cada dato tenga su ID
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setStats(data);
                
                // Preparamos el estado de edición normalizando 'bloqueos'
                const initialEditState = {};
                data.forEach(s => {
                    initialEditState[s.id] = { 
                        ...s,
                        // Normalizamos: Si existe tapones o bloqueos, úsalo. Si no, 0.
                        bloqueos: s.bloqueos || s.tapones || 0 
                    };
                });
                setEditedStats(initialEditState);

            } catch(e) { console.error(e); }
            setLoading(false);
        };
        fetchStats();
    }, [match.id]);

    const handleStatChange = (statId, field, value) => {
        // Convertimos a número inmediatamente para evitar errores de texto
        const val = value === '' ? 0 : parseInt(value);
        setEditedStats(prev => ({
            ...prev,
            [statId]: {
                ...prev[statId],
                [field]: isNaN(val) ? 0 : val
            }
        }));
    };

    const saveChanges = async () => {
        if(!window.confirm("¿Confirmar cambios? Esto recalculará los líderes.")) return;
        
        try {
            console.log("Iniciando guardado...", editedStats);

            const updates = Object.values(editedStats).map(async (stat) => {
                if (!stat.id) {
                    console.error("Error: Estadística sin ID", stat);
                    return; 
                }

                const docRef = doc(db, "stats_partido", stat.id);
                
                // OBJETO DE LIMPIEZA: Aseguramos que todo sean números y no undefined
                const cleanData = {
                    dobles: Number(stat.dobles) || 0,
                    triples: Number(stat.triples) || 0,
                    tirosLibres: Number(stat.tirosLibres) || 0,
                    rebotes: Number(stat.rebotes) || 0,
                    robos: Number(stat.robos) || 0,
                    bloqueos: Number(stat.bloqueos) || 0, // Unificamos a 'bloqueos'
                    tapones: Number(stat.bloqueos) || 0    // Guardamos 'tapones' igual por compatibilidad
                };

                await updateDoc(docRef, cleanData);
            });

            await Promise.all(updates);
            alert("✅ Estadísticas actualizadas correctamente.");
            setIsEditing(false);
            
            // Actualizamos la vista visual con los datos nuevos
            const newStats = Object.values(editedStats);
            setStats(newStats);

        } catch (error) {
            console.error("Error detallado al guardar:", error);
            alert(`Error al guardar: ${error.message}`);
        }
    };

    const renderTable = (teamName, teamId, teamColor) => {
        const players = stats.filter(s => {
            const porId = s.equipoId === teamId;
            const porNombre = s.equipo && teamName && s.equipo.trim().toUpperCase() === teamName.trim().toUpperCase();
            return porId || porNombre;
        });

        // Fuente de datos: Editada o Original
        const sourceData = isEditing ? 
            Object.values(editedStats).filter(s => players.find(p => p.id === s.id)) : 
            players;

        const totalPuntosJugadores = sourceData.reduce((acc, p) => {
            return acc + (Number(p.tirosLibres)||0) + (Number(p.dobles)||0)*2 + (Number(p.triples)||0)*3;
        }, 0);

        return (
            <div style={{ marginBottom: '25px' }}>
                <div style={{ background: teamColor, color: 'white', padding: '10px', fontWeight: 'bold', fontSize: '0.9rem', borderRadius: '12px 12px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{textTransform: 'uppercase'}}>{teamName}</span>
                    <span style={{fontSize:'0.7rem', background:'rgba(255,255,255,0.2)', padding:'2px 8px', borderRadius:'4px'}}>
                        SUMA: {totalPuntosJugadores}
                    </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'center', color: '#334155' }}>
                        <thead style={{ background: '#f8fafc', color: '#64748b', borderBottom: '2px solid #f1f5f9' }}>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '12px', minWidth:'120px' }}>JUGADOR</th>
                                <th style={{ color: teamColor }}>PTS</th>
                                <th>2P</th><th>3P</th><th>TL</th><th>REB</th><th>TAP</th><th>ROB</th>
                            </tr>
                        </thead>
                        <tbody>
                            {players.length > 0 ? players.map((p) => {
                                // Obtenemos el dato correcto (editado o real)
                                const currentStat = isEditing ? editedStats[p.id] : p;
                                
                                // Calculamos puntos al vuelo para ver reflejado el cambio
                                const valDobles = Number(currentStat?.dobles) || 0;
                                const valTriples = Number(currentStat?.triples) || 0;
                                const valLibres = Number(currentStat?.tirosLibres) || 0;
                                const pts = valLibres + (valDobles*2) + (valTriples*3);
                                
                                // Manejo seguro de bloqueos
                                const valBloqueos = currentStat?.bloqueos !== undefined ? currentStat.bloqueos : (currentStat?.tapones || 0);

                                return (
                                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: isEditing ? '#fffbeb' : 'white' }}>
                                        <td style={{ textAlign: 'left', padding: '12px', fontWeight: 'bold', color: '#1e293b' }}>
                                            {p.nombre.toUpperCase()}
                                        </td>
                                        
                                        <td style={{ background: 'rgba(0,0,0,0.02)', fontWeight: '900', fontSize: '1rem', color: teamColor }}>{pts}</td>

                                        {isEditing && currentStat ? (
                                            <>
                                                <td><input type="number" style={inputStyle} value={currentStat.dobles} onChange={(e)=>handleStatChange(p.id, 'dobles', e.target.value)} /></td>
                                                <td><input type="number" style={inputStyle} value={currentStat.triples} onChange={(e)=>handleStatChange(p.id, 'triples', e.target.value)} /></td>
                                                <td><input type="number" style={inputStyle} value={currentStat.tirosLibres} onChange={(e)=>handleStatChange(p.id, 'tirosLibres', e.target.value)} /></td>
                                                <td><input type="number" style={inputStyle} value={currentStat.rebotes} onChange={(e)=>handleStatChange(p.id, 'rebotes', e.target.value)} /></td>
                                                {/* Usamos 'bloqueos' unificado en el estado */}
                                                <td><input type="number" style={inputStyle} value={currentStat.bloqueos} onChange={(e)=>handleStatChange(p.id, 'bloqueos', e.target.value)} /></td>
                                                <td><input type="number" style={inputStyle} value={currentStat.robos} onChange={(e)=>handleStatChange(p.id, 'robos', e.target.value)} /></td>
                                            </>
                                        ) : (
                                            <>
                                                <td>{p.dobles || 0}</td>
                                                <td>{p.triples || 0}</td>
                                                <td>{p.tirosLibres || 0}</td>
                                                <td>{p.rebotes || 0}</td>
                                                <td>{valBloqueos}</td>
                                                <td>{p.robos || 0}</td>
                                            </>
                                        )}
                                    </tr>
                                );
                            }) : (
                                <tr><td colSpan={8} style={{padding:'20px', color:'#94a3b8'}}>Sin jugadores.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const inputStyle = { width: '45px', padding: '6px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight:'bold', fontSize:'0.85rem' };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(241, 245, 249, 0.98)', zIndex: 3000, display: 'flex', justifyContent: 'center', padding: '15px', overflowY: 'auto' }}>
            <div style={{ background: '#fff', width: '100%', maxWidth: '750px', borderRadius: '25px', height: 'fit-content', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                <div style={{ padding: '15px', background: '#f8fafc', color: '#1e3a8a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', textTransform: 'uppercase' }}>
                        {isEditing ? '✏️ EDITANDO...' : '📊 ESTADÍSTICAS'}
                    </h3>
                    <div style={{display:'flex', gap:'10px'}}>
                        {rol === 'admin' && !loading && (
                            isEditing ? (
                                <button onClick={saveChanges} style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '10px', padding: '8px 15px', cursor: 'pointer', fontWeight: 'bold', fontSize:'0.7rem' }}>💾 GUARDAR</button>
                            ) : (
                                <button onClick={() => setIsEditing(true)} style={{ background: '#f59e0b', color: 'white', border: 'none', borderRadius: '10px', padding: '8px 15px', cursor: 'pointer', fontWeight: 'bold', fontSize:'0.7rem' }}>✏️ EDITAR</button>
                            )
                        )}
                        <button onClick={onClose} style={{ color: 'white', background: '#ef4444', border: 'none', borderRadius: '10px', padding: '8px 15px', cursor: 'pointer', fontWeight: 'bold', fontSize:'0.7rem' }}>CERRAR</button>
                    </div>
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

                <div style={{ padding: '0 15px 120px 15px' }}>
                    {loading ? <p style={{textAlign:'center', color: '#666', padding:'20px'}}>Cargando estadísticas...</p> : (
                        <>
                            {renderTable(match.equipoLocalNombre, match.equipoLocalId, '#3b82f6')}
                            {renderTable(match.equipoVisitanteNombre, match.equipoVisitanteId, '#ef4444')}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- COMPONENTE PRINCIPAL ---
const CalendarViewer = ({ rol, onClose, categoria }) => {
    const [matches, setMatches] = useState([]);
    const [equipos, setEquipos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showMatchForm, setShowMatchForm] = useState(false); 
    const [selectedBoxScore, setSelectedBoxScore] = useState(null);
    const [activeFilter, setActiveFilter] = useState('TODOS');
    const [matchToEdit, setMatchToEdit] = useState(null);

    const NUEVAS_CATEGORIAS = ['U19', 'FEMENINO', 'LIBRE']; 

    useEffect(() => {
        setLoading(true);
        // 1. ESCUCHAR JUEGOS
        const qM = query(collection(db, 'calendario'), orderBy('fechaAsignada', 'asc'));
        const unsubMatches = onSnapshot(qM, (snap) => {
            const allMatches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            const filteredByCat = allMatches.filter(m => {
                const catJuego = (m.categoria || '').trim().toUpperCase();
                const categoriaActual = categoria.trim().toUpperCase();

                if (categoriaActual === 'MASTER40') {
                    return catJuego === 'MASTER40' || !NUEVAS_CATEGORIAS.includes(catJuego);
                } else {
                    return catJuego === categoriaActual;
                }
            });

            setMatches(filteredByCat);
            setLoading(false);
        });

        // 2. ESCUCHAR EQUIPOS
        const qE = query(collection(db, 'equipos'), orderBy('nombre', 'asc'));
        const unsubEquipos = onSnapshot(qE, (snap) => {
            setEquipos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        
        return () => { unsubMatches(); unsubEquipos(); };
    }, [categoria]); 

    const getLogo = (teamId) => equipos.find(e => e.id === teamId)?.logoUrl || DEFAULT_LOGO;

    const handleDeleteMatch = async (id) => {
        if (window.confirm("⚠️ ¿Estás seguro de ELIMINAR este juego? Se borrará permanentemente del calendario.")) {
            try {
                await deleteDoc(doc(db, 'calendario', id));
                alert("Juego eliminado con éxito.");
            } catch (e) {
                alert("Error al intentar eliminar el juego.");
            }
        }
    };

    const handleEditMatch = (match) => {
        setMatchToEdit(match);
        setShowMatchForm(true);
    };

    const filteredMatches = matches.filter(m => {
        if (activeFilter === 'TODOS') return true;
        const grupoJuego = (m.grupo || '').toUpperCase();
        return grupoJuego === activeFilter;
    });

    if (loading) return <div style={{padding:'100px', color:'#1e3a8a', textAlign:'center', fontWeight:'bold'}}>CARGANDO CALENDARIO {categoria}...</div>;

    return (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'#f8fafc', zIndex:1000, display:'flex', flexDirection:'column' }}>
            
            {selectedBoxScore && (
                <BoxScoreModal 
                    match={selectedBoxScore} 
                    onClose={() => setSelectedBoxScore(null)} 
                    getLogo={getLogo} 
                    rol={rol} 
                />
            )}

            <div style={{background:'#1e3a8a', color:'white', padding:'15px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'4px solid #f59e0b'}}>
                <div>
                    <h2 style={{margin:0, fontSize:'1rem', fontWeight:'900'}}>📅 CALENDARIO {categoria}</h2>
                    <p style={{margin:0, fontSize:'0.6rem', opacity:0.8}}>LIGA METROPOLITANA EJE ESTE</p>
                </div>
                <button onClick={onClose} style={{background:'white', color:'#1e3a8a', border:'none', padding:'8px 15px', borderRadius:'12px', fontWeight:'bold', fontSize:'0.7rem'}}>VOLVER</button>
            </div>

            <div style={{ background:'white', padding:'10px', display:'flex', justifyContent:'center', gap:'10px', boxShadow:'0 2px 10px rgba(0,0,0,0.05)' }}>
                {['TODOS', 'A', 'B'].map((f) => (
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