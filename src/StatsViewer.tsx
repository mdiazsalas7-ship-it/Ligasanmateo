import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';

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
    juegosDelEquipo: number; 
    ppg: number; rpg: number; spg: number; bpg: number;
    tpg: number; dpg: number; ftpg: number; valpg: number; 
    logoUrl?: string;
}

const StatsViewer: React.FC<{ onClose: () => void, categoria: string }> = ({ onClose, categoria }) => {
    
    const initialLeaders = { mvp: [], puntos: [], rebotes: [], robos: [], bloqueos: [], triples: [], dobles: [], tirosLibres: [] };
    const [leaders, setLeaders] = useState<Record<string, PlayerStat[]>>(initialLeaders);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('mvp');

    const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/451/451716.png";

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
        setLeaders(initialLeaders);
        setLoading(true);

        const initStats = async () => {
            try {
                const catStr = categoria.trim().toUpperCase();
                const isMaster = catStr === 'MASTER40' || catStr === 'MASTER';
                
                // 1. DETERMINAR COLECCIONES DINÁMICAS
                const colEquipos = isMaster ? 'equipos' : `equipos_${catStr}`;
                const colCalendario = isMaster ? 'calendario' : `calendario_${catStr}`;

                // 2. CARGAR MAPA DE EQUIPOS Y LOGOS
                const equiposSnap = await getDocs(collection(db, colEquipos));
                const logoMap: Record<string, string> = {};
                equiposSnap.forEach(d => {
                    const data = d.data();
                    if (data.nombre) {
                        logoMap[data.nombre.trim().toUpperCase()] = data.logoUrl || DEFAULT_LOGO;
                    }
                });

                // 3. OBTENER JUEGOS FINALIZADOS DE ESTA LIGA Y SUS IDs
                const calendarSnap = await getDocs(query(collection(db, colCalendario), where('estatus', '==', 'finalizado')));
                const teamGamesCount: Record<string, number> = {};
                const validGameIds = new Set<string>(); // <- NUEVO: Guardaremos los IDs de los juegos válidos

                calendarSnap.forEach(doc => {
                    const game = doc.data();
                    validGameIds.add(doc.id); // Guardamos el ID del juego válido
                    
                    const local = (game.equipoLocalNombre || '').trim().toUpperCase();
                    const visit = (game.equipoVisitanteNombre || '').trim().toUpperCase();
                    if (local) teamGamesCount[local] = (teamGamesCount[local] || 0) + 1;
                    if (visit) teamGamesCount[visit] = (teamGamesCount[visit] || 0) + 1;
                });

                // 4. ESCUCHAR ESTADÍSTICAS GLOBALES Y FILTRAR POR JUEGO VÁLIDO
                const q = query(collection(db, 'stats_partido'));
                
                unsubscribe = onSnapshot(q, (snapshot) => {
                    const aggregated: Record<string, any> = {};

                    snapshot.docs.forEach(doc => {
                        const stat = doc.data();
                        
                        // FILTRO MAESTRO ABSOLUTO: 
                        // Verificamos si la estadística pertenece a un juego que REALMENTE
                        // existe en el calendario de esta categoría y está finalizado.
                        // Asumimos que la estadística guarda el ID del juego en el campo 'partidoId' o 'juegoId'
                        const juegoId = stat.partidoId || stat.juegoId;

                        if (juegoId && validGameIds.has(juegoId)) {
                            const jId = stat.jugadorId;
                            const equipoStat = (stat.equipo || '').trim().toUpperCase();

                            if (!jId) return;

                            if (!aggregated[jId]) {
                                aggregated[jId] = {
                                    id: jId, jugadorId: jId, nombre: stat.nombre, equipo: stat.equipo,
                                    totalPuntos: 0, totalRebotes: 0, totalRobos: 0, totalBloqueos: 0,
                                    totalTriples: 0, totalDobles: 0, totalTirosLibres: 0, 
                                    partidosJugados: 0, logoUrl: logoMap[equipoStat] || DEFAULT_LOGO
                                };
                            }
                            const acc = aggregated[jId];
                            acc.totalPuntos += (Number(stat.tirosLibres)||0) + (Number(stat.dobles)||0)*2 + (Number(stat.triples)||0)*3;
                            acc.totalRebotes += (Number(stat.rebotes)||0);
                            acc.totalRobos += (Number(stat.robos)||0);
                            acc.totalBloqueos += (Number(stat.bloqueos)||0);
                            acc.totalTriples += (Number(stat.triples)||0);
                            acc.totalDobles += (Number(stat.dobles) || 0);
                            acc.totalTirosLibres += (Number(stat.tirosLibres) || 0);
                            acc.partidosJugados += 1;
                        }
                    });

                    const processedPlayers: PlayerStat[] = Object.values(aggregated).map((p: any) => {
                        const nombreEquipo = p.equipo ? p.equipo.trim().toUpperCase() : '';
                        const juegosDelEquipo = teamGamesCount[nombreEquipo] || p.partidosJugados || 1;
                        const val = (p.totalPuntos + p.totalRebotes + p.totalRobos + p.totalBloqueos);
                        
                        return {
                            ...p, 
                            juegosDelEquipo,
                            ppg: parseFloat((p.totalPuntos / juegosDelEquipo).toFixed(1)),
                            rpg: parseFloat((p.totalRebotes / juegosDelEquipo).toFixed(1)),
                            spg: parseFloat((p.totalRobos / juegosDelEquipo).toFixed(1)),
                            bpg: parseFloat((p.totalBloqueos / juegosDelEquipo).toFixed(1)),
                            tpg: parseFloat((p.totalTriples / juegosDelEquipo).toFixed(1)),
                            dpg: parseFloat((p.totalDobles / juegosDelEquipo).toFixed(1)),
                            ftpg: parseFloat((p.totalTirosLibres / juegosDelEquipo).toFixed(1)),
                            valpg: parseFloat((val / juegosDelEquipo).toFixed(1))
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
            } catch (error) { console.error(error); setLoading(false); }
        };
        initStats();
        return () => { if (unsubscribe) unsubscribe(); };
    }, [categoria]);

    const ActiveLeaderSection = () => {
        const cat = categories.find(c => c.id === activeTab)!;
        const data = leaders[activeTab as keyof typeof leaders];
        
        if (!data || data.length === 0) return (
            <div style={{textAlign:'center', padding:'60px 20px', color:'#94a3b8'}}>
                <div style={{fontSize:'2rem', marginBottom:'10px'}}>📭</div>
                <p style={{fontWeight:'900', fontSize:'0.9rem', color:'#1e3a8a', textTransform:'uppercase'}}>Temporada {categoria} por iniciar</p>
                <small style={{display:'block', marginTop:'5px'}}>No hay estadísticas en esta categoría.</small>
            </div>
        );
        
        const leader = data[0];
        const others = data.slice(1, 8);

        return (
            <div style={{background:'white', borderRadius:'28px', overflow:'hidden', boxShadow:'0 15px 35px rgba(0,0,0,0.1)', border:'1px solid #e2e8f0'}}>
                <div style={{
                    padding: '40px 25px', 
                    textAlign: 'center', 
                    background: `radial-gradient(circle at top right, ${cat.color}dd, ${cat.color}), url('https://www.transparenttextures.com/patterns/carbon-fibre.png')`,
                    position: 'relative',
                    color: 'white'
                }}>
                    <div style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.2)', padding: '6px 15px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: '900', border: '1px solid rgba(255,255,255,0.3)' }}>
                        RANKING #1
                    </div>
                    
                    <div style={{display:'flex', justifyContent:'center', marginBottom:'15px'}}>
                        <div style={{ width: '95px', height: '95px', borderRadius: '50%', border: '4px solid white', boxShadow: '0 8px 20px rgba(0,0,0,0.2)', background: 'white', overflow: 'hidden' }}>
                            <img src={leader.logoUrl || DEFAULT_LOGO} style={{width:'100%', height:'100%', objectFit:'contain'}} alt="logo" />
                        </div>
                    </div>
                    
                    <div style={{fontWeight:'900', fontSize:'1.9rem', textTransform:'uppercase', lineHeight: 1.1, textShadow: '0 2px 4px rgba(0,0,0,0.1)'}}>
                        {leader.nombre}
                    </div>
                    <div style={{fontSize:'0.75rem', fontWeight:'700', opacity: 0.9, marginTop:'5px', textTransform: 'uppercase'}}>
                        {leader.equipo} • {leader.juegosDelEquipo} PARTIDOS
                    </div>
                    
                    <div style={{marginTop: '20px'}}>
                        <span style={{fontSize:'5rem', fontWeight:'900', lineHeight: 1, textShadow: '2px 4px 10px rgba(0,0,0,0.2)'}}>
                            {(leader as any)[cat.statKey]}
                        </span>
                        <span style={{fontSize:'1.3rem', marginLeft:'8px', fontWeight: '800', opacity: 0.8}}>
                            {cat.unit}
                        </span>
                    </div>
                </div>
                
                <div style={{background:'#f8fafc', padding:'12px 20px', borderBottom:'1px solid #f1f5f9'}}>
                    <span style={{fontSize:'0.75rem', fontWeight:'900', color: cat.color, textTransform: 'uppercase', letterSpacing: '1px'}}>Top Perseguidores</span>
                </div>

                <div style={{minHeight:'200px'}}>
                    {others.map((p: any, i: number) => (
                        <div key={p.id} style={{ padding:'15px 20px', display:'flex', alignItems:'center', fontSize:'0.9rem', borderBottom:'1px solid #f1f5f9' }}>
                            <span style={{width:'30px', fontWeight:'900', color:'#cbd5e1', fontSize: '1.1rem'}}>{i+2}</span>
                            <img src={p.logoUrl || DEFAULT_LOGO} style={{width:'38px', height:'38px', borderRadius:'50%', marginRight:'15px', border: '1px solid #f1f5f9', objectFit:'contain'}} alt="t" />
                            <div style={{flex:1, display:'flex', flexDirection:'column'}}>
                                <span style={{fontWeight:'800', color:'#1e3a8a', fontSize: '1rem'}}>{p.nombre}</span>
                                <span style={{fontSize:'0.65rem', color:'#94a3b8', fontWeight: 'bold'}}>{p.equipo.toUpperCase()}</span>
                            </div>
                            <div style={{textAlign: 'right'}}>
                                <span style={{fontWeight:'900', color:cat.color, fontSize: '1.1rem'}}>{p[cat.statKey]}</span>
                                <div style={{fontSize:'0.6rem', color:'#94a3b8', fontWeight: 'bold'}}>{cat.unit}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div style={{ minHeight:'100vh', background:'#f8fafc', paddingBottom:'120px' }}>
            <div style={{background:'#1e3a8a', padding:'25px 20px', color:'white', boxShadow:'0 4px 15px rgba(0,0,0,0.1)', borderRadius: '0 0 30px 30px'}}>
                <div style={{maxWidth:'800px', margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div>
                        <h2 style={{margin:0, fontWeight:900, fontSize:'1.6rem', letterSpacing: '-0.5px'}}>📊 LÍDERES</h2>
                        <p style={{margin:0, opacity:0.8, fontSize:'0.75rem', fontWeight:'bold', textTransform:'uppercase', color: '#fbbf24'}}>Promedios Reales • {categoria}</p>
                    </div>
                    <button onClick={onClose} style={{background:'white', color:'#1e3a8a', border:'none', padding:'10px 20px', borderRadius:'15px', fontWeight:'900', fontSize:'0.75rem', cursor:'pointer', boxShadow:'0 4px 10px rgba(0,0,0,0.1)'}}>CERRAR</button>
                </div>
            </div>

            <div style={{ background:'white', borderBottom:'1px solid #e2e8f0', position:'sticky', top:0, zIndex:10 }}>
                <div className="no-scrollbar" style={{ display:'flex', overflowX:'auto', padding:'15px', gap:'12px', maxWidth:'800px', margin:'0 auto' }}>
                    {categories.map(cat => (
                        <button 
                            key={cat.id} 
                            onClick={() => setActiveTab(cat.id)}
                            style={{
                                flexShrink:0, padding:'10px 20px', borderRadius:'18px', border:'none',
                                background: activeTab === cat.id ? cat.color : '#f1f5f9',
                                color: activeTab === cat.id ? 'white' : '#64748b',
                                fontWeight:'800', fontSize:'0.75rem', cursor:'pointer', transition:'0.3s',
                                display:'flex', alignItems:'center', gap:'8px', boxShadow: activeTab === cat.id ? `0 4px 12px ${cat.color}44` : 'none'
                            }}
                        >
                            <span>{cat.icon}</span> {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{padding:'20px', maxWidth:'650px', margin:'0 auto'}}>
                {loading ? (
                    <div style={{textAlign:'center', padding:'100px', color:'#1e3a8a', fontWeight:'bold'}}>
                        <div style={{fontSize:'2rem', marginBottom:'10px'}}>🏀</div>
                        Calculando promedios...
                    </div>
                ) : <ActiveLeaderSection />}
            </div>

            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
};

export default StatsViewer;