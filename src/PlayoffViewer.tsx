import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';

interface PlayoffViewerProps {
    categoria: string;
    onClose: () => void;
}

const PlayoffViewer: React.FC<PlayoffViewerProps> = ({ categoria, onClose }) => {
    const [matches, setMatches] = useState<any[]>([]);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [loading, setLoading] = useState(true);

    const getCollectionName = (base: string) => {
        const cat = categoria.trim().toUpperCase();
        if (cat === 'MASTER40') return base;
        return `${base}_${cat}`;
    };

    useEffect(() => {
        const colName = getCollectionName('calendario');
        const q = query(collection(db, colName), orderBy('fechaAsignada', 'asc'));
        
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs
                .map(d => ({id: d.id, ...d.data()} as any))
                .filter(m => m.fase && m.fase !== 'REGULAR');
            setMatches(data);
            setLoading(false);
        });
        return () => unsub();
    }, [categoria]);

    const MatchCard = ({ m }: { m: any }) => (
        <div style={{ background:'white', borderRadius:'12px', padding:'10px', marginBottom:'10px', borderLeft:'4px solid #f59e0b', boxShadow:'0 4px 6px rgba(0,0,0,0.05)', fontSize:'0.7rem', minWidth: '200px' }}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'5px', color:'#94a3b8', fontWeight:'bold', fontSize:'0.6rem'}}>
                <span>{m.fechaAsignada} • {m.hora}</span>
                <span style={{color: m.estatus === 'finalizado' ? '#10b981' : '#f59e0b'}}>{m.estatus === 'finalizado' ? 'FINAL' : 'PENDIENTE'}</span>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', fontWeight:'900', color:'#1e293b'}}>
                <span>{m.equipoLocalNombre}</span>
                <span style={{fontSize:'1.1rem', color:'#1e3a8a'}}>{m.marcadorLocal}</span>
            </div>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', fontWeight:'900', color:'#1e293b'}}>
                <span>{m.equipoVisitanteNombre}</span>
                <span style={{fontSize:'1.1rem', color:'#1e3a8a'}}>{m.marcadorVisitante}</span>
            </div>
        </div>
    );

    return (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'#1e3a8a', zIndex:2000, overflowY:'auto', color:'white', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'20px', display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(0,0,0,0.2)' }}>
                <h2 style={{margin:0, textTransform:'uppercase', fontSize:'1.2rem'}}>🏆 Playoffs {categoria}</h2>
                <button onClick={onClose} style={{background:'white', color:'#1e3a8a', border:'none', padding:'8px 15px', borderRadius:'20px', fontWeight:'bold', cursor:'pointer'}}>CERRAR</button>
            </div>

            <div style={{ display:'flex', gap:'15px', padding:'20px', overflowX:'auto', flex:1, alignItems:'flex-start' }}>
                
                {/* COLUMNA OCTAVOS */}
                {matches.some(m => m.fase === 'OCTAVOS') && (
                    <div style={{minWidth:'260px', display:'flex', flexDirection:'column', gap:'10px'}}>
                        <h3 style={{textAlign:'center', borderBottom:'1px solid rgba(255,255,255,0.3)', paddingBottom:'10px', margin:0}}>🔥 OCTAVOS</h3>
                        {matches.filter(m => m.fase === 'OCTAVOS').map(m => <MatchCard key={m.id} m={m} />)}
                    </div>
                )}

                {/* COLUMNA CUARTOS */}
                <div style={{minWidth:'260px', display:'flex', flexDirection:'column', gap:'10px'}}>
                    <h3 style={{textAlign:'center', borderBottom:'1px solid rgba(255,255,255,0.3)', paddingBottom:'10px', margin:0}}>⚔️ CUARTOS</h3>
                    {matches.filter(m => m.fase === 'CUARTOS').length > 0 ? 
                        matches.filter(m => m.fase === 'CUARTOS').map(m => <MatchCard key={m.id} m={m} />) : 
                        <div style={{textAlign:'center', opacity:0.5, fontSize:'0.8rem', marginTop:'20px', fontStyle:'italic'}}>Esperando cruces...</div>
                    }
                </div>

                {/* COLUMNA SEMIS */}
                <div style={{minWidth:'260px', display:'flex', flexDirection:'column', gap:'10px'}}>
                    <h3 style={{textAlign:'center', borderBottom:'1px solid rgba(255,255,255,0.3)', paddingBottom:'10px', margin:0}}>⚡ SEMIFINALES</h3>
                    {matches.filter(m => m.fase === 'SEMIS').length > 0 ? 
                        matches.filter(m => m.fase === 'SEMIS').map(m => <MatchCard key={m.id} m={m} />) :
                        <div style={{textAlign:'center', opacity:0.5, fontSize:'0.8rem', marginTop:'20px', fontStyle:'italic'}}>Por definir</div>
                    }
                </div>

                {/* COLUMNA FINAL */}
                <div style={{minWidth:'280px', display:'flex', flexDirection:'column', gap:'10px'}}>
                    <h3 style={{textAlign:'center', borderBottom:'1px solid #f59e0b', paddingBottom:'10px', color:'#f59e0b', margin:0}}>👑 GRAN FINAL</h3>
                    {matches.filter(m => m.fase === 'FINAL').length > 0 ? 
                        matches.filter(m => m.fase === 'FINAL').map(m => (
                            <div key={m.id} style={{transform:'scale(1.05)', transformOrigin:'top center'}}>
                                <MatchCard m={m} />
                                {m.estatus === 'finalizado' && (
                                    <div style={{textAlign:'center', marginTop:'15px'}}>
                                        <span style={{fontSize:'3rem'}}>🏆</span>
                                        <div style={{fontWeight:'900', fontSize:'1.2rem', textTransform:'uppercase'}}>
                                            {m.marcadorLocal > m.marcadorVisitante ? m.equipoLocalNombre : m.equipoVisitanteNombre}
                                        </div>
                                        <div style={{fontSize:'0.7rem', opacity:0.8}}>CAMPEÓN {categoria}</div>
                                    </div>
                                )}
                            </div>
                        )) :
                        <div style={{textAlign:'center', opacity:0.5, fontSize:'0.8rem', marginTop:'20px', fontStyle:'italic'}}>El Trono espera...</div>
                    }
                </div>

            </div>
        </div>
    );
};

export default PlayoffViewer;