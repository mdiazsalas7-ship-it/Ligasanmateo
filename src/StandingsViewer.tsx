import React from 'react';

interface Equipo {
    id: string;
    nombre: string;
    grupo: string; 
    victorias: number;
    derrotas: number;
    puntos: number; 
    puntos_favor: number;
    puntos_contra?: number;
    logoUrl?: string;
}

const StandingsViewer: React.FC<{ equipos?: Equipo[], onClose: () => void }> = ({ equipos = [], onClose }) => {
    
    const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/166/166344.png";

    // FUNCIÓN DE ORDENAMIENTO PROFESIONAL (Puntos > DIF > PF)
    const sortTeams = (a: Equipo, b: Equipo) => {
        const ptsA = a.puntos ?? 0;
        const ptsB = b.puntos ?? 0;
        if (ptsB !== ptsA) return ptsB - ptsA;

        const difA = (a.puntos_favor ?? 0) - (a.puntos_contra ?? 0);
        const difB = (b.puntos_favor ?? 0) - (b.puntos_contra ?? 0);
        if (difB !== difA) return difB - difA;

        return (b.puntos_favor ?? 0) - (a.puntos_favor ?? 0);
    };

    const safeEquipos = equipos || [];
    const grupoA = safeEquipos.filter(e => e.grupo === 'A' || e.grupo === 'a').sort(sortTeams);
    const grupoB = safeEquipos.filter(e => e.grupo === 'B' || e.grupo === 'b').sort(sortTeams);

    const RenderTable = ({ teams, groupName, color }: { teams: Equipo[], groupName: string, color: string }) => (
        <div style={{ background: 'white', borderRadius: '20px', boxShadow: '0 10px 25px rgba(0,0,0,0.08)', marginBottom: '30px', overflow: 'hidden', border: `2px solid ${color}` }}>
            <div style={{ background: color, color: 'white', padding: '12px 20px', fontWeight: '900', fontSize: '1rem', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px' }}>
                CLASIFICACIÓN {groupName}
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.85rem' }}>
                    <thead style={{ background: '#f8f9fa', color: '#64748b', textTransform: 'uppercase', fontSize: '0.65rem' }}>
                        <tr>
                            <th style={{ padding: '12px' }}>Pos</th>
                            <th style={{ padding: '12px', textAlign: 'left' }}>Equipo</th>
                            <th>JJ</th><th>G</th><th>P</th><th>DIF</th>
                            <th style={{ background: 'rgba(0,0,0,0.05)', color: '#1e293b' }}>PTS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {teams.map((eq, index) => {
                            const jj = (eq.victorias ?? 0) + (eq.derrotas ?? 0);
                            const dif = (eq.puntos_favor ?? 0) - (eq.puntos_contra ?? 0);
                            return (
                                <tr key={eq.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#94a3b8' }}>{index + 1}</td>
                                    <td style={{ padding: '12px', textAlign: 'left' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <img 
                                                src={eq.logoUrl || DEFAULT_LOGO} 
                                                style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'contain', background: '#f1f5f9' }}
                                                alt="logo"
                                            />
                                            <span style={{ fontWeight: '800', color: '#1e293b', fontSize: '0.75rem' }}>{eq.nombre.toUpperCase()}</span>
                                        </div>
                                    </td>
                                    <td style={{ fontWeight: '600' }}>{jj}</td>
                                    <td style={{ color: '#10b981', fontWeight: 'bold' }}>{eq.victorias ?? 0}</td>
                                    <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{eq.derrotas ?? 0}</td>
                                    <td style={{ fontWeight: 'bold', color: dif >= 0 ? '#3b82f6' : '#ef4444' }}>
                                        {dif > 0 ? `+${dif}` : dif}
                                    </td>
                                    <td style={{ background: 'rgba(0,0,0,0.02)', fontWeight: '900', color: color, fontSize: '1rem' }}>
                                        {eq.puntos ?? 0}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', paddingBottom: '120px' }}>
            {/* CABECERA ESTILO LIGA */}
            <div style={{ background: '#1e3a8a', color: 'white', padding: '20px', borderRadius: '0 0 25px 25px', marginBottom: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900 }}>🏆 TABLAS</h2>
                        <p style={{ margin: 0, fontSize: '0.7rem', opacity: 0.8, fontWeight: 'bold', textTransform: 'uppercase' }}>Posiciones Oficiales Master 40</p>
                    </div>
                    <button onClick={onClose} style={{ background: 'white', color: '#1e3a8a', border: 'none', padding: '8px 15px', borderRadius: '10px', fontWeight: '900', fontSize: '0.7rem', cursor: 'pointer' }}>CERRAR</button>
                </div>
            </div>

            <div style={{ maxWidth: '850px', margin: '0 auto', padding: '0 15px' }}>
                {!equipos || equipos.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '50px', color: '#1e3a8a', fontWeight: 'bold' }}>
                        Sincronizando con la liga...
                    </div>
                ) : (
                    <>
                        <RenderTable teams={grupoA} groupName="GRUPO A - ELITE" color="#1e3a8a" />
                        <RenderTable teams={grupoB} groupName="GRUPO B - PRO" color="#d97706" />
                    </>
                )}

                <div style={{ padding: '15px', background: 'rgba(255,255,255,0.7)', borderRadius: '15px', fontSize: '0.65rem', color: '#64748b', textAlign: 'center', border: '1px solid #e2e8f0', backdropFilter: 'blur(4px)' }}>
                    <strong>SISTEMA DE PUNTUACIÓN:</strong><br/>
                    Victoria: 2 pts | Derrota: 1 pt | Forfait: 0 pts.
                </div>
            </div>
        </div>
    );
};

export default StandingsViewer;