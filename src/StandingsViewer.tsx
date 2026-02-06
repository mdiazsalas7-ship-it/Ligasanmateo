import React from 'react';

interface Equipo {
    id: string;
    nombre: string;
    grupo: string; 
    victorias: number;
    derrotas: number;
    puntos: number; // 2 win, 1 loss, 0 forfeit
    puntos_favor: number;
    puntos_contra: number;
    logoUrl?: string;
}

interface Partido {
    equipoLocalId: string;
    equipoVisitanteId: string;
    marcadorLocal: number;
    marcadorVisitante: number;
    estatus: string;
}

interface Props {
    equipos?: Equipo[];
    partidos?: Partido[]; // Indispensable para el desempate H2H
    onClose: () => void;
    categoria: string; // NUEVO: Necesario para saber si es LIBRE (Conferencias) o MASTER (Grupos)
}

const StandingsViewer: React.FC<Props> = ({ equipos = [], partidos = [], onClose, categoria }) => {
    
    const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/166/166344.png";

    // --- LÓGICA DE NOMBRES (IGUAL QUE EN EL DASHBOARD) ---
    const getGroupLabel = (groupCode: string) => {
        const catNorm = (categoria || '').trim().toUpperCase();
        if (catNorm === 'LIBRE') {
            if (groupCode === 'A') return 'CONFERENCIA ESTE';
            if (groupCode === 'B') return 'CONFERENCIA OESTE';
        }
        return `GRUPO ${groupCode}`;
    };

    /**
     * LÓGICA DE ORDENAMIENTO OFICIAL FIBA (Regla D.1.3)
     */
    const sortFIBARule = (teams: Equipo[]) => {
        return [...teams].sort((a, b) => {
            // CRITERIO 1: Puntos de clasificación (2-1-0)
            if (b.puntos !== a.puntos) {
                return b.puntos - a.puntos;
            }

            // CRITERIO 2: Empate detectado. H2H
            const tiedTeamsIds = teams.filter(t => t.puntos === a.puntos).map(t => t.id);
            const h2hMatches = partidos.filter(p => 
                p.estatus === 'finalizado' &&
                tiedTeamsIds.includes(p.equipoLocalId) && 
                tiedTeamsIds.includes(p.equipoVisitanteId)
            );

            const getH2HStats = (teamId: string) => {
                let h2hPts = 0;
                let h2hPF = 0;
                let h2hPC = 0;
                
                h2hMatches.forEach(m => {
                    if (m.equipoLocalId === teamId) {
                        h2hPF += m.marcadorLocal;
                        h2hPC += m.marcadorVisitante;
                        h2hPts += m.marcadorLocal > m.marcadorVisitante ? 2 : 1;
                    } else if (m.equipoVisitanteId === teamId) {
                        h2hPF += m.marcadorVisitante;
                        h2hPC += m.marcadorLocal;
                        h2hPts += m.marcadorVisitante > m.marcadorLocal ? 2 : 1;
                    }
                });
                return { h2hPts, h2hDif: h2hPF - h2hPC, h2hPF };
            };

            const statsA = getH2HStats(a.id);
            const statsB = getH2HStats(b.id);

            if (statsB.h2hPts !== statsA.h2hPts) return statsB.h2hPts - statsA.h2hPts;
            if (statsB.h2hDif !== statsA.h2hDif) return statsB.h2hDif - statsA.h2hDif;
            if (statsB.h2hPF !== statsA.h2hPF) return statsB.h2hPF - statsA.h2hPF;

            const globalDifA = a.puntos_favor - (a.puntos_contra || 0);
            const globalDifB = b.puntos_favor - (b.puntos_contra || 0);
            if (globalDifB !== globalDifA) return globalDifB - globalDifA;

            return b.puntos_favor - a.puntos_favor;
        });
    };

    const grupoA = sortFIBARule(equipos.filter(e => e.grupo?.toUpperCase() === 'A' || e.grupo?.toUpperCase() === 'ÚNICO'));
    const grupoB = sortFIBARule(equipos.filter(e => e.grupo?.toUpperCase() === 'B'));

    const RenderTable = ({ teams, groupName, color }: { teams: Equipo[], groupName: string, color: string }) => (
        <div style={{ background: 'white', borderRadius: '28px', boxShadow: '0 12px 35px rgba(0,0,0,0.1)', marginBottom: '35px', overflow: 'hidden', border: `2px solid ${color}` }}>
            <div style={{ background: color, color: 'white', padding: '16px', fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '1.1rem' }}>
                {groupName} • OFICIAL
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                    <thead style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                        <tr>
                            <th style={{ padding: '15px' }}>POS</th>
                            <th style={{ padding: '15px', textAlign: 'left' }}>EQUIPO</th>
                            <th>JJ</th>
                            <th>JG</th> {/* Victorias */}
                            <th>JP</th> {/* Derrotas (Añadido explícitamente) */}
                            <th>DIF</th>
                            <th style={{ background: 'rgba(0,0,0,0.05)', color: '#1e3a8a', width: '60px' }}>PTS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {teams.map((eq, index) => {
                            const jj = (eq.victorias ?? 0) + (eq.derrotas ?? 0);
                            const dif = (eq.puntos_favor ?? 0) - (eq.puntos_contra ?? 0);
                            return (
                                <tr key={eq.id} style={{ borderBottom: '1px solid #f1f5f9', transition: '0.2s' }}>
                                    <td style={{ padding: '15px', fontWeight: 'bold', color: '#94a3b8' }}>{index + 1}</td>
                                    <td style={{ padding: '10px 15px', textAlign: 'left' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ width: '35px', height: '35px', borderRadius: '50%', background: 'white', border: '1px solid #e2e8f0', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding:'2px' }}>
                                                <img src={eq.logoUrl || DEFAULT_LOGO} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="logo" />
                                            </div>
                                            <span style={{ fontWeight: '900', color: '#1e293b', fontSize: '0.8rem' }}>{eq.nombre.toUpperCase()}</span>
                                        </div>
                                    </td>
                                    <td style={{ fontWeight: '600', color: '#64748b' }}>{jj}</td>
                                    <td style={{ color: '#10b981', fontWeight: 'bold' }}>{eq.victorias}</td>
                                    <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{eq.derrotas}</td>
                                    <td style={{ fontWeight: 'bold', color: dif >= 0 ? '#3b82f6' : '#ef4444' }}>
                                        {dif > 0 ? `+${dif}` : dif}
                                    </td>
                                    <td style={{ background: 'rgba(0,0,0,0.02)', fontWeight: '900', color: color, fontSize: '1.2rem' }}>{eq.puntos}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', background: '#ffffff', paddingBottom: '120px' }}>
            {/* HEADER */}
            <div style={{ background: '#1e3a8a', color: 'white', padding: '30px 20px', borderRadius: '0 0 40px 40px', marginBottom: '30px', boxShadow: '0 10px 25px rgba(30,58,138,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '900px', margin: '0 auto' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-1px' }}>TABLAS {categoria}</h2>
                        <p style={{ margin: '5px 0 0 0', fontSize: '0.65rem', opacity: 0.9, fontWeight: 'bold', textTransform: 'uppercase', color: '#fbbf24' }}>
                            Reglamento Oficial FIBA • Eje Este 2026
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: 'white', color: '#1e3a8a', border: 'none', padding: '10px 20px', borderRadius: '15px', fontWeight: '900', fontSize: '0.7rem', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                        CERRAR
                    </button>
                </div>
            </div>

            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 20px' }}>
                {equipos.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '15px' }}>📡</div>
                        <p style={{ fontWeight: 'bold' }}>Sincronizando marcadores...</p>
                    </div>
                ) : (
                    <>
                        {grupoA.length > 0 && <RenderTable teams={grupoA} groupName={getGroupLabel('A')} color="#1e3a8a" />}
                        {grupoB.length > 0 && <RenderTable teams={grupoB} groupName={getGroupLabel('B')} color="#d97706" />}
                    </>
                )}

                {/* --- SECCIÓN ESPECIAL PARA MASTER 40: EXPLICACIÓN DE CRUCES --- */}
                {categoria.trim().toUpperCase() === 'MASTER40' && (
                    <div style={{ padding: '20px', background: '#eff6ff', borderRadius: '20px', border: '2px solid #1e3a8a', marginTop: '20px', textAlign: 'center' }}>
                        <h5 style={{ margin: '0 0 10px 0', color: '#1e3a8a', fontWeight: 900, fontSize: '0.9rem', textTransform: 'uppercase' }}>
                            🚨 FORMATO DE CLASIFICACIÓN
                        </h5>
                        <p style={{ fontSize: '0.75rem', color: '#334155', fontWeight: 'bold', marginBottom: '15px' }}>
                            En esta fase NINGÚN EQUIPO queda eliminado. <br/>
                            Los 8 equipos avanzan a Cuartos de Final así:
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.7rem', fontWeight: '900', color: '#1e3a8a' }}>
                            <div style={{ background: 'white', padding: '8px', borderRadius: '10px', border: '1px solid #bfdbfe' }}>1° GRUPO A <span style={{color:'#f59e0b'}}>VS</span> 4° GRUPO B</div>
                            <div style={{ background: 'white', padding: '8px', borderRadius: '10px', border: '1px solid #bfdbfe' }}>2° GRUPO A <span style={{color:'#f59e0b'}}>VS</span> 3° GRUPO B</div>
                            <div style={{ background: 'white', padding: '8px', borderRadius: '10px', border: '1px solid #bfdbfe' }}>3° GRUPO A <span style={{color:'#f59e0b'}}>VS</span> 2° GRUPO B</div>
                            <div style={{ background: 'white', padding: '8px', borderRadius: '10px', border: '1px solid #bfdbfe' }}>4° GRUPO A <span style={{color:'#f59e0b'}}>VS</span> 1° GRUPO B</div>
                        </div>
                    </div>
                )}

                {/* LEYENDA TÉCNICA */}
                <div style={{ padding: '20px', background: '#f8fafc', borderRadius: '20px', border: '1px solid #e2e8f0', marginTop: '20px' }}>
                    <h5 style={{ margin: '0 0 10px 0', color: '#1e3a8a', fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase' }}>
                        📌 Criterios FIBA D.1.3:
                    </h5>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.65rem', color: '#64748b', lineHeight: '1.5' }}>
                        <li><strong>PTS:</strong> 2 pts (Ganador), 1 pt (Perdedor), 0 pts (Forfait).</li>
                        <li><strong>Empates:</strong> Se deciden por juegos entre ellos (H2H) antes que por la diferencia global.</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default StandingsViewer;