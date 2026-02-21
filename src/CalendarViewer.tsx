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
            <div style={{ marginBottom: '25px' }}>
                <div style={{ background: teamColor, color: 'white', padding: '10px', fontWeight: 'bold', fontSize: '0.9rem', borderRadius: '12px 12px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{textTransform: 'uppercase'}}>{teamName}</span>
                    <span style={{fontSize:'0.7rem', background:'rgba(255,255,255,0.2)', padding:'2px 8px', borderRadius:'4px'}}>SUMA: {totalPuntosJugadores}</span>
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
                                const currentStat = isEditing ? editedStats[p.id] : p;
                                const pts = (Number(currentStat?.tirosLibres)||0) + (Number(currentStat?.dobles)||0)*2 + (Number(currentStat?.triples)||0)*3;
                                const valBloqueos = currentStat?.bloqueos !== undefined ? currentStat.bloqueos : (currentStat?.tapones || 0);
                                return (
                                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: isEditing ? '#fffbeb' : 'white' }}>
                                        <td style={{ textAlign: 'left', padding: '12px', fontWeight: 'bold', color: '#1e293b' }}>{p.nombre.toUpperCase()}</td>
                                        <td style={{ background: 'rgba(0,0,0,0.02)', fontWeight: '900', fontSize: '1rem', color: teamColor }}>{pts}</td>
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

    const inputStyle = { width: '45px', padding: '6px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight:'bold', fontSize:'0.85rem' };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(241, 245, 249, 0.98)', zIndex: 3000, display: 'flex', justifyContent: 'center', padding: '15px', overflowY: 'auto' }}>
            <div style={{ background: '#fff', width: '100%', maxWidth: '750px', borderRadius: '25px', height: 'fit-content', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                <div style={{ padding: '15px', background: '#f8fafc', color: '#1e3a8a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', textTransform: 'uppercase' }}>{isEditing ? '✏️ MODO EDICIÓN' : '📊 BOX SCORE'}</h3>
                    <div style={{display:'flex', gap:'10px'}}>
                        {rol === 'admin' && !loading && (isEditing ? <button onClick={saveChanges} style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '10px', padding: '8px 15px', cursor: 'pointer', fontWeight: 'bold', fontSize:'0.7rem' }}>GUARDAR</button> : <button onClick={() => setIsEditing(true)} style={{ background: '#f59e0b', color: 'white', border: 'none', borderRadius: '10px', padding: '8px 15px', cursor: 'pointer', fontWeight: 'bold', fontSize:'0.7rem' }}>EDITAR</button>)}
                        <button onClick={onClose} style={{ color: 'white', background: '#ef4444', border: 'none', borderRadius: '10px', padding: '8px 15px', cursor: 'pointer', fontWeight: 'bold', fontSize:'0.7rem' }}>CERRAR</button>
                    </div>
                </div>
                {/* Visualización de marcador */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '30px 15px', background: '#fff' }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'white', border: '2px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', overflow: 'hidden', padding: '5px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                            <TeamLogo logoUrl={getLogo(match.equipoLocalId)} altText="L" />
                        </div>
                        <div style={{ color: '#3b82f6', fontWeight: '900', fontSize: '2.2rem', marginTop: '10px' }}>{match.marcadorLocal}</div>
                    </div>
                    <div style={{ fontSize: '1.2rem', color: '#cbd5e1', fontWeight: '900' }}>VS</div>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'white', border: '2px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', overflow: 'hidden', padding: '5px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                            <TeamLogo logoUrl={getLogo(match.equipoVisitanteId)} altText="V" />
                        </div>
                        <div style={{ color: '#ef4444', fontWeight: '900', fontSize: '2.2rem', marginTop: '10px' }}>{match.marcadorVisitante}</div>
                    </div>
                </div>
                <div style={{ padding: '0 15px 120px 15px' }}>
                    {loading ? <p style={{textAlign:'center', padding:'40px'}}>Calculando estadísticas...</p> : (
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

    useEffect(() => {
        setLoading(true);
        
        const catStr = categoria.trim().toUpperCase();
        const isMaster = catStr === 'MASTER40' || catStr === 'MASTER';
        
        // 1. Determinar nombres de colecciones según categoría
        const colCalendario = isMaster ? 'calendario' : `calendario_${catStr}`;
        const colEquipos = isMaster ? 'equipos' : `equipos_${catStr}`;

        // 2. Suscribirse a los juegos
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
                if (a.fechaAsignada !== b.fechaAsignada) {
                    return a.fechaAsignada.localeCompare(b.fechaAsignada);
                }
                return (a.hora || "00:00").localeCompare(b.hora || "00:00");
            });

            setMatches(sorted);
            setLoading(false);
        });

        // 3. Suscribirse a los equipos correspondientes (Equipos o Equipos_LIBRE)
        const qE = query(collection(db, colEquipos), orderBy('nombre', 'asc'));
        const unsubEquipos = onSnapshot(qE, (snap) => {
            setEquipos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        
        return () => { unsubMatches(); unsubEquipos(); };
    }, [categoria]); 

    const getLogo = (teamId) => {
        // Busca el logo en la lista de equipos cargada (que ya es la correcta según la categoría)
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

    if (loading) return <div style={{padding:'100px', color:'#1e3a8a', textAlign:'center', fontWeight:'bold'}}>CARGANDO CALENDARIO {categoria}...</div>;

    return (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'#f8fafc', zIndex:1000, display:'flex', flexDirection:'column' }}>
            {selectedBoxScore && <BoxScoreModal match={selectedBoxScore} onClose={() => setSelectedBoxScore(null)} getLogo={getLogo} rol={rol} />}

            <div style={{background:'#1e3a8a', color:'white', padding:'15px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'4px solid #f59e0b'}}>
                <div>
                    <h2 style={{margin:0, fontSize:'1.1rem', fontWeight:'900'}}>📅 CALENDARIO {categoria}</h2>
                    <p style={{margin:0, fontSize:'0.65rem', opacity:0.8, fontWeight:'bold'}}>LIGA METROPOLITANA EJE ESTE</p>
                </div>
                <button onClick={onClose} style={{background:'white', color:'#1e3a8a', border:'none', padding:'8px 15px', borderRadius:'12px', fontWeight:'bold', fontSize:'0.7rem', cursor:'pointer'}}>VOLVER</button>
            </div>

            <div style={{ background:'white', padding:'12px', display:'flex', justifyContent:'center', gap:'8px', boxShadow:'0 2px 10px rgba(0,0,0,0.05)', flexWrap:'wrap' }}>
                {['TODOS', 'A', 'B', 'PLAYOFFS'].map((f) => (
                    <button 
                        key={f} 
                        onClick={() => setActiveFilter(f)} 
                        style={{ 
                            padding:'8px 16px', 
                            borderRadius:'20px', 
                            border: activeFilter === f ? '2px solid transparent' : (f === 'PLAYOFFS' ? '2px solid #ef4444' : '2px solid #1e3a8a'), 
                            background: activeFilter === f ? (f === 'PLAYOFFS' ? '#ef4444' : '#1e3a8a') : 'white', 
                            color: activeFilter === f ? 'white' : (f === 'PLAYOFFS' ? '#ef4444' : '#1e3a8a'), 
                            fontSize:'0.7rem', 
                            fontWeight:'900', 
                            cursor:'pointer', 
                            transition:'0.2s' 
                        }}
                    >
                        {f === 'TODOS' ? 'TODOS' : f === 'PLAYOFFS' ? '🏆 PLAYOFFS' : `GRUPO ${f}`}
                    </button>
                ))}
            </div>

            <div style={{flex:1, overflowY:'auto', padding:'15px'}}>
                <div style={{maxWidth:'600px', margin:'0 auto'}}>
                    {rol === 'admin' && (
                        <button onClick={() => { setMatchToEdit(null); setShowMatchForm(true); }} style={{ width:'100%', padding:'15px', background:'#10b981', color:'white', border:'none', borderRadius:'15px', fontWeight:'bold', fontSize:'0.85rem', cursor:'pointer', marginBottom:'20px', borderBottom:'4px solid #059669', boxShadow:'0 4px 12px rgba(16,185,129,0.2)' }}>
                            ➕ PROGRAMAR NUEVO JUEGO
                        </button>
                    )}

                    <div style={{display:'flex', flexDirection:'column', gap:'18px', paddingBottom:'120px'}}>
                        {filteredMatches.length > 0 ? filteredMatches.map(m => {
                            const isFinished = m.estatus === 'finalizado';
                            const isPlayoff = m.fase === 'playoff';
                            const borderColor = isPlayoff ? '#ef4444' : (isFinished ? '#1e3a8a' : (m.grupo === 'A' ? '#3b82f6' : '#f59e0b'));

                            return (
                                <div key={m.id} style={{ 
                                    background:'white', 
                                    borderRadius:'20px', 
                                    overflow:'hidden', 
                                    boxShadow:'0 6px 20px rgba(0,0,0,0.06)', 
                                    border: `3px solid ${borderColor}`
                                }}>
                                    <div style={{ background: isPlayoff ? '#fef2f2' : (isFinished ? '#f1f5f9' : (m.grupo === 'A' ? '#eff6ff' : '#fffbeb')), padding:'10px 15px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:`1px solid ${borderColor}` }}>
                                        <span style={{ fontSize:'0.65rem', fontWeight:'900', color: borderColor }}>
                                            {isPlayoff ? `🏆 PLAYOFF - ${m.tituloCruce || 'CRUCE DE GRUPOS'}` : `GRUPO ${m.grupo}`}
                                        </span>
                                        <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
                                            <span style={{ fontSize:'0.7rem', fontWeight:'bold', color:'#475569' }}>📅 {m.fechaAsignada}</span>
                                            <span style={{ fontSize:'0.7rem', fontWeight:'900', color:'white', background: borderColor, padding:'2px 8px', borderRadius:'6px' }}>⏰ {m.hora || 'S.H'}</span>
                                        </div>
                                    </div>

                                    <div style={{ display:'flex', padding:'20px 15px', alignItems:'center', justifyContent:'space-between' }}>
                                        <div style={{ flex:1, textAlign:'center' }}>
                                            <div style={{width:'55px', height:'55px', borderRadius:'50%', background:'white', border:'2px solid #f1f5f9', margin:'0 auto', overflow:'hidden', padding:'3px'}}>
                                                <TeamLogo logoUrl={getLogo(m.equipoLocalId)} altText="L" />
                                            </div>
                                            <div style={{fontWeight:'900', fontSize:'0.75rem', marginTop:'8px', color:'#1e293b'}}>{m.equipoLocalNombre.toUpperCase()}</div>
                                            {isFinished && <div style={{fontSize:'1.8rem', fontWeight:'900', color: borderColor, marginTop:'5px'}}>{m.marcadorLocal}</div>}
                                        </div>

                                        <div style={{ flex:0.4, textAlign:'center' }}>
                                            {isFinished ? <div style={{background: borderColor, color:'white', fontSize:'0.55rem', padding:'4px 8px', borderRadius:'8px', fontWeight:'900'}}>FINAL</div> : <div style={{fontSize:'1rem', fontWeight:'900', color:'#cbd5e1'}}>VS</div>}
                                        </div>

                                        <div style={{ flex:1, textAlign:'center' }}>
                                            <div style={{width:'55px', height:'55px', borderRadius:'50%', background:'white', border:'2px solid #f1f5f9', margin:'0 auto', overflow:'hidden', padding:'3px'}}>
                                                <TeamLogo logoUrl={getLogo(m.equipoVisitanteId)} altText="V" />
                                            </div>
                                            <div style={{fontWeight:'900', fontSize:'0.75rem', marginTop:'8px', color:'#1e293b'}}>{m.equipoVisitanteNombre.toUpperCase()}</div>
                                            {isFinished && <div style={{fontSize:'1.8rem', fontWeight:'900', color: borderColor, marginTop:'5px'}}>{m.marcadorVisitante}</div>}
                                        </div>
                                    </div>

                                    {rol === 'admin' && !isFinished && (
                                        <div style={{ display:'flex', borderTop:`1px solid ${borderColor}` }}>
                                            <button onClick={() => handleEditMatch(m)} style={{ flex:1, background:'white', border:'none', padding:'12px', fontSize:'0.7rem', fontWeight:'bold', color: borderColor, cursor:'pointer', borderRight:'1px solid #eee' }}>✏️ EDITAR</button>
                                            <button onClick={() => handleDeleteMatch(m.id)} style={{ flex:1, background:'white', border:'none', padding:'12px', fontSize:'0.7rem', fontWeight:'bold', color:'#ef4444', cursor:'pointer' }}>🗑️ ELIMINAR</button>
                                        </div>
                                    )}

                                    {isFinished && (
                                        <button onClick={() => setSelectedBoxScore(m)} style={{ width:'100%', background:'#f8fafc', border:'none', padding:'12px', color: borderColor, fontSize:'0.75rem', fontWeight:'900', cursor:'pointer', borderTop:`1px solid ${borderColor}` }}>
                                            📊 VER BOX SCORE COMPLETO
                                        </button>
                                    )}
                                </div>
                            );
                        }) : <div style={{textAlign:'center', padding:'60px', color:'#94a3b8', fontSize:'0.85rem', fontWeight:'bold'}}>No hay juegos programados en esta sección.</div>}
                    </div>
                </div>
            </div>

            {showMatchForm && (
                <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(30,58,138,0.85)', backdropFilter:'blur(4px)', zIndex:2000, display:'flex', justifyContent:'center', alignItems:'center', padding:'20px'}}>
                    <div style={{width:'100%', maxWidth:'450px', background:'white', borderRadius:'25px', overflow:'hidden', boxShadow:'0 25px 50px -12px rgba(0,0,0,0.25)'}}>
                        <MatchForm matchToEdit={matchToEdit} categoriaActiva={categoria} onSuccess={() => { setShowMatchForm(false); setMatchToEdit(null); }} onClose={() => { setShowMatchForm(false); setMatchToEdit(null); }} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default CalendarViewer;