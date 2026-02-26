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

// --- COMPONENTE INTERNO: BOX SCORE (VISUAL OPTIMIZADO) ---
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
            <div style={{ marginBottom: '30px', borderRadius: '16px', overflow: 'hidden', border: `1px solid ${teamColor}40` }}>
                <div style={{ background: `linear-gradient(to right, ${teamColor}, ${teamColor}dd)`, color: 'white', padding: '12px 15px', fontWeight: '900', fontSize: '1rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{textTransform: 'uppercase', letterSpacing:'0.5px'}}>{teamName}</span>
                    <span style={{fontSize:'0.75rem', background:'rgba(0,0,0,0.2)', padding:'4px 10px', borderRadius:'20px', fontWeight:'bold'}}>TOTAL: {totalPuntosJugadores} PTS</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'center', color: '#334155' }}>
                        <thead style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #e2e8f0', fontSize:'0.75rem', textTransform:'uppercase' }}>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '15px', minWidth:'130px' }}>JUGADOR</th>
                                <th style={{ color: teamColor, background: `${teamColor}10`, fontWeight:'900' }}>PTS</th>
                                <th style={{padding:'12px'}}>2P</th><th style={{padding:'12px'}}>3P</th><th style={{padding:'12px'}}>TL</th><th style={{padding:'12px'}}>REB</th><th style={{padding:'12px'}}>TAP</th><th style={{padding:'12px'}}>ROB</th>
                            </tr>
                        </thead>
                        <tbody>
                            {players.length > 0 ? players.map((p, i) => {
                                const currentStat = isEditing ? editedStats[p.id] : p;
                                const pts = (Number(currentStat?.tirosLibres)||0) + (Number(currentStat?.dobles)||0)*2 + (Number(currentStat?.triples)||0)*3;
                                const valBloqueos = currentStat?.bloqueos !== undefined ? currentStat.bloqueos : (currentStat?.tapones || 0);
                                const rowBg = isEditing ? '#fffbeb' : (i % 2 === 0 ? 'white' : '#f8fafc');
                                return (
                                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: rowBg, transition:'0.2s' }}>
                                        <td style={{ textAlign: 'left', padding: '15px 12px', fontWeight: 'bold', color: '#1e293b' }}>{p.nombre.toUpperCase()}</td>
                                        <td style={{ background: `${teamColor}10`, fontWeight: '900', fontSize: '1.1rem', color: teamColor, padding:'12px' }}>{pts}</td>
                                        {isEditing ? (
                                            <>
                                                <td style={{padding:'8px'}}><input type="number" style={inputStyle} value={currentStat.dobles} onChange={(e)=>handleStatChange(p.id, 'dobles', e.target.value)} /></td>
                                                <td style={{padding:'8px'}}><input type="number" style={inputStyle} value={currentStat.triples} onChange={(e)=>handleStatChange(p.id, 'triples', e.target.value)} /></td>
                                                <td style={{padding:'8px'}}><input type="number" style={inputStyle} value={currentStat.tirosLibres} onChange={(e)=>handleStatChange(p.id, 'tirosLibres', e.target.value)} /></td>
                                                <td style={{padding:'8px'}}><input type="number" style={inputStyle} value={currentStat.rebotes} onChange={(e)=>handleStatChange(p.id, 'rebotes', e.target.value)} /></td>
                                                <td style={{padding:'8px'}}><input type="number" style={inputStyle} value={currentStat.bloqueos} onChange={(e)=>handleStatChange(p.id, 'bloqueos', e.target.value)} /></td>
                                                <td style={{padding:'8px'}}><input type="number" style={inputStyle} value={currentStat.robos} onChange={(e)=>handleStatChange(p.id, 'robos', e.target.value)} /></td>
                                            </>
                                        ) : (
                                            <>
                                                <td style={{padding:'12px', fontWeight:'600'}}>{p.dobles || 0}</td><td style={{padding:'12px', fontWeight:'600'}}>{p.triples || 0}</td><td style={{padding:'12px', fontWeight:'600'}}>{p.tirosLibres || 0}</td><td style={{padding:'12px', fontWeight:'bold', color:'#475569'}}>{p.rebotes || 0}</td><td style={{padding:'12px', fontWeight:'600'}}>{valBloqueos}</td><td style={{padding:'12px', fontWeight:'600'}}>{p.robos || 0}</td>
                                            </>
                                        )}
                                    </tr>
                                );
                            }) : <tr><td colSpan={8} style={{padding:'30px', textAlign:'center', color:'#94a3b8', fontStyle:'italic'}}>Sin estadísticas registradas.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const inputStyle = { width: '50px', padding: '8px', textAlign: 'center', border: '2px solid #cbd5e1', borderRadius: '8px', fontWeight:'bold', fontSize:'0.9rem', background:'white' };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '20px', overflowY: 'auto' }}>
            <div style={{ background: '#fff', width: '100%', maxWidth: '800px', borderRadius: '24px', height: 'fit-content', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', margin: '20px 0' }}>
                <div style={{ padding: '20px 25px', background: '#fff', color: '#1e3a8a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', textTransform: 'uppercase', letterSpacing:'-0.5px' }}>{isEditing ? '✏️ Editando Estadísticas' : '📊 Box Score Oficial'}</h3>
                        <p style={{margin:'5px 0 0 0', fontSize:'0.75rem', color:'#64748b'}}>Detalle del partido</p>
                    </div>
                    <div style={{display:'flex', gap:'10px'}}>
                        {rol === 'admin' && !loading && (isEditing ? <button onClick={saveChanges} style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '12px', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize:'0.75rem', boxShadow:'0 4px 12px rgba(16, 185, 129, 0.2)' }}>💾 GUARDAR</button> : <button onClick={() => setIsEditing(true)} style={{ background: '#f59e0b', color: 'white', border: 'none', borderRadius: '12px', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize:'0.75rem', boxShadow:'0 4px 12px rgba(245, 158, 11, 0.2)' }}>✏️ EDITAR</button>)}
                        <button onClick={onClose} style={{ color: '#475569', background: '#f1f5f9', border: 'none', borderRadius: '12px', padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize:'0.75rem' }}>CERRAR</button>
                    </div>
                </div>
                {/* Visualización de marcador */}
                <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '35px 20px', background: 'linear-gradient(to bottom, #fff, #f8fafc)', borderBottom:'1px solid #f1f5f9' }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'white', border: '3px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', overflow: 'hidden', padding: '5px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                            <TeamLogo logoUrl={getLogo(match.equipoLocalId)} altText="L" />
                        </div>
                        <div style={{ color: '#3b82f6', fontWeight: '900', fontSize: '2.5rem', marginTop: '15px', lineHeight:1 }}>{match.marcadorLocal}</div>
                        <div style={{ fontSize:'0.8rem', fontWeight:'bold', color:'#64748b', marginTop:'5px' }}>{match.equipoLocalNombre}</div>
                    </div>
                    <div style={{ fontSize: '1.5rem', color: '#cbd5e1', fontWeight: '900', paddingBottom:'30px' }}>VS</div>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'white', border: '3px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', overflow: 'hidden', padding: '5px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
                            <TeamLogo logoUrl={getLogo(match.equipoVisitanteId)} altText="V" />
                        </div>
                        <div style={{ color: '#ef4444', fontWeight: '900', fontSize: '2.5rem', marginTop: '15px', lineHeight:1 }}>{match.marcadorVisitante}</div>
                        <div style={{ fontSize:'0.8rem', fontWeight:'bold', color:'#64748b', marginTop:'5px' }}>{match.equipoVisitanteNombre}</div>
                    </div>
                </div>
                <div style={{ padding: '30px 25px 50px 25px', background:'#fff' }}>
                    {loading ? <div style={{textAlign:'center', padding:'50px', color:'#64748b', fontWeight:'bold'}}>⏳ Cargando estadísticas...</div> : (
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

// --- COMPONENTE PRINCIPAL (VISUAL OPTIMIZADO) ---
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

    if (loading) return <div style={{padding:'100px', color:'#1e3a8a', textAlign:'center', fontWeight:'bold', fontSize:'1.2rem'}}>⏳ CARGANDO CALENDARIO {categoria}...</div>;

    return (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'#f0f4f8', zIndex:1000, display:'flex', flexDirection:'column' }}>
            {selectedBoxScore && <BoxScoreModal match={selectedBoxScore} onClose={() => setSelectedBoxScore(null)} getLogo={getLogo} rol={rol} />}

            <div style={{background:'#fff', color:'#1e3a8a', padding:'20px 25px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #e2e8f0', boxShadow:'0 4px 20px rgba(0,0,0,0.03)'}}>
                <div>
                    <h2 style={{margin:0, fontSize:'1.5rem', fontWeight:'900', letterSpacing:'-1px'}}>📅 CALENDARIO {categoria}</h2>
                    <p style={{margin:'5px 0 0 0', fontSize:'0.75rem', color:'#64748b', fontWeight:'bold'}}>Liga Metropolitana Eje Este</p>
                </div>
                <button onClick={onClose} style={{background:'#f1f5f9', color:'#475569', border:'none', padding:'10px 20px', borderRadius:'12px', fontWeight:'900', fontSize:'0.75rem', cursor:'pointer', transition:'0.2s'}}>CERRAR</button>
            </div>

            <div className="no-scrollbar" style={{ background:'white', padding:'15px 25px', display:'flex', gap:'12px', overflowX:'auto', whiteSpace:'nowrap', borderBottom:'1px solid #f1f5f9' }}>
                {['TODOS', 'A', 'B', 'PLAYOFFS'].map((f) => {
                    const isActive = activeFilter === f;
                    const isPlayoff = f === 'PLAYOFFS';
                    const baseColor = isPlayoff ? '#ef4444' : '#1e3a8a';
                    return (
                    <button 
                        key={f} 
                        onClick={() => setActiveFilter(f)} 
                        style={{ 
                            padding:'10px 20px', 
                            borderRadius:'25px', 
                            border: 'none',
                            background: isActive ? baseColor : (isPlayoff ? '#fef2f2' : '#f1f5f9'),
                            color: isActive ? 'white' : baseColor,
                            fontSize:'0.75rem', 
                            fontWeight:'900', 
                            cursor:'pointer', 
                            transition:'0.3s',
                            boxShadow: isActive ? `0 4px 12px ${baseColor}40` : 'none',
                            flexShrink: 0
                        }}
                    >
                        {f === 'TODOS' ? '🗓️ TODOS' : f === 'PLAYOFFS' ? '🏆 PLAYOFFS' : `GRUPO ${f}`}
                    </button>
                )})}
            </div>

            <div style={{flex:1, overflowY:'auto', padding:'25px', background:'#f0f4f8'}}>
                <div style={{maxWidth:'700px', margin:'0 auto'}}>
                    {rol === 'admin' && (
                        <button onClick={() => { setMatchToEdit(null); setShowMatchForm(true); }} style={{ width:'100%', padding:'18px', background: 'linear-gradient(135deg, #10b981, #059669)', color:'white', border:'none', borderRadius:'20px', fontWeight:'900', fontSize:'0.9rem', cursor:'pointer', marginBottom:'30px', boxShadow:'0 10px 25px -5px rgba(16, 185, 129, 0.4)', display:'flex', justifyContent:'center', alignItems:'center', gap:'10px' }}>
                            <span style={{fontSize:'1.2rem'}}>➕</span> PROGRAMAR NUEVO JUEGO
                        </button>
                    )}

                    <div style={{display:'flex', flexDirection:'column', gap:'25px', paddingBottom:'100px'}}>
                        {filteredMatches.length > 0 ? filteredMatches.map(m => {
                            const isFinished = m.estatus === 'finalizado';
                            const isPlayoff = m.fase === 'playoff';
                            const themeColor = isPlayoff ? '#ef4444' : (isFinished ? '#1e3a8a' : (m.grupo === 'A' ? '#3b82f6' : '#f59e0b'));
                            const bgColor = isPlayoff ? '#fef2f2' : (isFinished ? '#f8fafc' : (m.grupo === 'A' ? '#eff6ff' : '#fffbeb'));

                            return (
                                <div key={m.id} style={{ 
                                    background:'white', 
                                    borderRadius:'24px', 
                                    overflow:'hidden', 
                                    boxShadow:'0 10px 30px -5px rgba(0,0,0,0.08)',
                                    border: `1px solid ${themeColor}30`,
                                    position:'relative'
                                }}>
                                    <div style={{ background: bgColor, padding:'12px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:`1px solid ${themeColor}20` }}>
                                        <span style={{ fontSize:'0.7rem', fontWeight:'900', color: themeColor, textTransform:'uppercase', letterSpacing:'0.5px' }}>
                                            {isPlayoff ? `🏆 ${m.tituloCruce || 'PLAYOFF'}` : `GRUPO ${m.grupo} • REGULAR`}
                                        </span>
                                        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                                            <span style={{ fontSize:'0.7rem', fontWeight:'bold', color:'#64748b', background:'white', padding:'4px 10px', borderRadius:'12px' }}>📅 {m.fechaAsignada}</span>
                                            <span style={{ fontSize:'0.7rem', fontWeight:'900', color:'white', background: themeColor, padding:'4px 10px', borderRadius:'12px', boxShadow:`0 2px 8px ${themeColor}40` }}>⏰ {m.hora || 'S.H'}</span>
                                        </div>
                                    </div>

                                    <div style={{ display:'flex', padding:'30px 20px', alignItems:'center', justifyContent:'space-around' }}>
                                        <div style={{ flex:1, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center' }}>
                                            <div style={{width:'75px', height:'75px', borderRadius:'50%', background:'white', border:`3px solid ${bgColor}`, overflow:'hidden', padding:'5px', boxShadow:'0 8px 15px -3px rgba(0,0,0,0.1)'}}>
                                                <TeamLogo logoUrl={getLogo(m.equipoLocalId)} altText="L" />
                                            </div>
                                            <div style={{fontWeight:'900', fontSize:'0.85rem', marginTop:'12px', color:'#1e293b'}}>{m.equipoLocalNombre.toUpperCase()}</div>
                                            {isFinished && <div style={{fontSize:'2.2rem', fontWeight:'900', color: themeColor, marginTop:'8px', lineHeight:1}}>{m.marcadorLocal}</div>}
                                        </div>

                                        <div style={{ flex:0.3, textAlign:'center', paddingTop: isFinished ? '60px' : '0' }}>
                                            {isFinished ? <div style={{background: themeColor, color:'white', fontSize:'0.6rem', padding:'6px 12px', borderRadius:'10px', fontWeight:'900', letterSpacing:'1px'}}>FINAL</div> : <div style={{fontSize:'1.2rem', fontWeight:'900', color:'#cbd5e1'}}>VS</div>}
                                        </div>

                                        <div style={{ flex:1, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center' }}>
                                            <div style={{width:'75px', height:'75px', borderRadius:'50%', background:'white', border:`3px solid ${bgColor}`, overflow:'hidden', padding:'5px', boxShadow:'0 8px 15px -3px rgba(0,0,0,0.1)'}}>
                                                <TeamLogo logoUrl={getLogo(m.equipoVisitanteId)} altText="V" />
                                            </div>
                                            <div style={{fontWeight:'900', fontSize:'0.85rem', marginTop:'12px', color:'#1e293b'}}>{m.equipoVisitanteNombre.toUpperCase()}</div>
                                            {isFinished && <div style={{fontSize:'2.2rem', fontWeight:'900', color: themeColor, marginTop:'8px', lineHeight:1}}>{m.marcadorVisitante}</div>}
                                        </div>
                                    </div>

                                    {rol === 'admin' && (
                                        <div style={{ display:'flex', padding:'10px 20px', gap:'10px', background: bgColor }}>
                                            <button onClick={() => handleEditMatch(m)} style={{ flex:1, background:'white', border:`1px solid ${themeColor}40`, padding:'10px', borderRadius:'12px', fontSize:'0.7rem', fontWeight:'bold', color: themeColor, cursor:'pointer', display:'flex', justifyContent:'center', alignItems:'center', gap:'6px' }}>✏️ Editar</button>
                                            <button onClick={() => handleDeleteMatch(m.id)} style={{ flex:1, background:'white', border:'1px solid #fca5a5', padding:'10px', borderRadius:'12px', fontSize:'0.7rem', fontWeight:'bold', color:'#ef4444', cursor:'pointer', display:'flex', justifyContent:'center', alignItems:'center', gap:'6px' }}>🗑️ Eliminar</button>
                                        </div>
                                    )}

                                    {isFinished && (
                                        <button onClick={() => setSelectedBoxScore(m)} style={{ width:'100%', background: themeColor, border:'none', padding:'15px', color: 'white', fontSize:'0.75rem', fontWeight:'900', cursor:'pointer', letterSpacing:'1px', transition:'0.2s' }}>
                                            📊 VER BOX SCORE OFICIAL
                                        </button>
                                    )}
                                </div>
                            );
                        }) : (
                            <div style={{textAlign:'center', padding:'80px 20px', background:'white', borderRadius:'24px', boxShadow:'0 4px 20px rgba(0,0,0,0.05)'}}>
                                <div style={{fontSize:'3rem'}}>📭</div>
                                <p style={{color:'#64748b', fontWeight:'bold', marginTop:'15px'}}>No hay juegos programados en esta sección.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {showMatchForm && (
                <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(15, 23, 42, 0.8)', backdropFilter:'blur(8px)', zIndex:2000, display:'flex', justifyContent:'center', alignItems:'center', padding:'20px'}}>
                    <div style={{width:'100%', maxWidth:'500px', background:'white', borderRadius:'25px', overflow:'hidden', boxShadow:'0 25px 50px -12px rgba(0,0,0,0.25)'}}>
                        <MatchForm matchToEdit={matchToEdit} categoriaActiva={categoria} onSuccess={() => { setShowMatchForm(false); setMatchToEdit(null); }} onClose={() => { setShowMatchForm(false); setMatchToEdit(null); }} />
                    </div>
                </div>
            )}
             <style>{`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
        </div>
    );
};

export default CalendarViewer;