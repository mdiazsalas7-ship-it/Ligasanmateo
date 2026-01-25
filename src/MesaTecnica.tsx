import React, { useState, useEffect, memo } from 'react';
import { db } from './firebase';
import { doc, updateDoc, onSnapshot, collection, query, getDocs, setDoc, increment, where, writeBatch, limit, orderBy, addDoc, deleteDoc } from 'firebase/firestore';

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
                <button onClick={() => onSub(player)} style={{background:'#334155', color:'#60a5fa', border:'none', borderRadius:'4px', padding:'2px 6px', fontSize:'0.55rem', cursor:'pointer', fontWeight:'bold'}}>🔄</button>
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

const MesaTecnica: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [matches, setMatches] = useState<any[]>([]);
    const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
    const [matchData, setMatchData] = useState<any | null>(null);
    const [logos, setLogos] = useState({ local: '', visitante: '' });
    const [playersLocal, setPlayersLocal] = useState<any[]>([]);
    const [playersVisitante, setPlayersVisitante] = useState<any[]>([]);
    const [onCourtLocal, setOnCourtLocal] = useState<string[]>([]);
    const [onCourtVisitante, setOnCourtVisitante] = useState<string[]>([]);
    const [subModal, setSubModal] = useState<{team: 'local' | 'visitante', isOpen: boolean}>({team: 'local', isOpen: false});
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [statsCache, setStatsCache] = useState<Record<string, any>>({});
    const [recentPlays, setRecentPlays] = useState<any[]>([]);

    const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/166/166344.png";

    // --- CORRECCIÓN DE FECHA LOCAL (VENEZUELA) ---
    useEffect(() => {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const localDate = new Date(now.getTime() - offset).toISOString().split('T')[0];

        // Escucha activa para que los juegos aparezcan al instante
        const q = query(
            collection(db, 'calendario'), 
            where('fechaAsignada', '==', localDate), 
            where('estatus', '==', 'programado')
        );

        const unsub = onSnapshot(q, (snap) => {
            setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => unsub();
    }, []);

    useEffect(() => {
        if (!selectedMatchId) return;
        const unsubMatch = onSnapshot(doc(db, 'calendario', selectedMatchId), async (snap) => {
            if (snap.exists()) {
                const data = { id: snap.id, ...snap.data() } as any;
                setMatchData(data);
                const lDoc = await getDocs(query(collection(db, 'equipos'), where('nombre', '==', data.equipoLocalNombre)));
                const vDoc = await getDocs(query(collection(db, 'equipos'), where('nombre', '==', data.equipoVisitanteNombre)));
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
    }, [selectedMatchId]);

    useEffect(() => {
        if (matchData?.id) {
            const fetchRosters = async () => {
                const qL = query(collection(db, 'jugadores'), where('equipoId', '==', matchData.equipoLocalId));
                const qV = query(collection(db, 'jugadores'), where('equipoId', '==', matchData.equipoVisitanteId));
                const [snapL, snapV] = await Promise.all([getDocs(qL), getDocs(qV)]);
                setPlayersLocal(snapL.docs.map(d => ({ id: d.id, ...d.data() })));
                setPlayersVisitante(snapV.docs.map(d => ({ id: d.id, ...d.data() })));
            };
            fetchRosters();
        }
    }, [matchData?.id]);

    const handleStat = async (player: any, team: 'local'|'visitante', field: string, val: number) => {
        if (!matchData) return;
        let pts = field === 'tirosLibres' ? 1 : field === 'dobles' ? 2 : field === 'triples' ? 3 : 0;
        await addDoc(collection(db, 'jugadas_partido'), { partidoId: matchData.id, jugadorId: player.id, jugadorNombre: player.nombre, jugadorNumero: player.numero || '??', equipo: team, accion: field, puntos: pts, timestamp: Date.now() });
        if (pts > 0) await updateDoc(doc(db, 'calendario', matchData.id), { [team === 'local' ? 'marcadorLocal' : 'marcadorVisitante']: increment(pts) });
        await setDoc(doc(db, 'stats_partido', `${matchData.id}_${player.id}`), { partidoId: matchData.id, jugadorId: player.id, nombre: player.nombre, numero: player.numero || '??', equipo: team === 'local' ? matchData.equipoLocalNombre : matchData.equipoVisitanteNombre, [field]: increment(val), puntos: increment(pts) }, { merge: true });
    };

    const handleDeletePlay = async (play: any) => {
        if (!recentPlays.length) return;
        const batch = writeBatch(db);
        if (play.puntos > 0) batch.update(doc(db, 'calendario', play.partidoId), { [play.equipo === 'local' ? 'marcadorLocal' : 'marcadorVisitante']: increment(-play.puntos) });
        batch.update(doc(db, 'stats_partido', `${play.partidoId}_${play.jugadorId}`), { [play.accion]: increment(-1), puntos: increment(-play.puntos) });
        batch.delete(doc(db, 'jugadas_partido', play.id));
        await batch.commit();
    };

    const handleFinalize = async () => {
        if (!matchData || !window.confirm("¿FINALIZAR PARTIDO?")) return;
        const batch = writeBatch(db);
        const win = matchData.marcadorLocal > matchData.marcadorVisitante;
        const lRef = doc(db, 'equipos', matchData.equipoLocalId);
        const vRef = doc(db, 'equipos', matchData.equipoVisitanteId);
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
            batch.update(doc(db, 'jugadores', s.jugadorId), { puntos: increment(Number(s.puntos) || 0), rebotes: increment(Number(s.rebotes) || 0), robos: increment(Number(s.robos) || 0), bloqueos: increment(Number(s.bloqueos) || 0), triples: increment(Number(s.triples) || 0), dobles: increment(Number(s.dobles) || 0), tirosLibres: increment(Number(s.tirosLibres) || 0), partidosJugados: increment(1) });
        });
        batch.update(doc(db, 'calendario', matchData.id), { estatus: 'finalizado' });
        await batch.commit();
        alert("✅ Liga actualizada.");
        onClose();
    };

    if (!selectedMatchId) return (
        <div style={{padding:'20px', color:'white', background:'#000', minHeight:'100vh'}}>
            <h2 style={{color: '#60a5fa', marginBottom:'20px'}}>⏱️ Mesa Técnica</h2>
            {matches.length === 0 ? (
                <div style={{textAlign:'center', padding:'40px', border:'1px dashed #333', borderRadius:'15px'}}>
                    <p style={{color:'#666'}}>No hay juegos programados para hoy.</p>
                </div>
            ) : matches.map(m => (
                <button key={m.id} onClick={()=>setSelectedMatchId(m.id)} style={{padding:'18px', background:'#1a1a1a', border:'1px solid #333', borderRadius:'10px', color:'white', width:'100%', marginBottom:'10px', textAlign:'left', fontWeight:'bold'}}>
                    {m.equipoLocalNombre} vs {m.equipoVisitanteNombre}
                </button>
            ))}
            <button onClick={onClose} style={{marginTop:'30px', padding:'12px', width:'100%', background:'#333', color:'white', border:'none', borderRadius:'8px'}}>VOLVER</button>
        </div>
    );

    return (
        <div style={{background:'#000', height:'100vh', display:'flex', flexDirection:'column', color:'white', overflow:'hidden'}}>
            <style>{`.btn-stat { padding:8px 0; border:none; border-radius:6px; color:white; font-weight:900; cursor:pointer; font-size:0.6rem; transition: 0.1s; } .btn-stat:active { transform: scale(0.95); }`}</style>
            
            <div style={{height:'50px', background:'#111', borderBottom:'2px solid #333', display:'flex', alignItems:'center', padding:'0 15px', justifyContent:'space-between'}}>
                <div style={{display:'flex', alignItems:'center', gap:'8px', flex:1}}>
                    <img src={logos.local} style={{width:'30px', height:'30px', borderRadius:'50%', background:'white', objectFit:'contain'}} alt="L" />
                    <span style={{fontSize:'0.75rem', fontWeight:'900', color:'#60a5fa', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'80px'}}>{matchData?.equipoLocalNombre}</span>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:'10px', background:'#222', padding:'4px 12px', borderRadius:'8px', border:'1px solid #444'}}>
                    <span style={{fontSize:'1.5rem', fontWeight:'900', color:'#fff'}}>{matchData?.marcadorLocal}</span>
                    <span style={{fontSize:'0.6rem', color:'#666'}}>VS</span>
                    <span style={{fontSize:'1.5rem', fontWeight:'900', color:'#fff'}}>{matchData?.marcadorVisitante}</span>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:'8px', flex:1, justifyContent:'flex-end'}}>
                    <span style={{fontSize:'0.75rem', fontWeight:'900', color:'#facc15', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'80px'}}>{matchData?.equipoVisitanteNombre}</span>
                    <img src={logos.visitante} style={{width:'30px', height:'30px', borderRadius:'50%', background:'white', objectFit:'contain'}} alt="V" />
                </div>
            </div>

            <div style={{flex:1, display:'flex', overflow:'hidden'}}>
                {['local', 'visitante'].map((t: any) => (
                    <div key={t} style={{flex:1, padding:'5px', borderRight: t==='local'?'1px solid #222':'none', overflowY:'auto'}}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'6px', background: t==='local'?'#1e3a8a':'#854d0e', padding:'4px 8px', borderRadius:'6px'}}>
                            <span style={{fontSize:'0.6rem', fontWeight:'900'}}>{t === 'local' ? 'LOCAL' : 'VISIT'}</span>
                            <button onClick={() => setSubModal({team:t, isOpen:true})} style={{fontSize:'0.55rem', padding:'2px 5px', background:'rgba(255,255,255,0.2)', border:'none', color:'white', borderRadius:'4px'}}>F21</button>
                        </div>
                        {(t === 'local' ? playersLocal : playersVisitante).filter(p => (t==='local'?onCourtLocal:onCourtVisitante).includes(p.id)).map(p => (
                            <PlayerRow key={p.id} player={p} team={t} stats={statsCache[p.id]} onStat={handleStat} onSub={() => setSubModal({team:t, isOpen:true})} />
                        ))}
                    </div>
                ))}
            </div>

            <div style={{padding:'10px', background:'#111', display:'flex', gap:'6px', borderTop:'2px solid #333'}}>
                <button onClick={()=>setSelectedMatchId(null)} style={{flex:1, padding:'12px', background:'#333', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold', fontSize:'0.7rem'}}>SALIR</button>
                <button onClick={()=>setIsHistoryOpen(true)} style={{flex:1, padding:'12px', background:'#475569', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold', fontSize:'0.7rem'}}>📜 HIST.</button>
                <button onClick={handleFinalize} style={{flex:2, padding:'12px', background:'#10b981', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold', fontSize:'0.7rem'}}>FINALIZAR</button>
            </div>

            {/* MODAL HISTORIAL */}
            {isHistoryOpen && (
                <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.95)', zIndex:5000, padding:'20px', display:'flex', justifyContent:'center', alignItems:'center'}}>
                    <div style={{background:'white', width:'100%', maxWidth:'400px', borderRadius:'16px', overflow:'hidden', height:'70vh', display:'flex', flexDirection:'column'}}>
                        <div style={{padding:'15px', background:'#1e3a8a', color:'white', textAlign:'center', fontWeight:'bold'}}>HISTORIAL JUGADAS</div>
                        <div style={{flex:1, overflowY:'auto', padding:'10px'}}>
                            {recentPlays.map(play => (
                                <div key={play.id} style={{display:'flex', background:'#f8fafc', padding:'10px', borderRadius:'10px', alignItems:'center', justifyContent:'space-between', border:'1px solid #e2e8f0', marginBottom:'6px'}}>
                                    <div style={{fontSize:'0.8rem', color:'#333'}}>
                                        <b style={{color: '#1e3a8a', marginRight: '5px'}}>#{play.jugadorNumero || '??'}</b>
                                        <b>{play.jugadorNombre}</b>: {play.accion.toUpperCase()}
                                    </div>
                                    <button onClick={() => handleDeletePlay(play)} style={{background:'#fee2e2', border:'none', color:'#ef4444', borderRadius:'8px', padding:'6px 12px', fontSize:'0.6rem', fontWeight:'bold'}}>BORRAR</button>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setIsHistoryOpen(false)} style={{width:'100%', padding:'15px', background:'#1e3a8a', color:'white', border:'none', fontWeight:'bold'}}>CERRAR</button>
                    </div>
                </div>
            )}

            {/* MODAL CAMBIOS */}
            {subModal.isOpen && (
                <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.95)', zIndex:4000, padding:'20px', display:'flex', justifyContent:'center', alignItems:'center'}}>
                    <div style={{background:'white', width:'100%', maxWidth:'400px', borderRadius:'15px', overflow:'hidden'}}>
                        <div style={{padding:'15px', background:'#1e3a8a', color:'white', textAlign:'center', fontWeight:'bold'}}>GESTIÓN DE QUINTETO</div>
                        <div style={{maxHeight:'350px', overflowY:'auto', padding:'10px'}}>
                            {(subModal.team === 'local' ? playersLocal : playersVisitante).map(p => {
                                const activeIds = subModal.team === 'local' ? onCourtLocal : onCourtVisitante;
                                const isSelected = activeIds.includes(p.id);
                                return (
                                    <div key={p.id} onClick={() => {
                                        const setter = subModal.team === 'local' ? setOnCourtLocal : setOnCourtVisitante;
                                        if (isSelected) setter(activeIds.filter(id => id !== p.id));
                                        else if (activeIds.length < 5) setter([...activeIds, p.id]);
                                    }} style={{ padding:'12px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between', background: isSelected ? '#dbeafe' : 'transparent', color:'#333', cursor:'pointer', alignItems:'center' }}>
                                        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                            <span style={{background:'#eee', padding:'2px 6px', borderRadius:'4px', fontWeight:'bold', fontSize:'0.8rem'}}>#{p.numero || '??'}</span>
                                            <span style={{fontWeight: isSelected ? 'bold' : 'normal'}}>{p.nombre}</span>
                                        </div>
                                        {isSelected && <span style={{fontWeight:'bold', color:'#1e40af', fontSize: '0.7rem'}}>EN CANCHA</span>}
                                    </div>
                                );
                            })}
                        </div>
                        <button onClick={() => setSubModal({...subModal, isOpen:false})} style={{width:'100%', padding:'15px', background:'#10b981', color:'white', border:'none', fontWeight:'bold'}}>CONFIRMAR</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MesaTecnica;