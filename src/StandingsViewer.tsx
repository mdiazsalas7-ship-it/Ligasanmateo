import React, { useMemo } from 'react';

interface Equipo {
    id: string;
    nombre: string;
    grupo: string; 
    victorias: number;
    derrotas: number;
    puntos: number;
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
    fase?: string; 
}

interface Props {
    equipos?: Equipo[];
    partidos?: Partido[]; 
    onClose: () => void;
    categoria: string; 
}

const StandingsViewer: React.FC<Props> = ({ equipos = [], partidos = [], onClose, categoria }) => {
    
    const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/166/166344.png";

    // --- 1. RECALCULAR ESTADÍSTICAS (FILTRO MAESTRO) ---
    // Ignoramos lo que viene de la DB y sumamos nosotros solo lo REGULAR
    const equiposConStatsReales = useMemo(() => {
        return equipos.map(eq => {
            let victorias = 0;
            let derrotas = 0;
            let puntos_favor = 0;
            let puntos_contra = 0;
            let puntos = 0;

            // Solo procesamos partidos finalizados de Fase Regular
            const partidosRegular = partidos.filter(p => {
                const fase = (p.fase || '').trim().toUpperCase();
                return p.estatus === 'finalizado' && (fase === 'REGULAR' || fase === '');
            });

            partidosRegular.forEach(p => {
                if (p.equipoLocalId === eq.id) {
                    puntos_favor += p.marcadorLocal;
                    puntos_contra += p.marcadorVisitante;
                    if (p.marcadorLocal > p.marcadorVisitante) {
                        victorias += 1;
                        puntos += 2; // Victoria
                    } else {
                        derrotas += 1;
                        puntos += 1; // Derrota
                    }
                } else if (p.equipoVisitanteId === eq.id) {
                    puntos_favor += p.marcadorVisitante;
                    puntos_contra += p.marcadorLocal;
                    if (p.marcadorVisitante > p.marcadorLocal) {
                        victorias += 1;
                        puntos += 2;
                    } else {
                        derrotas += 1;
                        puntos += 1;
                    }
                }
            });

            return {
                ...eq,
                victorias,
                derrotas,
                puntos,
                puntos_favor,
                puntos_contra
            };
        });
    }, [equipos, partidos]);

    const getGroupLabel = (groupCode: string) => {
        const catNorm = (categoria || '').trim().toUpperCase();
        if (catNorm === 'LIBRE') {
            if (groupCode === 'A') return 'CONFERENCIA ESTE';
            if (groupCode === 'B') return 'CONFERENCIA OESTE';
        }
        return `GRUPO ${groupCode}`;
    };

    const sortFIBARule = (teams: Equipo[]) => {
        return [...teams].sort((a, b) => {
            if (b.puntos !== a.puntos) return b.puntos - a.puntos;

            const regularMatches = partidos.filter(p => {
                const fase = (p.fase || '').trim().toUpperCase();
                return p.estatus === 'finalizado' && (fase === 'REGULAR' || fase === '');
            });

            const tiedTeamsIds = teams.filter(t => t.puntos === a.puntos).map(t => t.id);
            const h2hMatches = regularMatches.filter(p => 
                tiedTeamsIds.includes(p.equipoLocalId) && 
                tiedTeamsIds.includes(p.equipoVisitanteId)
            );

            const getH2HStats = (teamId: string) => {
                let h2hPts = 0, h2hPF = 0, h2hPC = 0;
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

            return (b.puntos_favor - b.puntos_contra) - (a.puntos_favor - a.puntos_contra);
        });
    };

    const grupoA = sortFIBARule(equiposConStatsReales.filter(e => e.grupo?.toUpperCase() === 'A' || e.grupo?.toUpperCase() === 'ÚNICO'));
    const grupoB = sortFIBARule(equiposConStatsReales.filter(e => e.grupo?.toUpperCase() === 'B'));

    const RenderTable = ({ teams, groupName, color }: { teams: Equipo[], groupName: string, color: string }) => (
        <div style={{ background: 'white', borderRadius: '28px', boxShadow: '0 12px 35px rgba(0,0,0,0.1)', marginBottom: '35px', overflow: 'hidden', border: `2px solid ${color}` }}>
            <div style={{ background: color, color: 'white', padding: '16px', fontWeight: '900', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '1.1rem' }}>
                {groupName} • FASE REGULAR
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                    <thead style={{ background: '#f1f5f9', color: '#475569', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                        <tr>
                            <th style={{ padding: '15px' }}>POS</th>
                            <th style={{ padding: '15px', textAlign: 'left' }}>EQUIPO</th>
                            <th>JJ</th>
                            <th>JG</th>
                            <th>JP</th>
                            <th>DIF</th>
                            <th style={{ background: 'rgba(0,0,0,0.05)', color: '#1e3a8a', width: '60px' }}>PTS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {teams.map((eq, index) => {
                            const jj = eq.victorias + eq.derrotas;
                            const dif = eq.puntos_favor - eq.puntos_contra;
                            return (
                                <tr key={eq.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '15px', fontWeight: 'bold', color: '#94a3b8' }}>{index + 1}</td>
                                    <td style={{ padding: '10px 15px', textAlign: 'left' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <img src={eq.logoUrl || DEFAULT_LOGO} style={{ width: '35px', height: '35px', objectFit: 'contain' }} alt="logo" />
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
            <div style={{ background: '#1e3a8a', color: 'white', padding: '30px 20px', borderRadius: '0 0 40px 40px', marginBottom: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '900px', margin: '0 auto' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>TABLAS {categoria}</h2>
                        <p style={{ margin: '5px 0 0 0', fontSize: '0.65rem', fontWeight: 'bold', color: '#fbbf24' }}>
                            CONTABILIZANDO ÚNICAMENTE FASE REGULAR
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: 'white', color: '#1e3a8a', border: 'none', padding: '10px 20px', borderRadius: '15px', fontWeight: '900', cursor: 'pointer' }}>CERRAR</button>
                </div>
            </div>

            <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 20px' }}>
                {equiposConStatsReales.length === 0 ? (
                    <p style={{textAlign:'center'}}>Cargando equipos...</p>
                ) : (
                    <>
                        {grupoA.length > 0 && <RenderTable teams={grupoA} groupName={getGroupLabel('A')} color="#1e3a8a" />}
                        {grupoB.length > 0 && <RenderTable teams={grupoB} groupName={getGroupLabel('B')} color="#d97706" />}
                    </>
                )}
            </div>
        </div>
    );
};

export default StandingsViewer;