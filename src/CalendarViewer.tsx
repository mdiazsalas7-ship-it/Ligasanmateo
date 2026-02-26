import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, onSnapshot, orderBy, deleteDoc, doc, getDocs, where, updateDoc } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import MatchForm from './MatchForm'; 

const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/451/451716.png";

// --- SUBCOMPONENTE PARA LOGOS DE FIREBASE STORAGE ---
const TeamLogo = ({ logoUrl, altText }) => {
    const [url, setUrl] = useState(DEFAULT_LOGO);

    useEffect(() => {
        if (!logoUrl) {
            setUrl(DEFAULT_LOGO);
            return;
        }
        if (logoUrl.startsWith('gs://')) {
            const storage = getStorage();
            getDownloadURL(ref(storage, logoUrl))
                .then(setUrl)
                .catch(() => setUrl(DEFAULT_LOGO));
        } else {
            setUrl(logoUrl);
        }
    }, [logoUrl]);

    return <img src={url} alt={altText} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
};

// --- COMPONENTE INTERNO: BOX SCORE ---
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
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setStats(data);
                
                const initialEditState = {};
                data.forEach(s => {
                    initialEditState[s.id] = { 
                        ...s,
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
        const val = value === '' ? 0 : parseInt(value);
        setEditedStats(prev => ({
            ...prev,
            [statId]: { ...prev[statId], [field]: isNaN(val) ? 0 : val }
        }));
    };

    const saveChanges = async () => {
        if(!window.confirm("¿Confirmar cambios? Esto recalculará los líderes.")) return;
        try {
            const updates = Object.values(editedStats).map(async (stat) => {
                if (!stat.id) return; 
                const docRef = doc(db, "stats_partido", stat.id);
                const cleanData = {
                    dobles: Number(stat.dobles) || 0,
                    triples: Number(stat.triples) || 0,
                    tirosLibres: Number(stat.tirosLibres) || 0,
                    rebotes: Number(stat.rebotes) || 0,
                    robos: Number(stat.robos) || 0,
                    bloqueos: Number(stat.bloqueos) || 0,
                    tapones: Number(stat.bloqueos) || 0
                };
                await updateDoc(docRef, cleanData);
            });
            await Promise.all(updates);
            alert("✅ Estadísticas actualizadas.");
            setIsEditing(false);
            setStats(Object.values(editedStats));
        } catch (error) { alert(`Error: ${error.message}`); }
    };

    const renderTable = (teamName, teamId, teamColor) => {
        const players = stats.filter(s => {
            const porId = s.equipoId === teamId;
            const porNombre = s.equipo && teamName && s.equipo.trim().toUpperCase() === teamName.trim().toUpperCase();
            return porId || porNombre;
        });

        const sourceData = isEditing ? Object.values(editedStats).filter(s => players.find(p => p.id === s.id)) : players;
        const totalPuntosJugadores = sourceData.reduce((acc, p) => acc + (Number(p.tirosLibres)||0) + (Number(p.dobles)||0)*2 + (Number(p.triples)||0)*3, 0);

        return (
            <div style={{ marginBottom: '30px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ background: '#f8fafc', color: '#0f172a', padding: '12px 15px', fontWeight: '900', fontSize: '1rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom: '2px solid #e2e8f0' }}>
                    <span style={{textTransform: 'uppercase'}}>{teamName}</span>
                    <span style={{fontSize:'0.75rem', background:'#e2e8f0', color:'#0f172a', padding:'4px 10px', borderRadius:'12px', fontWeight:'bold'}}>TOTAL: {totalPuntosJugadores} PTS</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'center', color: '#334155' }}>
                        <thead style={{ background: '#fff', color: '#64748b', borderBottom: '1px solid #e2e8f0', fontSize:'0.7rem' }}>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '12px 15px', minWidth:'120px' }}>JUGADOR</th>
                                <th style={{ color: '#0f172a', fontWeight:'900' }}>PTS</th>
                                <th>2P</th><th>3P</th><th>TL</th><th>REB</th><th>TAP</th><th>ROB</th>
                            </tr>
                        </thead>
                        <tbody>
                            {players.length > 0 ? players.map((p, i) => {
                                const currentStat = isEditing ? editedStats[p.id] : p;
                                const pts = (Number(currentStat?.tirosLibres)||0) + (Number(currentStat?.dobles)||0)*2 + (Number(currentStat?.triples)||0)*3;
                                const valBloqueos = currentStat?.bloqueos !== undefined ? currentStat.bloqueos : (currentStat?.tapones || 0);
                                return (
                                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: isEditing ? '#fffbeb' : '#fff' }}>
                                        <td style={{ textAlign: 'left', padding: '12px 15px', fontWeight: 'bold', color: '#1e293b' }}>{p.nombre}</td>
                                        <td style={{ fontWeight: '900', fontSize: '1rem', color: '#0f172a' }}>{pts}</td>
                                        {isEditing ? (
                                            <>
                                                <td><input type="number" style={inputStyle} value={currentStat.dobles} onChange={(e)=>handleStatChange(p.id, 'dobles', e.target.value)} /></td>
                                                <td><input type="number" style={inputStyle} value={currentStat.triples} onChange={(e)=>handleStatChange(p.id, 'triples', e.target.value)} /></td>
                                                <td><input type="number" style={inputStyle} value={currentStat.tirosLibres} onChange={(e)=>handleStatChange(p.id, 'tirosLibres', e.target.value)} /></td>
                                                <td><input type="number" style={inputStyle} value={currentStat.rebotes} onChange={(e)=>handleStatChange(p.id, 'rebotes', e.target.value)} /></td>
                                                <td><input type="number" style={inputStyle} value={currentStat.bloqueos} onChange={(e)=>handleStatChange(p.id, 'bloqueos', e.target.value)} /></td>
                                                <td><input type="number" style={inputStyle} value={currentStat.robos} onChange={(e)=>handleStatChange(p.id, 'robos', e.target.value)} /></td>
                                            </>
                                        ) : (
                                            <>
                                                <td>{p.dobles || 0}</td><td>{p.triples || 0}</td><td>{p.tirosLibres || 0}</td><td>{p.rebotes || 0}</td><td>{valBloqueos}</td><td>{p.robos || 0}</td>
                                            </>
                                        )}
                                    </tr>
                                );
                            }) : <tr><td colSpan={8} style={{padding:'20px', color:'#94a3b8'}}>Sin jugadores registrados.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const inputStyle = { width: '45px', padding: '6px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '4px', fontWeight:'bold', fontSize:'0.85rem' };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.75)', zIndex: 3000, display: 'flex', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}>
            <div style={{ background: '#fff', width: '100%', maxWidth: '750px', borderRadius: '12px', height: 'fit-content', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
                <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900' }}>{isEditing ? '✏️ MODO EDICIÓN' : 'ESTADÍSTICAS DEL PARTIDO'}</h3>
                    <div style={{display:'flex', gap:'10px'}}>
                        {rol === 'admin' && !loading && (isEditing ? <button onClick={saveChanges} style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 15px', cursor: 'pointer', fontWeight: 'bold', fontSize:'0.8rem' }}>GUARDAR</button> : <button onClick={() => setIsEditing(true)} style={{ background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 15px', cursor: 'pointer', fontWeight: 'bold', fontSize:'0.8rem' }}>EDITAR</button>)}
                        <button onClick={onClose} style={{ color: '#06c', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize:'0.8rem' }}>CERRAR</button>
                    </div>
                </div>
                <div style={{ padding: '20px' }}>
                    {loading ? <p style={{textAlign:'center', padding:'40px'}}>Calculando estadísticas...</p> : (
                        <>
                            {renderTable(match.equipoLocalNombre, match.equipoLocalId, '#000')}
                            {renderTable(match.equipoVisitanteNombre, match.equipoVisitanteId, '#000')}
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

    // LÓGICA INTACTA
    useEffect(() => {
        setLoading(true);
        const catStr = categoria.trim().toUpperCase();
        const isMaster = catStr === 'MASTER40' || catStr === 'MASTER';
        const colCalendario = isMaster ? 'calendario' : `calendario_${catStr}`;
        const colEquipos = isMaster ? 'equipos' : `equipos_${catStr}`;

        const qM = query(collection(db, colCalendario), orderBy('fechaAsignada', 'asc'));
        const unsubMatches = onSnapshot(qM, (snap) => {
            let allMatches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (isMaster) {
                const NUEVAS_CATEGORIAS = ['U19', 'FEMENINO', 'LIBRE']; 
                allMatches = allMatches.filter(m => {
                    const catJuego = (m.categoria || '').trim().toUpperCase();
                    return catJuego === 'MASTER40' || !NUEVAS_CATEGORIAS.includes(catJuego);
                });
            }
            const sorted = allMatches.sort((a, b) => {
                if (a.fechaAsignada !== b.fechaAsignada) return a.fechaAsignada.localeCompare(b.fechaAsignada);
                return (a.hora || "00:00").localeCompare(b.hora || "00:00");
            });
            setMatches(sorted);
            setLoading(false);
        });

        const qE = query(collection(db, colEquipos), orderBy('nombre', 'asc'));
        const unsubEquipos = onSnapshot(qE, (snap) => {
            setEquipos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => { unsubMatches(); unsubEquipos(); };
    }, [categoria]); 

    const getLogo = (teamId) => {
        const equipo = equipos.find(e => e.id === teamId);
        return equipo?.logoUrl || DEFAULT_LOGO;
    };

    const handleDeleteMatch = async (id) => {
        if (window.confirm("⚠️ ¿Estás seguro de ELIMINAR este juego?")) {
            try { 
                const catStr = categoria.trim().toUpperCase();
                const colName = (catStr === 'MASTER40' || catStr === 'MASTER') ? 'calendario' : `calendario_${catStr}`;
                await deleteDoc(doc(db, colName, id)); 
            } catch (e) { alert("Error al eliminar."); }
        }
    };

    const handleEditMatch = (match) => {
        setMatchToEdit(match);
        setShowMatchForm(true);
    };

    const filteredMatches = matches.filter(m => {
        if (activeFilter === 'TODOS') return true;
        if (activeFilter === 'PLAYOFFS') return m.fase === 'playoff';
        return (m.grupo || '').toUpperCase() === activeFilter;
    });

    if (loading) return <div style={{padding:'100px', color:'#000', textAlign:'center', fontWeight:'bold'}}>Cargando resultados...</div>;

    return (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'#f3f4f6', zIndex:1000, display:'flex', flexDirection:'column', fontFamily: 'Arial, sans-serif' }}>
            {selectedBoxScore && <BoxScoreModal match={selectedBoxScore} onClose={() => setSelectedBoxScore(null)} getLogo={getLogo} rol={rol} />}

            {/* HEADER TIPO ESPN */}
            <div style={{background:'#fff', padding:'15px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #e5e7eb', position:'sticky', top:0, zIndex:10}}>
                <div>
                    <h2 style={{margin:0, fontSize:'1.2rem', fontWeight:'900', color:'#000'}}>Resultados {categoria}</h2>
                    <p style={{margin:0, fontSize:'0.75rem', color:'#6b7280', fontWeight:'bold'}}>Liga Metropolitana Eje Este</p>
                </div>
                <button onClick={onClose} style={{background:'transparent', color:'#06c', border:'none', fontWeight:'bold', fontSize:'0.85rem', cursor:'pointer'}}>VOLVER</button>
            </div>

            {/* FILTROS HORIZONTALES */}
            <div className="no-scrollbar" style={{ background:'white', padding:'10px 20px', display:'flex', gap:'10px', overflowX:'auto', whiteSpace:'nowrap', borderBottom:'1px solid #e5e7eb' }}>
                {['TODOS', 'A', 'B', 'PLAYOFFS'].map((f) => {
                    const isActive = activeFilter === f;
                    return (
                    <button 
                        key={f} 
                        onClick={() => setActiveFilter(f)} 
                        style={{ 
                            padding:'6px 16px', 
                            borderRadius:'20px', 
                            border: isActive ? '1px solid #000' : '1px solid #d1d5db',
                            background: isActive ? '#000' : '#fff',
                            color: isActive ? '#fff' : '#4b5563',
                            fontSize:'0.75rem', 
                            fontWeight:'bold', 
                            cursor:'pointer', 
                            transition:'0.2s',
                            flexShrink: 0
                        }}
                    >
                        {f === 'TODOS' ? 'Todos' : f === 'PLAYOFFS' ? 'Playoffs' : `Grupo ${f}`}
                    </button>
                )})}
            </div>

            <div style={{flex:1, overflowY:'auto', padding:'20px 15px'}}>
                <div style={{maxWidth:'800px', margin:'0 auto'}}>
                    {rol === 'admin' && (
                        <button onClick={() => { setMatchToEdit(null); setShowMatchForm(true); }} style={{ width:'100%', padding:'12px', background:'#fff', color:'#000', border:'1px solid #d1d5db', borderRadius:'8px', fontWeight:'bold', fontSize:'0.85rem', cursor:'pointer', marginBottom:'20px', display:'flex', justifyContent:'center', alignItems:'center', gap:'8px' }}>
                            ➕ Programar Juego
                        </button>
                    )}

                    {/* CONTENEDOR DE TARJETAS SEPARADAS */}
                    <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>
                        {filteredMatches.length > 0 ? filteredMatches.map((m) => {
                            const isFinished = m.estatus === 'finalizado';
                            const isPlayoff = m.fase === 'playoff';
                            
                            // Validar ganador para poner el puntaje en negrita
                            const localScore = Number(m.marcadorLocal) || 0;
                            const visitorScore = Number(m.marcadorVisitante) || 0;
                            const localWins = isFinished && localScore > visitorScore;
                            const visitorWins = isFinished && visitorScore > localScore;

                            // Lógica de colores para los bordes
                            const themeColor = isPlayoff ? '#ef4444' : (m.grupo === 'A' ? '#3b82f6' : (m.grupo === 'B' ? '#f59e0b' : '#10b981'));

                            return (
                                <div key={m.id} style={{ 
                                    display: 'flex', 
                                    background: '#fff', 
                                    borderRadius: '12px', 
                                    border: `2px solid ${themeColor}`, // Borde de color dinámico
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)', // Sutil sombra para destacar el cuadro
                                    overflow: 'hidden'
                                }}>
                                    
                                    {/* COLUMNA IZQUIERDA: Estado/Hora y Fecha (Un poco más estrecha para ganar espacio) */}
                                    <div style={{ width: '75px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', borderRight: `1px solid ${themeColor}30`, padding: '10px 5px', background: `${themeColor}05` }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: isFinished ? '#4b5563' : themeColor, textAlign: 'center' }}>
                                            {isFinished ? 'FINAL' : m.hora || 'S.H'}
                                        </span>
                                        <span style={{ fontSize: '0.6rem', color: '#6b7280', marginTop: '4px', textAlign: 'center', fontWeight:'600' }}>
                                            {m.fechaAsignada.split('-').slice(1).join('/') /* Formato MM/DD para ahorrar espacio */}
                                        </span>
                                    </div>

                                    {/* COLUMNA CENTRAL: Equipos y Marcadores (Optimizado para móvil) */}
                                    <div style={{ flex: 1, padding: '12px 15px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px', minWidth: 0 }}>
                                        
                                        {/* Fila Equipo Local */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #e5e7eb', flexShrink: 0, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2px', background: '#fff' }}>
                                                    <TeamLogo logoUrl={getLogo(m.equipoLocalId)} altText="L" />
                                                </div>
                                                <span style={{ 
                                                    fontWeight: localWins ? '800' : '600', 
                                                    color: localWins ? '#000' : '#4b5563', 
                                                    fontSize: '0.85rem',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis' 
                                                }}>
                                                    {m.equipoLocalNombre}
                                                </span>
                                            </div>
                                            {isFinished && (
                                                <span style={{ fontWeight: localWins ? '900' : '500', fontSize: '1.1rem', color: localWins ? '#000' : '#4b5563', flexShrink: 0 }}>
                                                    {m.marcadorLocal}
                                                </span>
                                            )}
                                        </div>

                                        {/* Fila Equipo Visitante */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #e5e7eb', flexShrink: 0, overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '2px', background: '#fff' }}>
                                                    <TeamLogo logoUrl={getLogo(m.equipoVisitanteId)} altText="V" />
                                                </div>
                                                <span style={{ 
                                                    fontWeight: visitorWins ? '800' : '600', 
                                                    color: visitorWins ? '#000' : '#4b5563', 
                                                    fontSize: '0.85rem',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis' 
                                                }}>
                                                    {m.equipoVisitanteNombre}
                                                </span>
                                            </div>
                                            {isFinished && (
                                                <span style={{ fontWeight: visitorWins ? '900' : '500', fontSize: '1.1rem', color: visitorWins ? '#000' : '#4b5563', flexShrink: 0 }}>
                                                    {m.marcadorVisitante}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* COLUMNA DERECHA: Box Score y Botones Admin */}
                                    <div style={{ width: '85px', borderLeft: `1px solid ${themeColor}30`, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '8px', padding:'5px' }}>
                                        {isFinished ? (
                                            <button onClick={() => setSelectedBoxScore(m)} style={{ background: 'transparent', border: 'none', color: '#06c', fontSize: '0.65rem', fontWeight: '800', cursor: 'pointer' }}>
                                                BOX SCORE
                                            </button>
                                        ) : (
                                            <span style={{fontSize:'0.65rem', color:'#9ca3af', fontWeight:'bold'}}>PREVIA</span>
                                        )}
                                        
                                        {rol === 'admin' && (
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button onClick={() => handleEditMatch(m)} title="Editar" style={{ background: '#f3f4f6', border: 'none', padding: '5px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>✏️</button>
                                                <button onClick={() => handleDeleteMatch(m.id)} title="Eliminar" style={{ background: '#fef2f2', border: 'none', padding: '5px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}>🗑️</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        }) : (
                            <div style={{textAlign:'center', padding:'50px', color:'#6b7280', fontSize:'0.9rem'}}>No hay juegos programados.</div>
                        )}
                    </div>
                </div>
            </div>

            {showMatchForm && (
                <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', zIndex:2000, display:'flex', justifyContent:'center', alignItems:'center', padding:'20px'}}>
                    <div style={{width:'100%', maxWidth:'500px', background:'white', borderRadius:'12px', overflow:'hidden'}}>
                        <MatchForm matchToEdit={matchToEdit} categoriaActiva={categoria} onSuccess={() => { setShowMatchForm(false); setMatchToEdit(null); }} onClose={() => { setShowMatchForm(false); setMatchToEdit(null); }} />
                    </div>
                </div>
            )}
             <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
        </div>
    );
};

export default CalendarViewer;