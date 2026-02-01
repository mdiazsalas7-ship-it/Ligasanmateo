import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';

// Interfaz actualizada (no afecta la lógica visual, solo interna)
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
    partidosJugados: number; // Partidos que jugó el jugador
    juegosDelEquipo: number; // Partidos totales del equipo (NUEVO DENOMINADOR)
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
                // 1. OBTENER MAPA DE EQUIPOS Y SU CATEGORÍA
                const equiposSnap = await getDocs(collection(db, 'equipos'));
                const catMap: Record<string, string> = {};
                const logoMap: Record<string, string> = {};

                equiposSnap.forEach(d => {
                    const data = d.data();
                    if (data.nombre) {
                        const nombreNorm = data.nombre.trim().toUpperCase();
                        catMap[nombreNorm] = data.categoria || 'SIN_CAT'; 
                        logoMap[nombreNorm] = data.logoUrl || DEFAULT_LOGO;
                    }
                });

                // 2. NUEVO: CONTAR JUEGOS REALES POR EQUIPO DESDE EL CALENDARIO
                // Esto nos da el denominador "Justo"
                const calendarSnap = await getDocs(query(collection(db, 'calendario'), where('estatus', '==', 'finalizado')));
                const teamGamesCount: Record<string, number> = {};

                calendarSnap.forEach(doc => {
                    const game = doc.data();
                    if (game.equipoLocalNombre) {
                        const local = game.equipoLocalNombre.trim().toUpperCase();
                        teamGamesCount[local] = (teamGamesCount[local] || 0) + 1;
                    }
                    if (game.equipoVisitanteNombre) {
                        const visit = game.equipoVisitanteNombre.trim().toUpperCase();
                        teamGamesCount[visit] = (teamGamesCount[visit] || 0) + 1;
                    }
                });

                // 3. ESCUCHAR STATS
                const q = query(collection(db, 'stats_partido'));
                unsubscribe = onSnapshot(q, (snapshot) => {
                    const aggregated: Record<string, any> = {};

                    snapshot.docs.forEach(doc => {
                        const stat = doc.data();
                        const equipoStatRaw = stat.equipo || stat.nombreEquipo || ''; 
                        const equipoStat = equipoStatRaw.trim().toUpperCase();
                        
                        // --- FILTRO DE CATEGORÍA ---
                        let mostrar = false;
                        const categoriaRealDelEquipo = catMap[equipoStat] || 'SIN_CAT';

                        if (categoria === 'MASTER40') {
                            if (categoriaRealDelEquipo === 'MASTER40' || categoriaRealDelEquipo === 'SIN_CAT') mostrar = true;
                        } else {
                            if (categoriaRealDelEquipo === categoria) mostrar = true;
                        }

                        if (mostrar) {
                            const jId = stat.jugadorId;
                            if (!aggregated[jId]) {
                                aggregated[jId] = {
                                    id: jId, jugadorId: jId, nombre: stat.nombre, equipo: stat.equipo,
                                    totalPuntos: 0, totalRebotes: 0, totalRobos: 0, totalBloqueos: 0,
                                    totalTriples: 0, totalDobles: 0, totalTirosLibres: 0, 
                                    partidosJugados: 0, // Veces que aparece en stats
                                    logoUrl: logoMap[equipoStat] || DEFAULT_LOGO
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

                    // --- CÁLCULO DE PROMEDIOS CON "JUSTICIA" ---
                    const processedPlayers: PlayerStat[] = Object.values(aggregated).map((p: any) => {
                        const nombreEquipo = p.equipo ? p.equipo.trim().toUpperCase() : '';
                        
                        // EL DENOMINADOR MAGICO:
                        // Usamos la cantidad de juegos del equipo. Si por error es 0, usamos los que jugó el jugador.
                        const juegosDelEquipo = teamGamesCount[nombreEquipo] || p.partidosJugados || 1;

                        const val = (p.totalPuntos + p.totalRebotes + p.totalRobos + p.totalBloqueos);
                        
                        return {
                            ...p, 
                            juegosDelEquipo: juegosDelEquipo, // Guardamos este dato por si quieres mostrarlo
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

                    // Solo mostramos jugadores que hayan jugado al menos 1 vez (para no ensuciar la lista)
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
                <small style={{display:'block', marginTop:'5px'}}>Aún no hay estadísticas registradas.</small>
            </div>
        );
        
        const leader = data[0];
        const others = data.slice(1, 8);

        return (
            <div style={{background:'white', borderRadius:'24px', overflow:'hidden', boxShadow:'0 10px 25px rgba(0,0,0,0.05)', border:'1px solid #e2e8f0'}}>
                <div>
                    <div style={{padding:'25px', textAlign:'center', background:`linear-gradient(to bottom, white, #f8fafc)`, position:'relative'}}>
                        <div style={{position:'absolute', top:15, right:15, background:cat.color, color:'white', padding:'4px 10px', borderRadius:'10px', fontSize:'0.6rem', fontWeight:'900'}}>LÍDER</div>
                        
                        <div style={{display:'flex', justifyContent:'center', marginBottom:'12px'}}>
                            <img src={leader.logoUrl || DEFAULT_LOGO} style={{width:'65px', height:'65px', borderRadius:'50%', border:'3px solid white', boxShadow:'0 4px 10px rgba(0,0,0,0.1)', objectFit:'cover'}} alt="logo" />
                        </div>
                        
                        <div style={{fontWeight:'900', fontSize:'1.4rem', color:'#1e3a8a', textTransform:'uppercase'}}>{leader.nombre}</div>
                        <div style={{fontSize:'0.65rem', fontWeight:'bold', color:'#64748b', marginTop:'4px'}}>
                            {leader.equipo.toUpperCase()} • {leader.juegosDelEquipo} JUEGOS
                        </div>
                        
                        <div style={{fontSize:'3.2rem', fontWeight:'900', color:cat.color, lineHeight:1, marginTop:'5px'}}>
                            {(leader as any)[cat.statKey]}
                            <span style={{fontSize:'1rem', marginLeft:'5px', color:'#94a3b8'}}>{cat.unit}</span>
                        </div>
                    </div>
                    
                    <div style={{background:'#f8fafc', padding:'10px 20px', borderTop:'1px solid #e2e8f0', borderBottom:'1px solid #e2e8f0'}}>
                        <span style={{fontSize:'0.7rem', fontWeight:'900', color:'#1e3a8a'}}>TOP PERSEGUIDORES</span>
                    </div>

                    <div style={{minHeight:'200px'}}>
                        {others.map((p: any, i: number) => (
                            <div key={p.id} style={{padding:'12px 20px', display:'flex', alignItems:'center', fontSize:'0.9rem', borderBottom:'1px solid #f1f5f9'}}>
                                <span style={{width:'25px', fontWeight:'900', color:'#cbd5e1'}}>{i+2}</span>
                                <img src={p.logoUrl || DEFAULT_LOGO} style={{width:'30px', height:'30px', borderRadius:'50%', marginRight:'12px', objectFit:'cover'}} alt="t" />
                                <div style={{flex:1, display:'flex', flexDirection:'column'}}>
                                    <span style={{fontWeight:'700', color:'#334155'}}>{p.nombre}</span>
                                    <span style={{fontSize:'0.6rem', color:'#94a3b8'}}>JJ: {p.juegosDelEquipo}</span>
                                </div>
                                <span style={{fontWeight:'900', color:cat.color}}>{p[cat.statKey]}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div style={{ minHeight:'100vh', background:'#f1f5f9', paddingBottom:'100px' }}>
            
            <div style={{background:'#1e3a8a', padding:'20px', color:'white', boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}}>
                <div style={{maxWidth:'800px', margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div>
                        <h2 style={{margin:0, fontWeight:900, fontSize:'1.5rem'}}>📊 LÍDERES</h2>
                        <p style={{margin:0, opacity:0.8, fontSize:'0.7rem', fontWeight:'bold', textTransform:'uppercase'}}>Promedio Real ({categoria})</p>
                    </div>
                    <button onClick={onClose} style={{background:'white', color:'#1e3a8a', border:'none', padding:'8px 15px', borderRadius:'10px', fontWeight:'900', fontSize:'0.7rem', cursor:'pointer'}}>CERRAR</button>
                </div>
            </div>

            <div style={{ background:'white', borderBottom:'1px solid #e2e8f0', position:'sticky', top:0, zIndex:10 }}>
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
                                transition:'0.2s',
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

            <div style={{padding:'20px', maxWidth:'600px', margin:'0 auto'}}>
                {loading ? (
                    <div style={{textAlign:'center', padding:'50px', color:'#1e3a8a', fontWeight:'bold'}}>Calculando Estadísticas...</div>
                ) : (
                    <ActiveLeaderSection />
                )}
            </div>

            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
            `}</style>
        </div>
    );
};

export default StatsViewer;