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
}

const StandingsViewer: React.FC<Props> = ({ equipos = [], partidos = [], onClose }) => {
    
    const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/166/166344.png";

    /**
     * LÓGICA DE ORDENAMIENTO OFICIAL FIBA (Regla D.1.3)
     */
    const sortFIBARule = (teams: Equipo[]) => {
        return [...teams].sort((a, b) => {
            // CRITERIO 1: Puntos de clasificación (2-1-0)
            if (b.puntos !== a.puntos) {
                return b.puntos - a.puntos;
            }

            // CRITERIO 2: Empate detectado. Calcular resultados entre equipos empatados (Head-to-Head)
            const tiedTeamsIds = teams.filter(t => t.puntos === a.puntos).map(t => t.id);
            
            // Filtramos solo los partidos jugados ENTRE los equipos que tienen los mismos puntos
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
                        // Regla 2-1-0
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

            // D.1.3.1: Mayor número de puntos en partidos entre ellos
            if (statsB.h2hPts !== statsA.h2hPts) return statsB.h2hPts - statsA.h2hPts;
            
            // D.1.3.2: Mayor diferencia de puntos en partidos entre ellos
            if (statsB.h2hDif !== statsA.h2hDif) return statsB.h2hDif - statsA.h2hDif;
            
            // D.1.3.3: Mayor número de puntos anotados entre ellos
            if (statsB.h2hPF !== statsA.h2hPF) return statsB.h2hPF - statsA.h2hPF;

            // D.1.3.4: Mayor diferencia de puntos en TODOS los partidos del grupo
            const globalDifA = a.puntos_favor - (a.puntos_contra || 0);
            const globalDifB = b.puntos_favor - (b.puntos_contra || 0);
            if (globalDifB !== globalDifA) return globalDifB - globalDifA;

            // D.1.3.5: Mayor número de puntos anotados en TODOS los partidos del grupo
            return b.puntos_favor - a.puntos_favor;
        });
    };

    // Filtrado por grupos y aplicación de la regla
    const grupoA = sortFIBARule(equipos.filter(e => e.grupo?.toUpperCase() === 'A' || e.grupo?.toUpperCase() === 'ÚNICO'));
    const grupoB = sortFIBARule(equipos.filter(e => e.grupo?.toUpperCase() === 'B'));

    const RenderTable = ({ teams, groupName, color }: { teams: Equipo[], groupName: string, color: string }) => (
        <div style={{ background: 'white', borderRadius: '28px', boxShadow: '0 12px 35px rgba(0,0,0,0.1)', marginBottom: '35px', overflow: 'hidden', border: `2px solid ${color}` }}>
            <div style={{ background: color, color: 'white', padding: '16px', fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '1.1rem' }}>
                {groupName} • CLASIFICACIÓN OFICIAL
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                    <thead style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                        <tr>
                            <th style={{ padding: '15px' }}>POS</th>
                            <th style={{ padding: '15px', textAlign: 'left' }}>EQUIPO</th>
                            <th>JJ</th><th>G</th><th>P</th><th>DIF</th>
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
                                            <div style={{ width: '35px', height: '35px', borderRadius: '50%', background: 'white', border: '1px solid #e2e8f0', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <img src={eq.logoUrl || DEFAULT_LOGO} style={{ width: '85%', height: '85%', objectFit: 'contain' }} alt="logo" />
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
            {/* HEADER ESTILO NBA/FIBA */}
            <div style={{ background: '#1e3a8a', color: 'white', padding: '30px 20px', borderRadius: '0 0 40px 40px', marginBottom: '30px', boxShadow: '0 10px 25px rgba(30,58,138,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '900px', margin: '0 auto' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, letterSpacing: '-1px' }}>🏆 TABLAS DE POSICIONES</h2>
                        <p style={{ margin: '5px 0 0 0', fontSize: '0.75rem', opacity: 0.9, fontWeight: 'bold', textTransform: 'uppercase', color: '#fbbf24' }}>
                            Reglamento Oficial FIBA • Eje Este 2026
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: 'white', color: '#1e3a8a', border: 'none', padding: '12px 25px', borderRadius: '15px', fontWeight: '900', fontSize: '0.75rem', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                        CERRAR
                    </button>
                </div>
            </div>

            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 20px' }}>
                {equipos.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '15px' }}>📡</div>
                        <p style={{ fontWeight: 'bold' }}>Sincronizando marcadores en tiempo real...</p>
                    </div>
                ) : (
                    <>
                        {grupoA.length > 0 && <RenderTable teams={grupoA} groupName="Grupo A / Único" color="#1e3a8a" />}
                        {grupoB.length > 0 && <RenderTable teams={grupoB} groupName="Grupo B" color="#d97706" />}
                    </>
                )}

                {/* LEYENDA TÉCNICA */}
                <div style={{ padding: '25px', background: '#f8fafc', borderRadius: '24px', border: '1px solid #e2e8f0', marginTop: '10px' }}>
                    <h5 style={{ margin: '0 0 12px 0', color: '#1e3a8a', fontWeight: 900, fontSize: '0.8rem', textTransform: 'uppercase' }}>
                        📌 Criterios de Clasificación (Regla D.1.3):
                    </h5>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.7rem', color: '#64748b', lineHeight: '1.6' }}>
                        <li><strong>1. Puntos:</strong> Victoria (2), Derrota (1), Incomparecencia (0).</li>
                        <li><strong>2. Head-to-Head (H2H):</strong> Resultados solo entre los equipos empatados.</li>
                        <li><strong>3. Diferencia de Puntos H2H:</strong> Solo en partidos entre equipos empatados.</li>
                        <li><strong>4. Puntos Anotados H2H:</strong> Mayor cantidad a favor entre equipos empatados.</li>
                        <li><strong>5. Diferencia Global:</strong> En todos los partidos del grupo (DIF).</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default StandingsViewer;