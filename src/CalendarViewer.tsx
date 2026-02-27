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

    // --- LÓGICA DE MVP REFORZADA ---
    const getMVP = () => {
        if (!stats || stats.length === 0) return null;

        const ptsLocal = Number(match.marcadorLocal) || 0;
        const ptsVisita = Number(match.marcadorVisitante) || 0;
        
        let idGanador = ptsLocal > ptsVisita ? match.equipoLocalId : (ptsVisita > ptsLocal ? match.equipoVisitanteId : null);
        let nombreGanador = ptsLocal > ptsVisita ? match.equipoLocalNombre : (ptsVisita > ptsLocal ? match.equipoVisitanteNombre : null);

        let jugadoresElegibles = stats.filter(s => {
            const coincideId = idGanador && s.equipoId?.toString() === idGanador.toString();
            const coincideNombre = nombreGanador && s.equipo?.trim().toUpperCase() === nombreGanador.trim().toUpperCase();
            return coincideId || coincideNombre;
        });

        if (jugadoresElegibles.length === 0) jugadoresElegibles = stats;

        const calcularVal = (p) => {
            const puntos = (Number(p.dobles||0)*2) + (Number(p.triples||0)*3) + Number(p.tirosLibres||0);
            return puntos + Number(p.rebotes||0) + Number(p.robos||0) + Number(p.bloqueos||p.tapones||0);
        };

        return [...jugadoresElegibles].sort((a, b) => calcularVal(b) - calcularVal(a))[0];
    };

    const mvp = getMVP();

    const handleStatChange = (statId, field, value) => {
        const val = value === '' ? 0 : parseInt(value);
        setEditedStats(prev => ({
            ...prev,
            [statId]: { ...prev[statId], [field]: isNaN(val) ? 0 : val }
        }));
    };

    const saveChanges = async () => {
        if(!window.confirm("¿Confirmar cambios?")) return;
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

    const renderTable = (teamName, teamId) => {
        const players = stats.filter(s => {
            const porId = s.equipoId?.toString() === teamId?.toString();
            const porNombre = s.equipo && teamName && s.equipo.trim().toUpperCase() === teamName.trim().toUpperCase();
            return porId || porNombre;
        });

        const sourceData = isEditing ? Object.values(editedStats).filter(s => players.find(p => p.id === s.id)) : players;
        const totalPuntosJugadores = sourceData.reduce((acc, p) => acc + (Number(p.tirosLibres)||0) + (Number(p.dobles)||0)*2 + (Number(p.triples)||0)*3, 0);

        return (
            <div style={{ marginBottom: '30px', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ background: '#f8fafc', color: '#0f172a', padding: '12px 15px', fontWeight: '900', fontSize: '1rem', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom: '2px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '30px', height: '30px', borderRadius: '50%', border: '1px solid #cbd5e1', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#fff' }}>
                            <TeamLogo logoUrl={getLogo(teamId, teamName)} altText="logo" />
                        </div>
                        <span style={{textTransform: 'uppercase'}}>{teamName}</span>
                    </div>
                    <span style={{fontSize:'0.75rem', background:'#e2e8f0', color:'#0f172a', padding:'4px 10px', borderRadius:'12px', fontWeight:'bold'}}>TOTAL: {totalPuntosJugadores} PTS</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'center' }}>
                        <thead style={{ background: '#fff', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '12px 15px' }}>JUGADOR</th>
                                <th style={{ color: '#0f172a', fontWeight:'900' }}>PTS</th>
                                <th>2P</th><th>3P</th><th>TL</th><th>REB</th><th>TAP</th><th>ROB</th>
                            </tr>
                        </thead>
                        <tbody>
                            {players.map((p) => {
                                const currentStat = isEditing ? editedStats[p.id] : p;
                                const pts = (Number(currentStat?.tirosLibres)||0) + (Number(currentStat?.dobles)||0)*2 + (Number(currentStat?.triples)||0)*3;
                                const isPlayerMVP = mvp && p.id === mvp.id;
                                return (
                                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: isPlayerMVP && !isEditing ? '#fff9db' : '#fff' }}>
                                        <td style={{ textAlign: 'left', padding: '12px 15px', fontWeight: 'bold' }}>
                                            {p.nombre} {isPlayerMVP && !isEditing && <span style={{fontSize:'0.6rem', background:'#f59e0b', color:'#fff', padding:'2px 4px', borderRadius:'4px', marginLeft:'5px'}}>MVP</span>}
                                        </td>
                                        <td style={{ fontWeight: '900', fontSize: '1rem' }}>{pts}</td>
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
                                                <td>{p.dobles || 0}</td><td>{p.triples || 0}</td><td>{p.tirosLibres || 0}</td><td>{p.rebotes || 0}</td><td>{p.bloqueos || p.tapones || 0}</td><td>{p.robos || 0}</td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const inputStyle = { width: '40px', padding: '4px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '4px' };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.75)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '15px' }}>
            <div style={{ background: '#fff', width: '100%', maxWidth: '750px', borderRadius: '12px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900' }}>{isEditing ? '✏️ EDITAR STATS' : 'ESTADÍSTICAS'}</h3>
                    <div style={{display:'flex', gap:'10px'}}>
                        {rol === 'admin' && (isEditing ? <button onClick={saveChanges} style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 15px', fontWeight: 'bold' }}>GUARDAR</button> : <button onClick={() => setIsEditing(true)} style={{ background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 15px', fontWeight: 'bold' }}>EDITAR</button>)}
                        <button onClick={onClose} style={{ color: '#64748b', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>CERRAR</button>
                    </div>
                </div>
                
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1, paddingBottom: '40px' }}>
                    {!loading && mvp && !isEditing && (
                        <div style={{ background: 'linear-gradient(to right, #fff9db, #fff)', padding: '15px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <div style={{ fontSize: '2.5rem' }}>🏆</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#f59e0b', textTransform: 'uppercase' }}>MVP del Juego</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0f172a' }}>{mvp.nombre}</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    Val: {(Number(mvp.dobles||0)*2 + Number(mvp.triples||0)*3 + Number(mvp.tirosLibres||0)) + (Number(mvp.rebotes)||0) + (Number(mvp.robos)||0) + (Number(mvp.bloqueos)||Number(mvp.tapones)||0)} | {mvp.rebotes || 0} REB | {mvp.robos || 0} ROB
                                </div>
                            </div>
                            <div style={{ width: '55px', height: '55px', borderRadius: '50%', border: '2px solid #f59e0b', overflow: 'hidden', background: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                <TeamLogo logoUrl={getLogo(mvp.equipoId, mvp.equipo)} altText="mvp-team" />
                            </div>
                        </div>
                    )}
                    {loading ? <p style={{textAlign:'center'}}>Cargando...</p> : (
                        <>
                            {renderTable(match.equipoLocalNombre, match.equipoLocalId)}
                            {renderTable(match.equipoVisitanteNombre, match.equipoVisitanteId)}
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
        const colCalendario = isMaster ? 'calendario' : `calendario_${catStr}`;
        const colEquipos = isMaster ? 'equipos' : `equipos_${catStr}`;

        const qM = query(collection(db, colCalendario), orderBy('fechaAsignada', 'asc'));
        const unsubMatches = onSnapshot(qM, (snap) => {
            let allMatches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (isMaster) {
                const NUEVAS = ['U19', 'FEMENINO', 'LIBRE']; 
                allMatches = allMatches.filter(m => !NUEVAS.includes((m.categoria || '').trim().toUpperCase()));
            }
            setMatches(allMatches.sort((a, b) => a.fechaAsignada.localeCompare(b.fechaAsignada) || (a.hora || "").localeCompare(b.hora || "")));
            setLoading(false);
        });

        const qE = query(collection(db, colEquipos), orderBy('nombre', 'asc'));
        const unsubEquipos = onSnapshot(qE, (snap) => {
            setEquipos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => { unsubMatches(); unsubEquipos(); };
    }, [categoria]); 

    // --- FUNCIÓN GETLOGO MEJORADA PARA BUSCAR POR ID O NOMBRE ---
    const getLogo = (teamId, teamName) => {
        const porId = equipos.find(e => e.id?.toString() === teamId?.toString());
        if (porId) return porId.logoUrl;
        const porNombre = equipos.find(e => e.nombre?.trim().toUpperCase() === teamName?.trim().toUpperCase());
        return porNombre?.logoUrl || DEFAULT_LOGO;
    };

    const handleDeleteMatch = async (id) => {
        if (window.confirm("¿Eliminar?")) {
            const catStr = categoria.trim().toUpperCase();
            const colName = (catStr === 'MASTER40' || catStr === 'MASTER') ? 'calendario' : `calendario_${catStr}`;
            await deleteDoc(doc(db, colName, id));
        }
    };

    const filteredMatches = matches.filter(m => {
        if (activeFilter === 'TODOS') return true;
        if (activeFilter === 'PLAYOFFS') return m.fase === 'playoff';
        return (m.grupo || '').toUpperCase() === activeFilter;
    });

    return (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'#f3f4f6', zIndex:1000, display:'flex', flexDirection:'column' }}>
            {selectedBoxScore && <BoxScoreModal match={selectedBoxScore} onClose={() => setSelectedBoxScore(null)} getLogo={getLogo} rol={rol} />}

            <div style={{background:'#fff', padding:'15px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #e5e7eb'}}>
                <div>
                    <h2 style={{margin:0, fontSize:'1.1rem', fontWeight:'900'}}>Resultados {categoria}</h2>
                    <p style={{margin:0, fontSize:'0.7rem', color:'#6b7280'}}>Liga Metropolitana Eje Este</p>
                </div>
                <button onClick={onClose} style={{background:'none', color:'#06c', border:'none', fontWeight:'bold', cursor:'pointer'}}>VOLVER</button>
            </div>

            <div className="no-scrollbar" style={{ background:'white', padding:'10px 20px', display:'flex', gap:'10px', overflowX:'auto', borderBottom:'1px solid #e5e7eb' }}>
                {['TODOS', 'A', 'B', 'PLAYOFFS'].map((f) => (
                    <button key={f} onClick={() => setActiveFilter(f)} style={{ padding:'6px 14px', borderRadius:'20px', border: activeFilter === f ? '1px solid #000' : '1px solid #d1d5db', background: activeFilter === f ? '#000' : '#fff', color: activeFilter === f ? '#fff' : '#4b5563', fontSize:'0.7rem', fontWeight:'bold' }}>
                        {f === 'TODOS' ? 'Todos' : f === 'PLAYOFFS' ? 'Playoffs' : `Grupo ${f}`}
                    </button>
                ))}
            </div>

            <div style={{flex:1, overflowY:'auto', padding:'20px 15px'}}>
                <div style={{maxWidth:'700px', margin:'0 auto', display:'flex', flexDirection:'column', gap:'12px'}}>
                    {rol === 'admin' && (
                        <button onClick={() => { setMatchToEdit(null); setShowMatchForm(true); }} style={{ padding:'12px', background:'#fff', border:'1px solid #d1d5db', borderRadius:'8px', fontWeight:'bold', fontSize:'0.8rem', marginBottom:'10px' }}>
                            ➕ Programar Juego
                        </button>
                    )}

                    {filteredMatches.map((m) => {
                        const isFinished = m.estatus === 'finalizado';
                        const themeColor = m.fase === 'playoff' ? '#ef4444' : (m.grupo === 'A' ? '#3b82f6' : (m.grupo === 'B' ? '#f59e0b' : '#10b981'));
                        return (
                            <div key={m.id} style={{ display: 'flex', background: '#fff', borderRadius: '10px', border: `1.5px solid ${themeColor}`, overflow: 'hidden' }}>
                                <div style={{ width: '65px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: `${themeColor}10` }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold' }}>{isFinished ? 'FINAL' : m.hora}</span>
                                    <span style={{ fontSize: '0.55rem', color: '#6b7280' }}>{m.fechaAsignada.split('-').slice(1).join('/')}</span>
                                </div>
                                <div style={{ flex: 1, padding: '10px 15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', overflow: 'hidden' }}><TeamLogo logoUrl={getLogo(m.equipoLocalId, m.equipoLocalNombre)} /></div>
                                            <span style={{ fontSize: '0.85rem', fontWeight: (isFinished && Number(m.marcadorLocal) > Number(m.marcadorVisitante)) ? '900' : '500' }}>{m.equipoLocalNombre}</span>
                                        </div>
                                        {isFinished && <span style={{ fontWeight: '900' }}>{m.marcadorLocal}</span>}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', overflow: 'hidden' }}><TeamLogo logoUrl={getLogo(m.equipoVisitanteId, m.equipoVisitanteNombre)} /></div>
                                            <span style={{ fontSize: '0.85rem', fontWeight: (isFinished && Number(m.marcadorVisitante) > Number(m.marcadorLocal)) ? '900' : '500' }}>{m.equipoVisitanteNombre}</span>
                                        </div>
                                        {isFinished && <span style={{ fontWeight: '900' }}>{m.marcadorVisitante}</span>}
                                    </div>
                                </div>
                                <div style={{ width: '80px', borderLeft: '1px solid #eee', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '5px' }}>
                                    {isFinished ? <button onClick={() => setSelectedBoxScore(m)} style={{ background: 'none', border: 'none', color: '#06c', fontSize: '0.65rem', fontWeight: '800', cursor: 'pointer' }}>STATS</button> : <span style={{fontSize:'0.6rem', color:'#9ca3af'}}>PREVIA</span>}
                                    {rol === 'admin' && (
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <button onClick={() => { setMatchToEdit(m); setShowMatchForm(true); }} style={{background:'none', border:'none'}}>✏️</button>
                                            <button onClick={() => handleDeleteMatch(m.id)} style={{background:'none', border:'none'}}>🗑️</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {showMatchForm && (
                <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.6)', zIndex:2000, display:'flex', justifyContent:'center', alignItems:'center', padding:'20px'}}>
                    <div style={{width:'100%', maxWidth:'450px', background:'#fff', borderRadius:'12px'}}>
                        <MatchForm matchToEdit={matchToEdit} categoriaActiva={categoria} onSuccess={() => setShowMatchForm(false)} onClose={() => setShowMatchForm(false)} />
                    </div>
                </div>
            )}
            <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
        </div>
    );
};

export default CalendarViewer;