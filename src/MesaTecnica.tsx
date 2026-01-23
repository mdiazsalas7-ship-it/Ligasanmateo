import React, { useState, useEffect, memo } from 'react';
import { db } from './firebase';
import { doc, updateDoc, onSnapshot, collection, query, getDocs, setDoc, increment, where, writeBatch } from 'firebase/firestore';

// --- FILA DE JUGADOR ---
const PlayerRow = memo(({ player, team, stats, onStat }: any) => {
    const s = stats || { puntos: 0, rebotes: 0, asistencias: 0, robos: 0, triples: 0, dobles: 0, tirosLibres: 0, faltas: 0 };

    return (
        <div style={{ marginBottom:'8px', padding:'10px', borderRadius:'8px', background: '#1a1a1a', border: '1px solid #333' }}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'8px'}}>
                <div style={{fontWeight:'bold', color:'white', fontSize:'0.9rem'}}>{player.nombre}</div>
                <div style={{fontSize:'0.8rem', color: s.faltas >= 4 ? '#ef4444' : '#94a3b8'}}>Faltas: {s.faltas}</div>
            </div>
            
            <div style={{display:'flex', gap:'4px', flexWrap:'wrap'}}>
                <button onClick={()=>onStat(player, team, 'tirosLibres', 1)} className="btn-stat" style={{background:'#475569'}}>+1 TL</button>
                <button onClick={()=>onStat(player, team, 'dobles', 1)} className="btn-stat" style={{background:'#1e40af'}}>+2 pts</button>
                <button onClick={()=>onStat(player, team, 'triples', 1)} className="btn-stat" style={{background:'#7c3aed'}}>+3 pts</button>
                
                <button onClick={()=>onStat(player, team, 'rebotes', 1)} className="btn-stat" style={{background:'#047857'}}>REB</button>
                <button onClick={()=>onStat(player, team, 'asistencias', 1)} className="btn-stat" style={{background:'#0891b2'}}>AST</button>
                <button onClick={()=>onStat(player, team, 'robos', 1)} className="btn-stat" style={{background:'#b45309'}}>ROB</button>
                <button onClick={()=>onStat(player, team, 'faltas', 1)} className="btn-stat" style={{background:'#991b1b'}}>F+</button>
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
    const [statsCache, setStatsCache] = useState<Record<string, any>>({});
    const selectedDate = new Date().toISOString().split('T')[0];

    useEffect(() => {
        const q = query(
            collection(db, 'calendario'), 
            where('fechaAsignada', '==', selectedDate),
            where('estatus', '==', 'programado') 
        );
        getDocs(q).then(snap => setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    }, [selectedMatchId, selectedDate]);

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

        let puntosParaMarcador = 0;
        if (['tirosLibres', 'dobles', 'triples'].includes(field)) {
            puntosParaMarcador = field === 'tirosLibres' ? 1 : field === 'dobles' ? 2 : 3;
            const marcadorField = team === 'local' ? 'marcadorLocal' : 'marcadorVisitante';
            await updateDoc(doc(db, 'calendario', matchData.id), { [marcadorField]: increment(puntosParaMarcador) });
        }

        const statRef = doc(db, 'stats_partido', `${matchData.id}_${player.id}`);
        
        // Actualizamos el campo específico y TAMBIÉN el acumulado de puntos en el registro del partido
        const updateData: any = {
            partidoId: matchData.id,
            jugadorId: player.id,
            nombre: player.nombre,
            equipo: team === 'local' ? matchData.equipoLocalNombre : matchData.equipoVisitanteNombre,
            [field]: increment(val)
        };

        if (puntosParaMarcador > 0) {
            updateData.puntos = increment(puntosParaMarcador);
        }

        await setDoc(statRef, updateData, { merge: true });

        setStatsCache(prev => ({
            ...prev,
            [player.id]: { ...prev[player.id], [field]: (prev[player.id]?.[field] || 0) + val }
        }));
    };

    const handleFinalize = async () => {
        if (!matchData || !window.confirm("¿Finalizar partido? Se actualizará la Tabla y los Líderes.")) return;

        const batch = writeBatch(db);
        const localGano = matchData.marcadorLocal > matchData.marcadorVisitante;
        const localRef = doc(db, 'equipos', matchData.equipoLocalId);
        const visitRef = doc(db, 'equipos', matchData.equipoVisitanteId);

        // 1. Actualizar Tabla de Posiciones
        if (localGano) {
            batch.update(localRef, { victorias: increment(1), puntos: increment(2), puntos_favor: increment(matchData.marcadorLocal), puntos_contra: increment(matchData.marcadorVisitante) });
            batch.update(visitRef, { derrotas: increment(1), puntos: increment(1), puntos_favor: increment(matchData.marcadorVisitante), puntos_contra: increment(matchData.marcadorLocal) });
        } else {
            batch.update(visitRef, { victorias: increment(1), puntos: increment(2), puntos_favor: increment(matchData.marcadorVisitante), puntos_contra: increment(matchData.marcadorLocal) });
            batch.update(localRef, { derrotas: increment(1), puntos: increment(1), puntos_favor: increment(matchData.marcadorLocal), puntos_contra: increment(matchData.marcadorVisitante) });
        }

        // 2. ACTUALIZACIÓN CRÍTICA DE LÍDERES (Puntos y Stats)
        const statsSnap = await getDocs(query(collection(db, 'stats_partido'), where('partidoId', '==', matchData.id)));
        statsSnap.forEach(sDoc => {
            const s = sDoc.data();
            const jugRef = doc(db, 'jugadores', s.jugadorId);
            
            // Cálculo manual para asegurar que los puntos lleguen a la colección 'jugadores'
            const tl = Number(s.tirosLibres) || 0;
            const d2 = Number(s.dobles) || 0;
            const d3 = Number(s.triples) || 0;
            const totalPuntosPartido = tl + (d2 * 2) + (d3 * 3);

            batch.update(jugRef, {
                puntos: increment(totalPuntosPartido), // ¡ESTO ARREGLA EL CERO EN LOS LÍDERES!
                rebotes: increment(Number(s.rebotes) || 0),
                asistencias: increment(Number(s.asistencias) || 0),
                robos: increment(Number(s.robos) || 0),
                triples: increment(Number(s.triples) || 0),
                dobles: increment(Number(s.dobles) || 0),
                tirosLibres: increment(Number(s.tirosLibres) || 0),
                partidosJugados: increment(1)
            });
        });

        // 3. Marcar como finalizado
        batch.update(doc(db, 'calendario', matchData.id), { 
            estatus: 'finalizado',
            marcadorLocal: matchData.marcadorLocal,
            marcadorVisitante: matchData.marcadorVisitante 
        });

        try {
            await batch.commit();
            alert("✅ Liga Actualizada. Los puntos ya están reflejados en Estadísticas.");
            onClose();
        } catch (e) { alert("Error al guardar datos."); }
    };

    if (!selectedMatchId) return (
        <div style={{padding:'20px', color:'white', background:'#000', minHeight:'100vh'}}>
            <h2 style={{color: '#60a5fa', marginBottom:'20px'}}>⏱️ Mesa Técnica</h2>
            <div style={{display:'grid', gap:'10px'}}>
                {matches.length === 0 ? (
                    <div style={{padding:'40px', textAlign:'center', color:'#666', border:'2px dashed #333', borderRadius:'12px'}}>
                        No hay juegos pendientes para hoy.
                    </div>
                ) : matches.map(m => (
                    <button key={m.id} onClick={()=>setSelectedMatchId(m.id)} style={{padding:'20px', background:'#1a1a1a', border:'1px solid #333', borderRadius:'8px', color:'white', textAlign:'left', cursor:'pointer'}}>
                        <div style={{fontWeight:'bold'}}>{m.equipoLocalNombre} vs {m.equipoVisitanteNombre}</div>
                        <div style={{fontSize:'0.8rem', color:'#94a3b8', marginTop:'5px'}}>📍 {m.cancha}</div>
                    </button>
                ))}
            </div>
            <button onClick={onClose} style={{marginTop:'30px', padding:'12px', width:'100%', background:'#333', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold'}}>VOLVER AL MENÚ</button>
        </div>
    );

    if (!matchData) return <div style={{background:'#000', height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', color:'white'}}>Cargando tablero...</div>;

    return (
        <div style={{background:'#000', height:'100vh', display:'flex', flexDirection:'column', color:'white'}}>
            <style>{`.btn-stat { flex:1; padding:12px 0; border:none; border-radius:6px; color:white; font-weight:bold; cursor:pointer; font-size:0.7rem; text-transform:uppercase; } .btn-stat:active { transform:scale(0.9); }`}</style>
            
            <div style={{padding:'15px', background:'#111', borderBottom:'2px solid #333', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{textAlign:'center', flex:1}}>
                    <div style={{fontSize:'0.8rem', color:'#60a5fa'}}>{matchData?.equipoLocalNombre}</div>
                    <div style={{fontSize:'2.2rem', fontWeight:'900'}}>{matchData?.marcadorLocal}</div>
                </div>
                <div style={{fontSize:'1.5rem', fontWeight:'900', color:'#f59e0b'}}>VS</div>
                <div style={{textAlign:'center', flex:1}}>
                    <div style={{fontSize:'0.8rem', color:'#facc15'}}>{matchData?.equipoVisitanteNombre}</div>
                    <div style={{fontSize:'2.2rem', fontWeight:'900'}}>{matchData?.marcadorVisitante}</div>
                </div>
            </div>

            <div style={{flex:1, display:'flex', overflow:'hidden'}}>
                <div style={{flex:1, overflowY:'auto', padding:'10px', borderRight:'1px solid #222'}}>
                    <div style={{fontSize:'0.7rem', color:'#60a5fa', marginBottom:'10px', fontWeight:'bold'}}>LOCAL</div>
                    {playersLocal.map(p => <PlayerRow key={p.id} player={p} team="local" stats={statsCache[p.id]} onStat={handleStat} />)}
                </div>
                <div style={{flex:1, overflowY:'auto', padding:'10px'}}>
                    <div style={{fontSize:'0.7rem', color:'#facc15', marginBottom:'10px', fontWeight:'bold'}}>VISITANTE</div>
                    {playersVisitante.map(p => <PlayerRow key={p.id} player={p} team="visitante" stats={statsCache[p.id]} onStat={handleStat} />)}
                </div>
            </div>

            <div style={{padding:'15px', background:'#111', display:'flex', gap:'10px'}}>
                <button onClick={()=>setSelectedMatchId(null)} style={{flex:1, padding:'12px', borderRadius:'8px', background:'#333', color:'white', border:'none', fontWeight:'bold'}}>SALIR</button>
                <button onClick={handleFinalize} style={{flex:2, padding:'12px', borderRadius:'8px', background:'#10b981', color:'white', border:'none', fontWeight:'bold'}}>FINALIZAR JUEGO</button>
            </div>
        </div>
    );
};

export default MesaTecnica;