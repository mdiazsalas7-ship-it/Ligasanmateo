import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, onSnapshot, query, orderBy } from 'firebase/firestore';

interface PlayerStat {
    id: string; 
    jugadorId: string;
    nombre: string;
    equipo: string;
    totalPuntos: number;
    totalRebotes: number;
    totalAsistencias: number;
    totalRobos: number;
    totalTriples: number;
    totalDobles: number;
    totalTirosLibres: number;
    totalFaltas: number;
    totalValoracion: number;
    partidosJugados: number;
    ppg: number; rpg: number; apg: number; spg: number;
    tpg: number; dpg: number; ftpg: number; valpg: number; 
    logoUrl?: string;
}

const StatsViewer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [leaders, setLeaders] = useState<Record<string, PlayerStat[]>>({
        mvp: [], puntos: [], rebotes: [], asistencias: [], robos: [], triples: [], dobles: [], tirosLibres: []
    });
    
    const [loading, setLoading] = useState(true);
    const [selectedCard, setSelectedCard] = useState<{player: PlayerStat, type: string} | null>(null);

    const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/451/451716.png";
    const DEFAULT_PLAYER = "https://cdn-icons-png.flaticon.com/512/166/166344.png";

    useEffect(() => {
        let unsubscribe: () => void;
        const initStats = async () => {
            try {
                // 1. Mapeo de Logos de Equipos
                const equiposSnap = await getDocs(collection(db, 'equipos'));
                const teamLogos: Record<string, string> = {};
                equiposSnap.forEach(d => {
                    const data = d.data();
                    if (data.nombre) teamLogos[data.nombre.toUpperCase()] = data.logoUrl || DEFAULT_LOGO;
                });

                // 2. Escuchar estadísticas de cada partido
                const q = query(collection(db, 'stats_partido'));
                unsubscribe = onSnapshot(q, (snapshot) => {
                    const aggregated: Record<string, any> = {};

                    snapshot.docs.forEach(doc => {
                        const stat = doc.data();
                        const jId = stat.jugadorId;
                        if (!aggregated[jId]) {
                            aggregated[jId] = {
                                id: jId, jugadorId: jId, nombre: stat.nombre, equipo: stat.equipo,
                                totalPuntos: 0, totalRebotes: 0, totalAsistencias: 0, totalRobos: 0,
                                totalTriples: 0, totalDobles: 0, totalTirosLibres: 0, totalFaltas: 0, 
                                partidosJugados: 0, logoUrl: teamLogos[stat.equipo?.toUpperCase()] || DEFAULT_LOGO
                            };
                        }
                        
                        const acc = aggregated[jId];
                        
                        // CÁLCULO DE PUNTOS REAL (Arregla el error de puntos en cero)
                        const ptsLibres = Number(stat.tirosLibres) || 0;
                        const ptsDobles = (Number(stat.dobles) || 0) * 2;
                        const ptsTriples = (Number(stat.triples) || 0) * 3;
                        const puntosDeEsteJuego = ptsLibres + ptsDobles + ptsTriples;

                        acc.totalPuntos += puntosDeEsteJuego;
                        acc.totalRebotes += (Number(stat.rebotes) || 0);
                        acc.totalAsistencias += (Number(stat.asistencias) || 0);
                        acc.totalRobos += (Number(stat.robos) || 0);
                        acc.totalTriples += (Number(stat.triples) || 0);
                        acc.totalDobles += (Number(stat.dobles) || 0);
                        acc.totalTirosLibres += (Number(stat.tirosLibres) || 0);
                        acc.totalFaltas += (Number(stat.faltas) || 0);
                        acc.partidosJugados += 1;
                    });

                    // 3. Procesar promedios
                    const processedPlayers: PlayerStat[] = Object.values(aggregated).map((p: any) => {
                        const g = p.partidosJugados || 1; 
                        const val = (p.totalPuntos + p.totalRebotes + p.totalAsistencias) - p.totalFaltas;
                        return {
                            ...p, totalValoracion: val,
                            ppg: parseFloat((p.totalPuntos / g).toFixed(1)),
                            rpg: parseFloat((p.totalRebotes / g).toFixed(1)),
                            apg: parseFloat((p.totalAsistencias / g).toFixed(1)),
                            spg: parseFloat((p.totalRobos / g).toFixed(1)),
                            tpg: parseFloat((p.totalTriples / g).toFixed(1)),
                            dpg: parseFloat((p.totalDobles / g).toFixed(1)),
                            ftpg: parseFloat((p.totalTirosLibres / g).toFixed(1)),
                            valpg: parseFloat((val / g).toFixed(1))
                        };
                    });

                    const active = processedPlayers.filter(p => p.partidosJugados > 0);
                    
                    setLeaders({
                        mvp: [...active].sort((a,b) => b.valpg - a.valpg).slice(0, 10),
                        puntos: [...active].sort((a,b) => b.ppg - a.ppg).slice(0, 10),
                        rebotes: [...active].sort((a,b) => b.rpg - a.rpg).slice(0, 10),
                        asistencias: [...active].sort((a,b) => b.apg - a.apg).slice(0, 10),
                        robos: [...active].sort((a,b) => b.spg - a.spg).slice(0, 10),
                        triples: [...active].sort((a,b) => b.tpg - a.tpg).slice(0, 10),
                        dobles: [...active].sort((a,b) => b.dpg - a.dpg).slice(0, 10),
                        tirosLibres: [...active].sort((a,b) => b.ftpg - a.ftpg).slice(0, 10),
                    });
                    setLoading(false);
                });
            } catch (error) { setLoading(false); }
        };
        initStats();
        return () => { if (unsubscribe) unsubscribe(); };
    }, []);

    const AwardCardModal = () => {
        if (!selectedCard) return null;
        const { player, type } = selectedCard;
        const styles: any = {
            mvp: { bg: 'linear-gradient(45deg, #FFD700, #FDB931)', title: 'MVP', stat: player.valpg, lbl: 'VAL' },
            puntos: { bg: 'linear-gradient(135deg, #ef4444, #991b1b)', title: 'MÁXIMO ANOTADOR', stat: player.ppg, lbl: 'PPG' },
            rebotes: { bg: 'linear-gradient(135deg, #10b981, #064e3b)', title: 'LÍDER REBOTES', stat: player.rpg, lbl: 'RPG' },
            asistencias: { bg: 'linear-gradient(135deg, #3b82f6, #1e3a8a)', title: 'LÍDER ASISTENCIAS', stat: player.apg, lbl: 'APG' },
            robos: { bg: 'linear-gradient(135deg, #6366f1, #312e81)', title: 'LÍDER ROBOS', stat: player.spg, lbl: 'SPG' },
            triples: { bg: 'linear-gradient(135deg, #8b5cf6, #4c1d95)', title: 'FRANCOTIRADOR', stat: player.tpg, lbl: '3PG' },
            dobles: { bg: 'linear-gradient(135deg, #f59e0b, #92400e)', title: 'REY DE 2 PTS', stat: player.dpg, lbl: '2PG' },
            tirosLibres: { bg: 'linear-gradient(135deg, #64748b, #1e293b)', title: 'TIROS LIBRES', stat: player.ftpg, lbl: 'FTPG' }
        }[type] || { bg: '#333', title: 'PLAYER', stat: 0, lbl: 'ST' };

        return (
            <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.95)', zIndex:3000, display:'flex', justifyContent:'center', alignItems:'center', padding:'20px'}} onClick={() => setSelectedCard(null)}>
                <div onClick={e => e.stopPropagation()} style={{
                    width: '100%', maxWidth: '320px', height: '480px', borderRadius: '20px', 
                    background: styles.bg, boxShadow: '0 0 50px rgba(0,0,0,0.8)', position: 'relative', overflow: 'hidden',
                    border: '4px solid white', color: 'white', textAlign:'center'
                }}>
                    <div style={{marginTop:'30px', fontWeight:'900', fontSize:'1.2rem', letterSpacing:'2px'}}>{styles.title}</div>
                    
                    {/* LOGO DEL EQUIPO EN LA CARTA */}
                    <div style={{background:'white', width:'60px', height:'60px', borderRadius:'50%', margin:'15px auto', display:'flex', alignItems:'center', justifyContent:'center', padding:'5px', boxShadow:'0 4px 10px rgba(0,0,0,0.3)'}}>
                        <img src={player.logoUrl || DEFAULT_LOGO} style={{width:'100%', height:'100%', borderRadius:'50%', objectFit:'contain'}} alt="team" />
                    </div>

                    <div style={{fontSize:'1.6rem', fontWeight:'900', textTransform:'uppercase', padding:'0 10px'}}>{player.nombre}</div>
                    <img src={DEFAULT_PLAYER} style={{width:'85%', position:'absolute', bottom:100, left:'7.5%', opacity: 0.9}} alt="player" />
                    
                    <div style={{position:'absolute', bottom:20, left:20, right:20, background:'rgba(0,0,0,0.7)', borderRadius:'12px', padding:'15px', border:'1px solid rgba(255,255,255,0.2)'}}>
                        <div style={{fontSize:'2.8rem', fontWeight:'900', lineHeight:1}}>{styles.stat}</div>
                        <div style={{fontSize:'0.75rem', fontWeight:'bold', marginTop:'5px'}}>{styles.lbl} POR PARTIDO</div>
                    </div>
                </div>
            </div>
        );
    };

    const LeaderSection = ({ title, data, icon, color, label, type }: any) => {
        if (!data || data.length === 0) return null;
        const leader = data[0];
        const others = data.slice(1, 5);

        return (
            <div style={{background:'white', borderRadius:'16px', overflow:'hidden', boxShadow:'0 4px 15px rgba(0,0,0,0.1)', border:'1px solid #eee'}}>
                <div style={{background: color, padding:'12px 15px', color:'white', fontWeight:'bold', fontSize:'0.9rem', display:'flex', alignItems:'center', gap:'8px'}}>
                    <span>{icon}</span> {title}
                </div>
                
                {/* LÍDER #1 */}
                <div onClick={() => setSelectedCard({player: leader, type})} style={{padding:'20px', textAlign:'center', cursor:'pointer', borderBottom:'1px solid #f0f0f0', background:'linear-gradient(to bottom, #fff, #f9f9f9)'}}>
                    <div style={{display:'flex', justifyContent:'center', marginBottom:'10px'}}>
                        <img src={leader.logoUrl || DEFAULT_LOGO} style={{width:'45px', height:'45px', borderRadius:'50%', border:'2px solid #f0f0f0', objectFit:'cover'}} alt="logo" />
                    </div>
                    <div style={{fontWeight:'900', fontSize:'1.2rem', color:'#1a1a1a'}}>{leader.nombre}</div>
                    <div style={{fontSize:'2.2rem', fontWeight:'900', color, marginTop:'5px'}}>
                        {type === 'mvp' ? leader.valpg : type === 'puntos' ? leader.ppg : type === 'rebotes' ? leader.rpg : type === 'asistencias' ? leader.apg : type === 'robos' ? leader.spg : type === 'triples' ? leader.tpg : type === 'dobles' ? leader.dpg : leader.ftpg} 
                        <span style={{fontSize:'0.9rem', marginLeft:'5px'}}>{label}</span>
                    </div>
                </div>

                {/* RESTO DEL TOP 5 */}
                {others.map((p: any, i: number) => (
                    <div key={p.id} style={{padding:'10px 15px', display:'flex', alignItems:'center', fontSize:'0.85rem', borderBottom:'1px solid #f9f9f9'}}>
                        <span style={{width:'20px', fontWeight:'bold', color:'#999'}}>{i+2}</span>
                        <img src={p.logoUrl || DEFAULT_LOGO} style={{width:'25px', height:'25px', borderRadius:'50%', marginRight:'10px', objectFit:'cover'}} alt="t" />
                        <span style={{flex:1, fontWeight:'600', color:'#444'}}>{p.nombre}</span>
                        <span style={{fontWeight:'800', color:'#1a1a1a'}}>{type === 'mvp' ? p.valpg : type === 'puntos' ? p.ppg : type === 'rebotes' ? p.rpg : type === 'asistencias' ? p.apg : type === 'robos' ? p.spg : type === 'triples' ? p.tpg : type === 'dobles' ? p.dpg : p.ftpg}</span>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'#f3f4f6', zIndex:2000, overflowY:'auto', padding:'20px'}}>
            {selectedCard && <AwardCardModal />}
            <div style={{maxWidth:'1200px', margin:'0 auto'}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'30px', background:'#1e3a8a', padding:'20px', borderRadius:'15px', color:'white', boxShadow:'0 4px 12px rgba(0,0,0,0.2)'}}>
                    <div>
                        <h2 style={{margin:0, fontWeight:900, fontSize:'1.8rem', letterSpacing:'-1px'}}>📊 ESTADÍSTICAS OFICIALES</h2>
                        <p style={{margin:0, opacity:0.8, fontSize:'0.9rem', fontWeight:'bold'}}>LÍDERES DE TEMPORADA - LIGA SAN MATEO</p>
                    </div>
                    <button onClick={onClose} style={{background:'rgba(255,255,255,0.2)', border:'2px solid white', color:'white', padding:'10px 25px', borderRadius:'10px', fontWeight:'bold', cursor:'pointer', transition:'0.2s'}}>CERRAR</button>
                </div>

                {loading ? (
                    <div style={{textAlign:'center', padding:'50px', color:'#1e3a8a'}}>
                        <div style={{fontSize:'1.5rem', fontWeight:'bold'}}>Calculando promedios y líderes...</div>
                    </div>
                ) : (
                    <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:'25px', paddingBottom:'40px'}}>
                        <LeaderSection title="MVP DEL TORNEO" data={leaders.mvp} icon="👑" color="#eab308" label="VAL" type="mvp" />
                        <LeaderSection title="MÁXIMOS ANOTADORES" data={leaders.puntos} icon="🔥" color="#ef4444" label="PPG" type="puntos" />
                        <LeaderSection title="LÍDERES EN REBOTES" data={leaders.rebotes} icon="🖐️" color="#10b981" label="RPG" type="rebotes" />
                        <LeaderSection title="LÍDERES ASISTENCIAS" data={leaders.asistencias} icon="🎯" color="#3b82f6" label="APG" type="asistencias" />
                        <LeaderSection title="LÍDERES EN ROBOS" data={leaders.robos} icon="🛡️" color="#6366f1" label="SPG" type="robos" />
                        <LeaderSection title="MÁXIMOS TRIPLEROS" data={leaders.triples} icon="🏹" color="#8b5cf6" label="3PG" type="triples" />
                        <LeaderSection title="LÍDERES DOBLES" data={leaders.dobles} icon="👟" color="#f59e0b" label="2PG" type="dobles" />
                        <LeaderSection title="EFECTIVIDAD LIBRES" data={leaders.tirosLibres} icon="⚪" color="#64748b" label="FTPG" type="tirosLibres" />
                    </div>
                )}
            </div>
        </div>
    );
};
export default StatsViewer;