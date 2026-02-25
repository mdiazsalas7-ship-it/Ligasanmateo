import React, { useState, useEffect, memo } from 'react';
import { db } from './firebase'; 
import { doc, updateDoc, onSnapshot, collection, query, getDocs, setDoc, increment, where, writeBatch, limit, orderBy, addDoc } from 'firebase/firestore';

// --- FILA DE JUGADOR ---
const PlayerRow = memo(({ player, team, stats, onStat, onSub }: any) => {
    const s = stats || { puntos: 0, rebotes: 0, robos: 0, bloqueos: 0, triples: 0, dobles: 0, tirosLibres: 0 };

    return (
        <div style={{ marginBottom:'5px', padding:'6px 10px', borderRadius:'10px', background: '#1a1a1a', border: '1px solid #333', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'4px', alignItems:'center'}}>
                <div style={{display:'flex', alignItems:'center', gap:'8px', flex: 1, overflow:'hidden'}}>
                    <span style={{ 
                        background: team === 'local' ? '#3b82f6' : '#ef4444', 
                        color:'white', padding:'2px 6px', borderRadius:'4px', 
                        fontWeight:'900', fontSize:'0.8rem', minWidth:'25px', textAlign:'center' 
                    }}>
                        {player.numero || '??'}
                    </span>
                    <div style={{fontWeight:'800', color:'white', fontSize:'0.8rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                        {player.nombre}
                    </div>
                </div>
                {/* BOTÓN DE SUSTITUCIÓN DIRECTA */}
                <button onClick={() => onSub(player.id)} style={{background:'#334155', color:'#60a5fa', border:'none', borderRadius:'4px', padding:'4px 8px', fontSize:'0.6rem', cursor:'pointer', fontWeight:'bold', display:'flex', alignItems:'center', gap:'3px'}}>
                    🔄 CAMBIO
                </button>
            </div>
            
            <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'4px'}}>
                <button onClick={()=>onStat(player, team, 'tirosLibres', 1)} className="btn-stat" style={{background:'#475569'}}>+1 TL({s.tirosLibres || 0})</button>
                <button onClick={()=>onStat(player, team, 'dobles', 1)} className="btn-stat" style={{background:'#1e40af'}}>+2 PT({s.dobles || 0})</button>
                <button onClick={()=>onStat(player, team, 'triples', 1)} className="btn-stat" style={{background:'#7c3aed'}}>+3 PT({s.triples || 0})</button>
                <button onClick={()=>onStat(player, team, 'rebotes', 1)} className="btn-stat" style={{background:'#047857'}}>RB({s.rebotes || 0})</button>
                <button onClick={()=>onStat(player, team, 'robos', 1)} className="btn-stat" style={{background:'#b45309'}}>RO({s.robos || 0})</button>
                <button onClick={()=>onStat(player, team, 'bloqueos', 1)} className="btn-stat" style={{background:'#991b1b'}}>BQ({s.bloqueos || 0})</button>
            </div>
        </div>
    );
});

const MesaTecnica: React.FC<{ categoria: string, onClose: () => void }> = ({ categoria, onClose }) => {
    const [matches, setMatches] = useState<any[]>([]);
    const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
    const [matchData, setMatchData] = useState<any | null>(null);
    const [logos, setLogos] = useState({ local: '', visitante: '' });
    
    const [playersLocal, setPlayersLocal] = useState<any[]>([]);
    const [playersVisitante, setPlayersVisitante] = useState<any[]>([]);
    
    const [presentLocal, setPresentLocal] = useState<string[]>([]);
    const [presentVisitante, setPresentVisitante] = useState<string[]>([]);
    const [checkInDone, setCheckInDone] = useState(false);
    const [startersDone, setStartersDone] = useState(false);

    const [onCourtLocal, setOnCourtLocal] = useState<string[]>([]);
    const [onCourtVisitante, setOnCourtVisitante] = useState<string[]>([]);
    
    // Estado para el modal de cambio: guarda a quién vamos a sacar
    const [subModal, setSubModal] = useState<{team: 'local' | 'visitante', replacingId: string | null, isOpen: boolean}>({team: 'local', replacingId: null, isOpen: false});
    
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [statsCache, setStatsCache] = useState<Record<string, any>>({});
    const [recentPlays, setRecentPlays] = useState<any[]>([]);

    const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/166/166344.png";

    const getCalCol = () => {
        const cat = categoria.toUpperCase();
        return (cat === 'MASTER40' || cat === 'MASTER') ? 'calendario' : `calendario_${cat}`;
    };
    const getPlayersCol = () => {
        const cat = categoria.toUpperCase();
        return (cat === 'MASTER40' || cat === 'MASTER') ? 'jugadores' : `jugadores_${cat}`;
    };
    const getTeamsCol = () => {
        const cat = categoria.toUpperCase();
        return (cat === 'MASTER40' || cat === 'MASTER') ? 'equipos' : `equipos_${cat}`;
    };

    // --- EFECTOS DE CARGA (IGUALES) ---
    useEffect(() => {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const localDate = new Date(now.getTime() - offset).toISOString().split('T')[0];
        const q = query(collection(db, getCalCol()), where('fechaAsignada', '==', localDate), where('estatus', '==', 'programado'));
        const unsub = onSnapshot(q, (snap) => setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => unsub();
    }, [categoria]);

    useEffect(() => {
        if (!selectedMatchId) return;
        const unsubMatch = onSnapshot(doc(db, getCalCol(), selectedMatchId), async (snap) => {
            if (snap.exists()) {
                const data = { id: snap.id, ...snap.data() } as any;
                setMatchData(data);
                const lDoc = await getDocs(query(collection(db, getTeamsCol()), where('nombre', '==', data.equipoLocalNombre)));
                const vDoc = await getDocs(query(collection(db, getTeamsCol()), where('nombre', '==', data.equipoVisitanteNombre)));
                setLogos({ local: lDoc.docs[0]?.data()?.logoUrl || DEFAULT_LOGO, visitante: vDoc.docs[0]?.data()?.logoUrl || DEFAULT_LOGO });
            }
        });
        const unsubPlays = onSnapshot(query(collection(db, 'jugadas_partido'), where('partidoId', '==', selectedMatchId), orderBy('timestamp', 'desc'), limit(15)), (snap) => setRecentPlays(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        const unsubStats = onSnapshot(query(collection(db, 'stats_partido'), where('partidoId', '==', selectedMatchId)), (snap) => {
            const cache: Record<string, any> = {};
            snap.docs.forEach(d => { cache[d.data().jugadorId] = d.data(); });
            setStatsCache(cache);
        });
        return () => { unsubMatch(); unsubPlays(); unsubStats(); };
    }, [selectedMatchId, categoria]);

    useEffect(() => {
        if (matchData?.equipoLocalId && matchData?.equipoVisitanteId) {
            const fetchRosters = async () => {
                const playerColName = getPlayersCol();
                const qL = query(collection(db, playerColName), where('equipoId', '==', matchData.equipoLocalId));
                const qV = query(collection(db, playerColName), where('equipoId', '==', matchData.equipoVisitanteId));
                const [snapL, snapV] = await Promise.all([getDocs(qL), getDocs(qV)]);
                setPlayersLocal(snapL.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (parseInt(a.numero)||0)-(parseInt(b.numero)||0)));
                setPlayersVisitante(snapV.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (parseInt(a.numero)||0)-(parseInt(b.numero)||0)));
            };
            fetchRosters();
        }
    }, [matchData?.id, categoria]);

    // --- LÓGICA DE JUEGO ---
    const handleStat = async (player: any, team: 'local'|'visitante', field: string, val: number) => {
        if (!matchData) return;
        let pts = field === 'tirosLibres' ? 1 : field === 'dobles' ? 2 : field === 'triples' ? 3 : 0;
        await addDoc(collection(db, 'jugadas_partido'), { partidoId: matchData.id, jugadorId: player.id, jugadorNombre: player.nombre, jugadorNumero: player.numero || '??', equipo: team, accion: field, puntos: pts, timestamp: Date.now() });
        if (pts > 0) await updateDoc(doc(db, getCalCol(), matchData.id), { [team === 'local' ? 'marcadorLocal' : 'marcadorVisitante']: increment(pts) });
        await setDoc(doc(db, 'stats_partido', `${matchData.id}_${player.id}`), { partidoId: matchData.id, jugadorId: player.id, nombre: player.nombre, numero: player.numero || '??', equipo: team === 'local' ? matchData.equipoLocalNombre : matchData.equipoVisitanteNombre, [field]: increment(val), puntos: increment(pts) }, { merge: true });
    };

    const handleFinalize = async () => {
        if (!matchData || !window.confirm("¿FINALIZAR PARTIDO Y ACTUALIZAR TABLAS?")) return;
        const batch = writeBatch(db);
        const win = matchData.marcadorLocal > matchData.marcadorVisitante;
        const lRef = doc(db, getTeamsCol(), matchData.equipoLocalId);
        const vRef = doc(db, getTeamsCol(), matchData.equipoVisitanteId);
        if (win) {
            batch.update(lRef, { victorias: increment(1), puntos: increment(2), puntos_favor: increment(matchData.marcadorLocal), puntos_contra: increment(matchData.marcadorVisitante) });
            batch.update(vRef, { derrotas: increment(1), puntos: increment(1), puntos_favor: increment(matchData.marcadorVisitante), puntos_contra: increment(matchData.marcadorLocal) });
        } else {
            batch.update(vRef, { victorias: increment(1), puntos: increment(2), puntos_favor: increment(matchData.marcadorVisitante), puntos_contra: increment(matchData.marcadorLocal) });
            batch.update(lRef, { derrotas: increment(1), puntos: increment(1), puntos_favor: increment(matchData.marcadorLocal), puntos_contra: increment(matchData.marcadorVisitante) });
        }
        const statsSnap = await getDocs(query(collection(db, 'stats_partido'), where('partidoId', '==', matchData.id)));
        statsSnap.forEach(sDoc => {
            const s = sDoc.data();
            batch.update(doc(db, getPlayersCol(), s.jugadorId), { puntos: increment(Number(s.puntos) || 0), triples: increment(Number(s.triples) || 0), partidosJugados: increment(1) });
        });
        batch.update(doc(db, getCalCol(), matchData.id), { estatus: 'finalizado' });
        await batch.commit();
        alert("✅ Liga y Estadísticas actualizadas correctamente.");
        onClose();
    };

    // --- LÓGICA DE SUSTITUCIÓN DIRECTA ---
    const executeSwap = (newPlayerId: string) => {
        const { team, replacingId } = subModal;
        if (!replacingId) return;

        if (team === 'local') {
            const newCourt = onCourtLocal.map(id => id === replacingId ? newPlayerId : id);
            setOnCourtLocal(newCourt);
        } else {
            const newCourt = onCourtVisitante.map(id => id === replacingId ? newPlayerId : id);
            setOnCourtVisitante(newCourt);
        }
        setSubModal({ ...subModal, isOpen: false, replacingId: null });
    };

    // 1. LISTA DE PARTIDOS
    if (!selectedMatchId) return (
        <div style={{padding:'20px', color:'white', background:'#000', minHeight:'100vh'}}>
            <h2 style={{color: '#60a5fa', marginBottom:'20px'}}>⏱️ Mesa Técnica - {categoria}</h2>
            {matches.length === 0 ? (
                <div style={{textAlign:'center', padding:'40px', border:'1px dashed #333', borderRadius:'15px'}}>
                    <p style={{color:'#666'}}>No hay juegos programados hoy.</p>
                </div>
            ) : matches.map(m => (
                <button key={m.id} onClick={()=>setSelectedMatchId(m.id)} style={{padding:'18px', background:'#1a1a1a', border:'1px solid #333', borderRadius:'10px', color:'white', width:'100%', marginBottom:'10px', textAlign:'left', fontWeight:'bold'}}>
                    {m.equipoLocalNombre} vs {m.equipoVisitanteNombre}
                </button>
            ))}
            <button onClick={onClose} style={{marginTop:'30px', padding:'12px', width:'100%', background:'#333', color:'white', border:'none', borderRadius:'8px'}}>VOLVER</button>
        </div>
    );

    // 2. CHECK-IN (PRESENCIA)
    if (!checkInDone) return (
        <div style={{background:'#000', minHeight:'100vh', color:'white', padding:'15px', display:'flex', flexDirection:'column'}}>
            <h3 style={{textAlign:'center', color:'#60a5fa'}}>REGISTRO DE ASISTENCIA</h3>
            <div style={{flex:1, display:'flex', gap:'10px', overflow:'hidden'}}>
                <div style={{flex:1, display:'flex', flexDirection:'column'}}>
                    <div style={{background:'#1e3a8a', padding:'5px', fontSize:'0.7rem', fontWeight:'bold', textAlign:'center', borderRadius:'5px'}}>LOCAL</div>
                    <div style={{overflowY:'auto', flex:1, padding:'5px'}}>
                        {playersLocal.map(p => (
                            <div key={p.id} onClick={() => presentLocal.includes(p.id) ? setPresentLocal(presentLocal.filter(id=>id!==p.id)) : setPresentLocal([...presentLocal, p.id])}
                                 style={{padding:'10px', marginBottom:'5px', background: presentLocal.includes(p.id) ? '#3b82f6' : '#1a1a1a', borderRadius:'5px', fontSize:'0.8rem', border:'1px solid #333'}}>
                                #{p.numero} - {p.nombre}
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{flex:1, display:'flex', flexDirection:'column'}}>
                    <div style={{background:'#854d0e', padding:'5px', fontSize:'0.7rem', fontWeight:'bold', textAlign:'center', borderRadius:'5px'}}>VISITANTE</div>
                    <div style={{overflowY:'auto', flex:1, padding:'5px'}}>
                        {playersVisitante.map(p => (
                            <div key={p.id} onClick={() => presentVisitante.includes(p.id) ? setPresentVisitante(presentVisitante.filter(id=>id!==p.id)) : setPresentVisitante([...presentVisitante, p.id])}
                                 style={{padding:'10px', marginBottom:'5px', background: presentVisitante.includes(p.id) ? '#ef4444' : '#1a1a1a', borderRadius:'5px', fontSize:'0.8rem', border:'1px solid #333'}}>
                                #{p.numero} - {p.nombre}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <button onClick={() => setCheckInDone(true)} disabled={presentLocal.length < 5 || presentVisitante.length < 5}
                    style={{padding:'15px', background:'#10b981', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold', marginTop:'10px'}}>
                CONTINUAR A ABRIDORES
            </button>
        </div>
    );

    // 3. SELECCIÓN DE ABRIDORES (LOS 5 INICIALES)
    if (!startersDone) return (
        <div style={{background:'#000', minHeight:'100vh', color:'white', padding:'15px', display:'flex', flexDirection:'column'}}>
            <h3 style={{textAlign:'center', color:'#7c3aed'}}>SELECCIONAR 5 ABRIDORES</h3>
            <div style={{flex:1, display:'flex', gap:'10px', overflow:'hidden'}}>
                <div style={{flex:1, display:'flex', flexDirection:'column'}}>
                    <div style={{background:'#1e3a8a', padding:'5px', fontSize:'0.7rem', fontWeight:'bold', textAlign:'center', borderRadius:'5px'}}>5 LOCAL ({onCourtLocal.length})</div>
                    <div style={{overflowY:'auto', flex:1, padding:'5px'}}>
                        {playersLocal.filter(p => presentLocal.includes(p.id)).map(p => (
                            <div key={p.id} onClick={() => onCourtLocal.includes(p.id) ? setOnCourtLocal(onCourtLocal.filter(id=>id!==p.id)) : onCourtLocal.length < 5 && setOnCourtLocal([...onCourtLocal, p.id])}
                                 style={{padding:'10px', marginBottom:'5px', background: onCourtLocal.includes(p.id) ? '#3b82f6' : '#1a1a1a', borderRadius:'5px', fontSize:'0.8rem', border:'1px solid #444'}}>
                                #{p.numero} - {p.nombre}
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{flex:1, display:'flex', flexDirection:'column'}}>
                    <div style={{background:'#854d0e', padding:'5px', fontSize:'0.7rem', fontWeight:'bold', textAlign:'center', borderRadius:'5px'}}>5 VISITANTE ({onCourtVisitante.length})</div>
                    <div style={{overflowY:'auto', flex:1, padding:'5px'}}>
                        {playersVisitante.filter(p => presentVisitante.includes(p.id)).map(p => (
                            <div key={p.id} onClick={() => onCourtVisitante.includes(p.id) ? setOnCourtVisitante(onCourtVisitante.filter(id=>id!==p.id)) : onCourtVisitante.length < 5 && setOnCourtVisitante([...onCourtVisitante, p.id])}
                                 style={{padding:'10px', marginBottom:'5px', background: onCourtVisitante.includes(p.id) ? '#ef4444' : '#1a1a1a', borderRadius:'5px', fontSize:'0.8rem', border:'1px solid #444'}}>
                                #{p.numero} - {p.nombre}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            <button onClick={() => setStartersDone(true)} disabled={onCourtLocal.length !== 5 || onCourtVisitante.length !== 5}
                    style={{padding:'15px', background:'#7c3aed', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold', marginTop:'10px'}}>
                INICIAR PARTIDO
            </button>
        </div>
    );

    // 4. MESA TÉCNICA ACTIVA
    return (
        <div style={{background:'#000', height:'100vh', display:'flex', flexDirection:'column', color:'white', overflow:'hidden'}}>
             <style>{`.btn-stat { padding:8px 0; border:none; border-radius:6px; color:white; font-weight:900; cursor:pointer; font-size:0.6rem; transition: 0.1s; } .btn-stat:active { transform: scale(0.95); }`}</style>
            
            <div style={{minHeight:'65px', background:'#111', borderBottom:'2px solid #333', display:'flex', alignItems:'center', padding:'5px 15px', justifyContent:'center', width: '100%'}}>
                <div style={{display:'flex', alignItems:'center', gap:'8px', flex:1, justifyContent:'flex-end', overflow:'hidden'}}>
                    <span style={{fontWeight:'bold', fontSize:'0.75rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{matchData?.equipoLocalNombre}</span>
                    <img src={logos.local} alt="Local" style={{width:'40px', height:'40px', borderRadius:'50%', objectFit:'cover', background:'white', border:'2px solid #3b82f6', flexShrink: 0}} />
                </div>
                <div style={{display:'flex', alignItems:'center', gap:'12px', background:'#222', padding:'4px 15px', borderRadius:'8px', border:'1px solid #444', margin:'0 10px', flexShrink: 0}}>
                    <span style={{fontSize:'1.5rem', fontWeight:'900', color:'#fff'}}>{matchData?.marcadorLocal}</span>
                    <span style={{fontSize:'0.6rem', color:'#666'}}>VS</span>
                    <span style={{fontSize:'1.5rem', fontWeight:'900', color:'#fff'}}>{matchData?.marcadorVisitante}</span>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:'8px', flex:1, justifyContent:'flex-start', overflow:'hidden'}}>
                    <img src={logos.visitante} alt="Visitante" style={{width:'40px', height:'40px', borderRadius:'50%', objectFit:'cover', background:'white', border:'2px solid #ef4444', flexShrink: 0}} />
                    <span style={{fontWeight:'bold', fontSize:'0.75rem', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{matchData?.equipoVisitanteNombre}</span>
                </div>
            </div>

            <div style={{flex:1, display:'flex', overflow:'hidden'}}>
                <div style={{flex:1, padding:'5px', borderRight: '1px solid #222', overflowY:'auto'}}>
                    <div style={{display:'flex', justifyContent:'center', marginBottom:'6px', background: '#1e3a8a', padding:'4px 8px', borderRadius:'6px'}}>
                        <span style={{fontSize:'0.6rem', fontWeight:'900'}}>LOCAL</span>
                    </div>
                    {playersLocal.filter(p => onCourtLocal.includes(p.id)).map(p => (
                        <PlayerRow key={p.id} player={p} team='local' stats={statsCache[p.id]} onStat={handleStat} onSub={(id:string) => setSubModal({team:'local', replacingId:id, isOpen:true})} />
                    ))}
                </div>
                <div style={{flex:1, padding:'5px', overflowY:'auto'}}>
                    <div style={{display:'flex', justifyContent:'center', marginBottom:'6px', background: '#854d0e', padding:'4px 8px', borderRadius:'6px'}}>
                        <span style={{fontSize:'0.6rem', fontWeight:'900'}}>VISITANTE</span>
                    </div>
                    {playersVisitante.filter(p => onCourtVisitante.includes(p.id)).map(p => (
                        <PlayerRow key={p.id} player={p} team='visitante' stats={statsCache[p.id]} onStat={handleStat} onSub={(id:string) => setSubModal({team:'visitante', replacingId:id, isOpen:true})} />
                    ))}
                </div>
            </div>

            <div style={{padding:'10px', background:'#111', display:'flex', gap:'6px', borderTop:'2px solid #333'}}>
                <button onClick={()=>setSelectedMatchId(null)} style={{flex:1, padding:'12px', background:'#333', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold', fontSize:'0.7rem'}}>SALIR</button>
                <button onClick={()=>setIsHistoryOpen(true)} style={{flex:1, padding:'12px', background:'#475569', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold', fontSize:'0.7rem'}}>📜 HIST.</button>
                <button onClick={handleFinalize} style={{flex:2, padding:'12px', background:'#10b981', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold', fontSize:'0.7rem'}}>FINALIZAR</button>
            </div>

            {/* MODAL DE SUSTITUCIÓN (BANCA) */}
            {subModal.isOpen && (
                <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.95)', zIndex:4000, padding:'20px', display:'flex', justifyContent:'center', alignItems:'center'}}>
                    <div style={{background:'white', width:'100%', maxWidth:'400px', borderRadius:'15px', overflow:'hidden'}}>
                        <div style={{padding:'15px', background:'#1e3a8a', color:'white', textAlign:'center', fontWeight:'bold'}}>
                            ¿QUIÉN ENTRA POR EL #{ (subModal.team === 'local' ? playersLocal : playersVisitante).find(p => p.id === subModal.replacingId)?.numero }?
                        </div>
                        <div style={{maxHeight:'350px', overflowY:'auto', padding:'10px'}}>
                            {(subModal.team === 'local' ? playersLocal : playersVisitante)
                                .filter(p => (subModal.team === 'local' ? presentLocal : presentVisitante).includes(p.id) && !(subModal.team === 'local' ? onCourtLocal : onCourtVisitante).includes(p.id))
                                .map(p => (
                                    <div key={p.id} onClick={() => executeSwap(p.id)} 
                                         style={{ padding:'15px', borderBottom:'1px solid #eee', color:'#333', cursor:'pointer', display:'flex', justifyContent:'space-between', fontWeight:'bold' }}>
                                        <span>#{p.numero} {p.nombre}</span>
                                        <span style={{color:'#10b981'}}>ENTRAR ➔</span>
                                    </div>
                                ))}
                        </div>
                        <button onClick={() => setSubModal({...subModal, isOpen:false})} style={{width:'100%', padding:'15px', background:'#333', color:'white', border:'none', fontWeight:'bold'}}>CANCELAR</button>
                    </div>
                </div>
            )}

            {/* MODAL HISTORIAL (IGUAL) */}
            {isHistoryOpen && (
                <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.95)', zIndex:4000, padding:'20px', display:'flex', justifyContent:'center', alignItems:'center'}}>
                    <div style={{background:'white', width:'100%', maxWidth:'400px', borderRadius:'15px', overflow:'hidden', display: 'flex', flexDirection: 'column', maxHeight: '80vh'}}>
                        <div style={{padding:'15px', background:'#475569', color:'white', textAlign:'center', fontWeight:'bold', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                            <span>📜 HISTORIAL</span>
                            <button onClick={() => setIsHistoryOpen(false)} style={{background:'rgba(255,255,255,0.2)', border:'none', color:'white', borderRadius:'50%', width:'30px', height:'30px', display:'flex', justifyContent:'center', alignItems:'center'}}>✕</button>
                        </div>
                        <div style={{overflowY:'auto', padding:'10px', flex:1}}>
                            {recentPlays.map(play => (
                                <div key={play.id} style={{ padding:'10px', borderBottom:'1px solid #eee', color:'#333', fontSize:'0.8rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                    <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
                                        <span style={{ background: play.equipo === 'local' ? '#3b82f6' : '#ef4444', color:'white', padding:'2px 6px', borderRadius:'4px', fontWeight:'bold' }}>#{play.jugadorNumero}</span>
                                        <span style={{fontWeight:'bold'}}>{play.jugadorNombre}</span>
                                    </div>
                                    <span style={{fontWeight:'900', color: play.puntos > 0 ? '#10b981' : '#f59e0b'}}>{play.accion.toUpperCase()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MesaTecnica;