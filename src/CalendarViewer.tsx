import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, onSnapshot, orderBy, deleteDoc, doc, getDocs, writeBatch, where } from 'firebase/firestore';
import MatchForm from './MatchForm'; 

const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/451/451716.png";

const BoxScoreModal = ({ match, onClose, getLogo }: any) => {
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

    const renderTable = (teamName: string, teamColor: string) => {
        const players = stats.filter(s => s.equipo === teamName);
        return (
            <div style={{ marginBottom: '25px' }}>
                <div style={{ background: teamColor, color: 'white', padding: '10px', fontWeight: 'bold', fontSize: '0.9rem', borderRadius: '8px 8px 0 0', textTransform: 'uppercase' }}>{teamName}</div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'center', color: 'white' }}>
                        <thead style={{ background: '#222', color: '#aaa' }}>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '10px' }}>JUGADOR</th>
                                <th style={{ color: teamColor }}>PTS</th>
                                <th>2P</th><th>3P</th><th>TL</th><th>REB</th><th>TAP</th><th>ROB</th>
                            </tr>
                        </thead>
                        <tbody>
                            {players.map((p, i) => {
                                const pts = (Number(p.tirosLibres)||0) + (Number(p.dobles)||0)*2 + (Number(p.triples)||0)*3;
                                return (
                                    <tr key={i} style={{ borderBottom: '1px solid #222' }}>
                                        <td style={{ textAlign: 'left', padding: '10px', fontWeight: 'bold', color: '#eee' }}>{p.nombre.toUpperCase()}</td>
                                        <td style={{ background: 'rgba(255,255,255,0.05)', fontWeight: 'bold', fontSize: '0.9rem', color: teamColor }}>{pts}</td>
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.98)', zIndex: 3000, display: 'flex', justifyContent: 'center', padding: '15px', overflowY: 'auto' }}>
            <div style={{ background: '#000', width: '100%', maxWidth: '750px', borderRadius: '15px', height: 'fit-content', border: '1px solid #333' }}>
                <div style={{ padding: '15px', background: '#111', color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #222' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '900' }}>📊 ESTADÍSTICAS DEL JUEGO</h3>
                    <button onClick={onClose} style={{ color: 'white', background: '#e11d48', border: 'none', borderRadius: '6px', padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize:'0.7rem' }}>CERRAR</button>
                </div>
                <div style={{ padding: '15px' }}>
                    {loading ? <p style={{textAlign:'center', color: '#666'}}>Cargando...</p> : (
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

const CalendarViewer: React.FC<{ rol: string, onClose: () => void }> = ({ rol, onClose }) => {
    const [matches, setMatches] = useState<any[]>([]);
    const [equipos, setEquipos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showMatchForm, setShowMatchForm] = useState(false); 
    const [selectedBoxScore, setSelectedBoxScore] = useState<any | null>(null);
    const [activeFilter, setActiveFilter] = useState<'TODOS' | 'A' | 'B'>('TODOS');

    useEffect(() => {
        const qM = query(collection(db, 'calendario'), orderBy('fechaAsignada', 'asc'));
        const unsubMatches = onSnapshot(qM, (snap) => {
            setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const qE = query(collection(db, 'equipos'), orderBy('nombre', 'asc'));
        const unsubEquipos = onSnapshot(qE, (snap) => {
            setEquipos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => { unsubMatches(); unsubEquipos(); };
    }, []);

    const getLogo = (teamId: string) => equipos.find(e => e.id === teamId)?.logoUrl || DEFAULT_LOGO;

    const filteredMatches = matches.filter(m => {
        if (activeFilter === 'TODOS') return true;
        return m.grupo === activeFilter;
    });

    if (loading) return <div style={{padding:'100px', color:'#1e3a8a', textAlign:'center', fontWeight:'bold'}}>CARGANDO CALENDARIO...</div>;

    return (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'#f8fafc', zIndex:1000, display:'flex', flexDirection:'column' }}>
            
            {selectedBoxScore && <BoxScoreModal match={selectedBoxScore} onClose={() => setSelectedBoxScore(null)} getLogo={getLogo} />}

            {/* HEADER FIJO */}
            <div style={{background:'#1e3a8a', color:'white', padding:'15px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'4px solid #f59e0b'}}>
                <div>
                    <h2 style={{margin:0, fontSize:'1rem', fontWeight:'900'}}>📅 CALENDARIO OFICIAL</h2>
                    <p style={{margin:0, fontSize:'0.6rem', opacity:0.8}}>LIGA METROPOLITANA MASTER 40</p>
                </div>
                <button onClick={onClose} style={{background:'white', color:'#1e3a8a', border:'none', padding:'8px 15px', borderRadius:'12px', fontWeight:'bold', fontSize:'0.7rem'}}>VOLVER</button>
            </div>

            {/* FILTROS POR GRUPO (TABS) */}
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
                        <button onClick={() => setShowMatchForm(true)} style={{ width:'100%', padding:'12px', background:'#10b981', color:'white', border:'none', borderRadius:'12px', fontWeight:'bold', fontSize:'0.8rem', cursor:'pointer', marginBottom:'15px', borderBottom:'4px solid #059669' }}>
                            ➕ PROGRAMAR NUEVO JUEGO
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
                                    {/* Cabecera del juego: Grupo y Fecha */}
                                    <div style={{ background:'#f8fafc', padding:'5px 15px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid #f1f5f9' }}>
                                        <span style={{ fontSize:'0.6rem', fontWeight:'900', color: m.grupo === 'A' ? '#3b82f6' : '#ef4444' }}>GRUPO {m.grupo}</span>
                                        <span style={{ fontSize:'0.65rem', fontWeight:'bold', color:'#64748b' }}>{m.fechaAsignada}</span>
                                    </div>

                                    <div style={{ display:'flex', padding:'15px', alignItems:'center', justifyContent:'space-between' }}>
                                        {/* Equipo Local */}
                                        <div style={{ flex:1, textAlign:'center' }}>
                                            <img src={getLogo(m.equipoLocalId)} style={{width:'45px', height:'45px', borderRadius:'50%', objectFit:'cover', border:'2px solid #f1f5f9'}} />
                                            <div style={{fontWeight:'900', fontSize:'0.7rem', marginTop:'5px', color:'#1e293b'}}>{m.equipoLocalNombre.toUpperCase()}</div>
                                            {isFinished && <div style={{fontSize:'1.5rem', fontWeight:'900', color:'#1e3a8a'}}>{m.marcadorLocal}</div>}
                                        </div>

                                        {/* VS o Estado */}
                                        <div style={{ flex:0.5, textAlign:'center' }}>
                                            {isFinished ? (
                                                <div style={{background:'#1e3a8a', color:'white', fontSize:'0.5rem', padding:'4px', borderRadius:'6px', fontWeight:'bold'}}>FINAL</div>
                                            ) : (
                                                <div style={{fontSize:'0.8rem', fontWeight:'900', color:'#cbd5e1'}}>VS</div>
                                            )}
                                        </div>

                                        {/* Equipo Visitante */}
                                        <div style={{ flex:1, textAlign:'center' }}>
                                            <img src={getLogo(m.equipoVisitanteId)} style={{width:'45px', height:'45px', borderRadius:'50%', objectFit:'cover', border:'2px solid #f1f5f9'}} />
                                            <div style={{fontWeight:'900', fontSize:'0.7rem', marginTop:'5px', color:'#1e293b'}}>{m.equipoVisitanteNombre.toUpperCase()}</div>
                                            {isFinished && <div style={{fontSize:'1.5rem', fontWeight:'900', color:'#1e3a8a'}}>{m.marcadorVisitante}</div>}
                                        </div>
                                    </div>

                                    {/* Botones de acción inferiores */}
                                    {isFinished && (
                                        <button onClick={() => setSelectedBoxScore(m)} style={{ width:'100%', background:'#f1f5f9', border:'none', padding:'10px', color:'#1e3a8a', fontSize:'0.7rem', fontWeight:'bold', cursor:'pointer', borderTop:'1px solid #f1f5f9' }}>
                                            📊 VER ESTADÍSTICAS COMPLETAS
                                        </button>
                                    )}
                                </div>
                            );
                        }) : (
                            <div style={{textAlign:'center', padding:'40px', color:'#94a3b8', fontSize:'0.8rem'}}>No hay juegos programados en este grupo.</div>
                        )}
                    </div>
                </div>
            </div>

            {showMatchForm && (
                <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', zIndex:2000, display:'flex', justifyContent:'center', alignItems:'center', padding:'20px'}}>
                    <div style={{width:'100%', maxWidth:'450px', background:'white', borderRadius:'20px', overflow:'hidden'}}><MatchForm onSuccess={() => setShowMatchForm(false)} onClose={() => setShowMatchForm(false)} /></div>
                </div>
            )}
        </div>
    );
};

export default CalendarViewer;