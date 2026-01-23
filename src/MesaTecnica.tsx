import React, { useState, useEffect, memo } from 'react';
import { db } from './firebase';
import { doc, updateDoc, onSnapshot, collection, query, getDocs, setDoc, increment, where, writeBatch } from 'firebase/firestore';

// --- FILA DE JUGADOR (Compacta y optimizada para 5 por bando) ---
const PlayerRow = memo(({ player, team, stats, onStat, onSub }: any) => {
    const s = stats || { puntos: 0, rebotes: 0, asistencias: 0, robos: 0, triples: 0, dobles: 0, tirosLibres: 0, faltas: 0 };

    return (
        <div style={{ marginBottom:'10px', padding:'12px', borderRadius:'10px', background: '#1a1a1a', border: '1px solid #333', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px', alignItems:'center'}}>
                <div style={{fontWeight:'bold', color:'white', fontSize:'1rem'}}>{player.nombre}</div>
                <button onClick={() => onSub(player)} style={{background:'#334155', color:'#60a5fa', border:'1px solid #60a5fa', borderRadius:'6px', padding:'4px 8px', fontSize:'0.7rem', cursor:'pointer', fontWeight:'bold'}}>🔄 CAMBIO</button>
            </div>
            
            <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'6px'}}>
                <button onClick={()=>onStat(player, team, 'tirosLibres', 1)} className="btn-stat" style={{background:'#475569'}}>+1 TL</button>
                <button onClick={()=>onStat(player, team, 'dobles', 1)} className="btn-stat" style={{background:'#1e40af'}}>+2 PTS</button>
                <button onClick={()=>onStat(player, team, 'triples', 1)} className="btn-stat" style={{background:'#7c3aed'}}>+3 PTS</button>
                
                <button onClick={()=>onStat(player, team, 'rebotes', 1)} className="btn-stat" style={{background:'#047857'}}>REB</button>
                <button onClick={()=>onStat(player, team, 'asistencias', 1)} className="btn-stat" style={{background:'#0891b2'}}>AST</button>
                <button onClick={()=>onStat(player, team, 'faltas', 1)} className="btn-stat" style={{background: s.faltas >= 4 ? '#ef4444' : '#991b1b'}}>F: {s.faltas}</button>
            </div>
        </div>
    );
});

const MesaTecnica: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [matches, setMatches] = useState<any[]>([]);
    const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
    const [matchData, setMatchData] = useState<any | null>(null);
    const [playersLocal, setPlayersLocal] = useState<any[]>([]);
    const [playersVisitante, setPlayersVisitante] = useState<any[]>([]);
    
    // Estados para controlar quién está en cancha (IDs)
    const [onCourtLocal, setOnCourtLocal] = useState<string[]>([]);
    const [onCourtVisitante, setOnCourtVisitante] = useState<string[]>([]);
    const [subModal, setSubModal] = useState<{team: 'local' | 'visitante', isOpen: boolean}>({team: 'local', isOpen: false});

    const [statsCache, setStatsCache] = useState<Record<string, any>>({});
    const selectedDate = new Date().toISOString().split('T')[0];

    useEffect(() => {
        const q = query(collection(db, 'calendario'), where('fechaAsignada', '==', selectedDate), where('estatus', '==', 'programado'));
        getDocs(q).then(snap => setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, [selectedDate]);

    useEffect(() => {
        if (!selectedMatchId) return;
        const unsub = onSnapshot(doc(db, 'calendario', selectedMatchId), (snap) => {
            if (snap.exists()) setMatchData({ id: snap.id, ...snap.data() });
        });
        return () => unsub();
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
        let ptsAccion = 0;
        if (['tirosLibres', 'dobles', 'triples'].includes(field)) {
            ptsAccion = field === 'tirosLibres' ? 1 : field === 'dobles' ? 2 : 3;
            const marcadorField = team === 'local' ? 'marcadorLocal' : 'marcadorVisitante';
            await updateDoc(doc(db, 'calendario', matchData.id), { [marcadorField]: increment(ptsAccion) });
        }

        const statRef = doc(db, 'stats_partido', `${matchData.id}_${player.id}`);
        await setDoc(statRef, {
            partidoId: matchData.id, jugadorId: player.id, nombre: player.nombre,
            equipo: team === 'local' ? matchData.equipoLocalNombre : matchData.equipoVisitanteNombre,
            [field]: increment(val), puntos: increment(ptsAccion)
        }, { merge: true });

        setStatsCache(prev => ({
            ...prev, [player.id]: { ...prev[player.id], [field]: (prev[player.id]?.[field] || 0) + val }
        }));
    };

    const handleFinalize = async () => {
        if (!matchData || !window.confirm("¿Finalizar partido?")) return;
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
        batch.update(doc(db, 'calendario', matchData.id), { estatus: 'finalizado' });
        await batch.commit();
        onClose();
    };

    // --- LÓGICA DE SUSTITUCIONES ---
    const toggleCourtPlayer = (id: string, team: 'local' | 'visitante') => {
        const current = team === 'local' ? onCourtLocal : onCourtVisitante;
        const setMethod = team === 'local' ? setOnCourtLocal : setOnCourtVisitante;

        if (current.includes(id)) {
            setMethod(current.filter(pId => pId !== id));
        } else {
            if (current.length >= 5) return alert("Máximo 5 jugadores en cancha.");
            setMethod([...current, id]);
        }
    };

    // --- MODAL DE SELECCIÓN DE JUGADORES (STARTERS O CAMBIOS) ---
    const SubModal = () => {
        const team = subModal.team;
        const players = team === 'local' ? playersLocal : playersVisitante;
        const activeIds = team === 'local' ? onCourtLocal : onCourtVisitante;

        return (
            <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.95)', zIndex:4000, padding:'20px', display:'flex', justifyContent:'center', alignItems:'center'}}>
                <div style={{background:'white', width:'100%', maxWidth:'450px', borderRadius:'15px', overflow:'hidden'}}>
                    <div style={{padding:'15px', background:'#1e3a8a', color:'white', textAlign:'center', fontWeight:'bold'}}>
                        GESTIÓN DE QUINTETO: {team === 'local' ? matchData?.equipoLocalNombre : matchData?.equipoVisitanteNombre}
                    </div>
                    <div style={{maxHeight:'400px', overflowY:'auto', padding:'10px'}}>
                        {players.map(p => {
                            const isSelected = activeIds.includes(p.id);
                            return (
                                <div key={p.id} onClick={() => toggleCourtPlayer(p.id, team)} style={{
                                    padding:'15px', borderBottom:'1px solid #eee', display:'flex', justifyContent:'space-between',
                                    background: isSelected ? '#dbeafe' : 'transparent', cursor:'pointer'
                                }}>
                                    <span style={{fontWeight: isSelected ? 'bold' : 'normal', color:'#333'}}>{p.nombre}</span>
                                    {isSelected ? <span style={{color:'#1e40af', fontWeight:'bold'}}>EN CANCHA</span> : <span style={{color:'#94a3b8'}}>BANCA</span>}
                                </div>
                            );
                        })}
                    </div>
                    <button onClick={() => setSubModal({...subModal, isOpen:false})} style={{width:'100%', padding:'15px', background:'#10b981', color:'white', border:'none', fontWeight:'bold'}}>CONFIRMAR QUINTETO ({activeIds.length}/5)</button>
                </div>
            </div>
        );
    };

    if (!selectedMatchId) return (
        <div style={{padding:'20px', color:'white', background:'#000', minHeight:'100vh'}}>
            <h2 style={{color: '#60a5fa', marginBottom:'20px'}}>⏱️ Mesa Técnica: Activos</h2>
            <div style={{display:'grid', gap:'10px'}}>
                {matches.length === 0 ? <div style={{padding:'40px', textAlign:'center', color:'#666'}}>No hay juegos para hoy.</div> : 
                matches.map(m => (
                    <button key={m.id} onClick={()=>setSelectedMatchId(m.id)} style={{padding:'20px', background:'#1a1a1a', border:'1px solid #333', borderRadius:'8px', color:'white', textAlign:'left', cursor:'pointer'}}>
                        {m.equipoLocalNombre} vs {m.equipoVisitanteNombre}
                    </button>
                ))}
            </div>
            <button onClick={onClose} style={{marginTop:'30px', padding:'12px', width:'100%', background:'#333', color:'white', border:'none', borderRadius:'8px'}}>VOLVER</button>
        </div>
    );

    if (!matchData) return <div style={{background:'#000', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'white'}}>Cargando...</div>;

    return (
        <div style={{background:'#000', height:'100vh', display:'flex', flexDirection:'column', color:'white'}}>
            <style>{`.btn-stat { padding:10px 0; border:none; border-radius:6px; color:white; font-weight:bold; cursor:pointer; font-size:0.7rem; }`}</style>
            
            {subModal.isOpen && <SubModal />}

            {/* MARCADOR */}
            <div style={{padding:'10px', background:'#111', borderBottom:'2px solid #333', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{textAlign:'center', flex:1}}>
                    <div style={{fontSize:'0.7rem', color:'#60a5fa'}}>{matchData.equipoLocalNombre}</div>
                    <div style={{fontSize:'2rem', fontWeight:'900'}}>{matchData.marcadorLocal}</div>
                </div>
                <div style={{fontSize:'1.2rem', fontWeight:'900', color:'#f59e0b'}}>VS</div>
                <div style={{textAlign:'center', flex:1}}>
                    <div style={{fontSize:'0.7rem', color:'#facc15'}}>{matchData.equipoVisitanteNombre}</div>
                    <div style={{fontSize:'2rem', fontWeight:'900'}}>{matchData.marcadorVisitante}</div>
                </div>
            </div>

            {/* CANCHA (LOCAL / VISITANTE) */}
            <div style={{flex:1, display:'flex', overflow:'hidden'}}>
                <div style={{flex:1, overflowY:'auto', padding:'10px', borderRight:'1px solid #222'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                        <span style={{fontSize:'0.7rem', color:'#60a5fa', fontWeight:'bold'}}>LOCAL</span>
                        <button onClick={() => setSubModal({team:'local', isOpen:true})} style={{fontSize:'0.6rem', padding:'2px 5px'}}>QUINTETO</button>
                    </div>
                    {playersLocal.filter(p => onCourtLocal.includes(p.id)).map(p => (
                        <PlayerRow key={p.id} player={p} team="local" stats={statsCache[p.id]} onStat={handleStat} onSub={() => setSubModal({team:'local', isOpen:true})} />
                    ))}
                    {onCourtLocal.length < 5 && <div style={{textAlign:'center', padding:'20px', color:'#444', fontSize:'0.8rem'}}>Selecciona los 5 iniciales</div>}
                </div>

                <div style={{flex:1, overflowY:'auto', padding:'10px'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}>
                        <span style={{fontSize:'0.7rem', color:'#facc15', fontWeight:'bold'}}>VISITANTE</span>
                        <button onClick={() => setSubModal({team:'visitante', isOpen:true})} style={{fontSize:'0.6rem', padding:'2px 5px'}}>QUINTETO</button>
                    </div>
                    {playersVisitante.filter(p => onCourtVisitante.includes(p.id)).map(p => (
                        <PlayerRow key={p.id} player={p} team="visitante" stats={statsCache[p.id]} onStat={handleStat} onSub={() => setSubModal({team:'visitante', isOpen:true})} />
                    ))}
                    {onCourtVisitante.length < 5 && <div style={{textAlign:'center', padding:'20px', color:'#444', fontSize:'0.8rem'}}>Selecciona los 5 iniciales</div>}
                </div>
            </div>

            <div style={{padding:'15px', background:'#111', display:'flex', gap:'10px'}}>
                <button onClick={()=>setSelectedMatchId(null)} style={{flex:1, padding:'12px', borderRadius:'8px', background:'#333', color:'white', border:'none', fontWeight:'bold'}}>SALIR</button>
                <button onClick={handleFinalize} style={{flex:2, padding:'12px', borderRadius:'8px', background:'#10b981', color:'white', border:'none', fontWeight:'bold'}}>FINALIZAR</button>
            </div>
        </div>
    );
};

export default MesaTecnica;