import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, onSnapshot, query } from 'firebase/firestore';

interface PlayerStat {
    id: string; 
    jugadorId: string;
    nombre: string;
    equipo: string;
    totalPuntos: number;
    totalRebotes: number;
    totalRobos: number;
    totalBloqueos: number;
    totalTriples: number;
    totalDobles: number;
    totalTirosLibres: number;
    totalValoracion: number;
    partidosJugados: number;
    ppg: number; rpg: number; spg: number; bpg: number;
    tpg: number; dpg: number; ftpg: number; valpg: number; 
    logoUrl?: string;
}

const StatsViewer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [leaders, setLeaders] = useState<Record<string, PlayerStat[]>>({
        mvp: [], puntos: [], rebotes: [], robos: [], bloqueos: [], triples: [], dobles: [], tirosLibres: []
    });
    
    const [loading, setLoading] = useState(true);
    const [selectedCard, setSelectedCard] = useState<{player: PlayerStat, type: string} | null>(null);
    const [activeTab, setActiveTab] = useState('mvp'); // Control de la categoría activa

    const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/451/451716.png";
    const DEFAULT_PLAYER = "https://cdn-icons-png.flaticon.com/512/166/166344.png";

    // Configuración de las pestañas
    const categories = [
        { id: 'mvp', label: 'MVP', icon: '👑', color: '#eab308', statKey: 'valpg', unit: 'VAL' },
        { id: 'puntos', label: 'PUNTOS', icon: '🔥', color: '#ef4444', statKey: 'ppg', unit: 'PPG' },
        { id: 'rebotes', label: 'REBOTES', icon: '🖐️', color: '#10b981', statKey: 'rpg', unit: 'RPG' },
        { id: 'robos', label: 'ROBOS', icon: '🛡️', color: '#6366f1', statKey: 'spg', unit: 'SPG' },
        { id: 'bloqueos', label: 'TAPONES', icon: '🚫', color: '#f43f5e', statKey: 'bpg', unit: 'BPG' },
        { id: 'triples', label: 'TRIPLES', icon: '🏹', color: '#8b5cf6', statKey: 'tpg', unit: '3PG' },
        { id: 'dobles', label: 'DOBLES', icon: '👟', color: '#f59e0b', statKey: 'dpg', unit: '2PG' },
        { id: 'tirosLibres', label: 'LIBRES', icon: '⚪', color: '#64748b', statKey: 'ftpg', unit: 'FTPG' },
    ];

    useEffect(() => {
        let unsubscribe: () => void;
        const initStats = async () => {
            try {
                const equiposSnap = await getDocs(collection(db, 'equipos'));
                const teamLogos: Record<string, string> = {};
                equiposSnap.forEach(d => {
                    const data = d.data();
                    if (data.nombre) teamLogos[data.nombre.toUpperCase()] = data.logoUrl || DEFAULT_LOGO;
                });

                const q = query(collection(db, 'stats_partido'));
                unsubscribe = onSnapshot(q, (snapshot) => {
                    const aggregated: Record<string, any> = {};

                    snapshot.docs.forEach(doc => {
                        const stat = doc.data();
                        const jId = stat.jugadorId;
                        if (!aggregated[jId]) {
                            aggregated[jId] = {
                                id: jId, jugadorId: jId, nombre: stat.nombre, equipo: stat.equipo,
                                totalPuntos: 0, totalRebotes: 0, totalRobos: 0, totalBloqueos: 0,
                                totalTriples: 0, totalDobles: 0, totalTirosLibres: 0, 
                                partidosJugados: 0, logoUrl: teamLogos[stat.equipo?.toUpperCase()] || DEFAULT_LOGO
                            };
                        }
                        
                        const acc = aggregated[jId];
                        const ptsLibres = Number(stat.tirosLibres) || 0;
                        const ptsDobles = (Number(stat.dobles) || 0) * 2;
                        const ptsTriples = (Number(stat.triples) || 0) * 3;

                        acc.totalPuntos += (ptsLibres + ptsDobles + ptsTriples);
                        acc.totalRebotes += (Number(stat.rebotes) || 0);
                        acc.totalRobos += (Number(stat.robos) || 0);
                        acc.totalBloqueos += (Number(stat.bloqueos) || 0);
                        acc.totalTriples += (Number(stat.triples) || 0);
                        acc.totalDobles += (Number(stat.dobles) || 0);
                        acc.totalTirosLibres += (Number(stat.tirosLibres) || 0);
                        acc.partidosJugados += 1;
                    });

                    const processedPlayers: PlayerStat[] = Object.values(aggregated).map((p: any) => {
                        const g = p.partidosJugados || 1; 
                        const val = (p.totalPuntos + p.totalRebotes + p.totalRobos + p.totalBloqueos);
                        return {
                            ...p, totalValoracion: val,
                            ppg: parseFloat((p.totalPuntos / g).toFixed(1)),
                            rpg: parseFloat((p.totalRebotes / g).toFixed(1)),
                            spg: parseFloat((p.totalRobos / g).toFixed(1)),
                            bpg: parseFloat((p.totalBloqueos / g).toFixed(1)),
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
                        robos: [...active].sort((a,b) => b.spg - a.spg).slice(0, 10),
                        bloqueos: [...active].sort((a,b) => b.bpg - a.bpg).slice(0, 10),
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
        const currentCat = categories.find(c => c.id === type) || categories[0];

        return (
            <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.95)', zIndex:3000, display:'flex', justifyContent:'center', alignItems:'center', padding:'20px'}} onClick={() => setSelectedCard(null)}>
                <div onClick={e => e.stopPropagation()} style={{
                    width: '100%', maxWidth: '320px', height: '450px', borderRadius: '25px', 
                    background: `linear-gradient(135deg, ${currentCat.color}, #000)`, boxShadow: '0 0 50px rgba(0,0,0,0.5)', position: 'relative', overflow: 'hidden',
                    border: '3px solid white', color: 'white', textAlign:'center'
                }}>
                    <div style={{marginTop:'30px', fontWeight:'900', fontSize:'1.1rem', letterSpacing:'2px'}}>{currentCat.label}</div>
                    <div style={{background:'white', width:'55px', height:'55px', borderRadius:'50%', margin:'15px auto', display:'flex', alignItems:'center', justifyContent:'center', padding:'5px'}}>
                        <img src={player.logoUrl || DEFAULT_LOGO} style={{width:'100%', height:'100%', borderRadius:'50%', objectFit:'contain'}} alt="team" />
                    </div>
                    <div style={{fontSize:'1.5rem', fontWeight:'900', textTransform:'uppercase', padding:'0 10px'}}>{player.nombre}</div>
                    <img src={DEFAULT_PLAYER} style={{width:'80%', position:'absolute', bottom:80, left:'10%', opacity: 0.8}} alt="player" />
                    <div style={{position:'absolute', bottom:20, left:20, right:20, background:'rgba(0,0,0,0.7)', borderRadius:'15px', padding:'12px', border:'1px solid rgba(255,255,255,0.2)'}}>
                        <div style={{fontSize:'2.5rem', fontWeight:'900'}}>{(player as any)[currentCat.statKey]}</div>
                        <div style={{fontSize:'0.7rem', fontWeight:'bold'}}>{currentCat.unit} POR PARTIDO</div>
                    </div>
                </div>
            </div>
        );
    };

    const ActiveLeaderSection = () => {
        const cat = categories.find(c => c.id === activeTab)!;
        const data = leaders[activeTab as keyof typeof leaders];
        if (!data || data.length === 0) return <div style={{textAlign:'center', padding:'40px', color:'#64748b'}}>No hay datos registrados aún.</div>;
        
        const leader = data[0];
        const others = data.slice(1, 8);

        return (
            <div className="animate-fade-in" style={{background:'white', borderRadius:'24px', overflow:'hidden', boxShadow:'0 10px 25px rgba(0,0,0,0.05)', border:'1px solid #e2e8f0'}}>
                <div onClick={() => setSelectedCard({player: leader, type: activeTab})} style={{padding:'25px', textAlign:'center', cursor:'pointer', background:`linear-gradient(to bottom, white, #f8fafc)`, position:'relative'}}>
                    <div style={{position:'absolute', top:15, right:15, background:cat.color, color:'white', padding:'4px 10px', borderRadius:'10px', fontSize:'0.6rem', fontWeight:'900'}}>LÍDER ACTUAL</div>
                    <div style={{display:'flex', justifyContent:'center', marginBottom:'12px'}}>
                        <img src={leader.logoUrl || DEFAULT_LOGO} style={{width:'60px', height:'60px', borderRadius:'50%', border:'3px solid white', boxShadow:'0 4px 10px rgba(0,0,0,0.1)', objectFit:'cover'}} alt="logo" />
                    </div>
                    <div style={{fontWeight:'900', fontSize:'1.4rem', color:'#1e3a8a', textTransform:'uppercase'}}>{leader.nombre}</div>
                    <div style={{fontSize:'3rem', fontWeight:'900', color:cat.color, lineHeight:1, marginTop:'10px'}}>
                        {(leader as any)[cat.statKey]}
                        <span style={{fontSize:'1rem', marginLeft:'5px', color:'#94a3b8'}}>{cat.unit}</span>
                    </div>
                    <div style={{fontSize:'0.7rem', color:'#64748b', fontWeight:'bold', marginTop:'5px'}}>CLICK PARA VER TARJETA 🎴</div>
                </div>
                
                <div style={{background:'#f8fafc', padding:'10px 20px', borderTop:'1px solid #e2e8f0', borderBottom:'1px solid #e2e8f0'}}>
                    <span style={{fontSize:'0.7rem', fontWeight:'900', color:'#1e3a8a'}}>TOP PERSEGUIDORES</span>
                </div>

                {others.map((p: any, i: number) => (
                    <div key={p.id} style={{padding:'12px 20px', display:'flex', alignItems:'center', fontSize:'0.9rem', borderBottom:'1px solid #f1f5f9'}}>
                        <span style={{width:'25px', fontWeight:'900', color:'#cbd5e1'}}>{i+2}</span>
                        <img src={p.logoUrl || DEFAULT_LOGO} style={{width:'30px', height:'30px', borderRadius:'50%', marginRight:'12px', objectFit:'cover'}} alt="t" />
                        <span style={{flex:1, fontWeight:'700', color:'#334155'}}>{p.nombre}</span>
                        <span style={{fontWeight:'900', color:cat.color}}>{p[cat.statKey]}</span>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div style={{ minHeight:'100vh', background:'#f1f5f9', paddingBottom:'100px' }}>
            {selectedCard && <AwardCardModal />}
            
            {/* CABECERA ESTÁTICA */}
            <div style={{background:'#1e3a8a', padding:'20px', color:'white', boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}}>
                <div style={{maxWidth:'800px', margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div>
                        <h2 style={{margin:0, fontWeight:900, fontSize:'1.5rem'}}>📊 LÍDERES</h2>
                        <p style={{margin:0, opacity:0.8, fontSize:'0.7rem', fontWeight:'bold', textTransform:'uppercase'}}>Estadísticas Oficiales Master 40</p>
                    </div>
                    <button onClick={onClose} style={{background:'white', color:'#1e3a8a', border:'none', padding:'8px 15px', borderRadius:'10px', fontWeight:'900', fontSize:'0.7rem', cursor:'pointer'}}>CERRAR</button>
                </div>
            </div>

            {/* SELECTOR DE CATEGORÍAS (TABS HORIZONTALES) */}
            <div style={{ background:'white', borderBottom:'1px solid #e2e8f0', sticky:'top', top:0, zIndex:10 }}>
                <div className="no-scrollbar" style={{ display:'flex', overflowX:'auto', padding:'10px', gap:'10px', maxWidth:'800px', margin:'0 auto' }}>
                    {categories.map(cat => (
                        <button 
                            key={cat.id} 
                            onClick={() => setActiveTab(cat.id)}
                            style={{
                                flexShrink:0,
                                padding:'10px 15px',
                                borderRadius:'15px',
                                border:'none',
                                background: activeTab === cat.id ? cat.color : '#f1f5f9',
                                color: activeTab === cat.id ? 'white' : '#64748b',
                                fontWeight:'bold',
                                fontSize:'0.7rem',
                                cursor:'pointer',
                                transition:'0.3s',
                                display:'flex',
                                alignItems:'center',
                                gap:'5px'
                            }}
                        >
                            <span>{cat.icon}</span> {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* CONTENIDO PRINCIPAL */}
            <div style={{padding:'20px', maxWidth:'600px', margin:'0 auto'}}>
                {loading ? (
                    <div style={{textAlign:'center', padding:'50px', color:'#1e3a8a', fontWeight:'bold'}}>PROCESANDO RÉCORDS...</div>
                ) : (
                    <ActiveLeaderSection />
                )}
            </div>

            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .animate-fade-in { animation: fadeIn 0.3s ease-in; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
};

export default StatsViewer;