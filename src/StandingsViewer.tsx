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

    // Filtramos y ordenamos con seguridad (evita errores si el prop es null)
    const safeEquipos = equipos || [];
    const grupoA = safeEquipos.filter(e => e.grupo === 'A').sort(sortTeams);
    const grupoB = safeEquipos.filter(e => e.grupo === 'B').sort(sortTeams);

    const RenderTable = ({ teams, groupName, color }: { teams: Equipo[], groupName: string, color: string }) => (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', marginBottom: '30px', overflow: 'hidden', borderTop: `5px solid ${color}` }}>
            <div style={{ background: '#fff', color: color, padding: '15px 20px', fontWeight: '900', fontSize: '1.1rem', textAlign: 'left', borderBottom: '1px solid #eee' }}>
                CLASIFICACIÓN {groupName}
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.85rem' }}>
                    <thead style={{ background: '#f8f9fa', color: '#64748b', textTransform: 'uppercase', fontSize: '0.65rem' }}>
                        <tr>
                            <th style={{ padding: '12px' }}>Pos</th>
                            <th style={{ padding: '12px', textAlign: 'left' }}>Equipo</th>
                            <th>JJ</th><th>G</th><th>P</th><th>DIF</th>
                            <th style={{ background: '#eff6ff', color: '#1e40af' }}>PTS</th>
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
                                                style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', background: '#f1f5f9' }}
                                                alt="logo"
                                            />
                                            <span style={{ fontWeight: '800', color: '#1e293b', fontSize: '0.8rem' }}>{eq.nombre}</span>
                                        </div>
                                    </td>
                                    <td style={{ fontWeight: '600' }}>{jj}</td>
                                    <td style={{ color: '#10b981', fontWeight: 'bold' }}>{eq.victorias ?? 0}</td>
                                    <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{eq.derrotas ?? 0}</td>
                                    <td style={{ fontWeight: 'bold', color: dif >= 0 ? '#3b82f6' : '#ef4444' }}>
                                        {dif > 0 ? `+${dif}` : dif}
                                    </td>
                                    <td style={{ background: '#eff6ff', fontWeight: '900', color: '#1e40af', fontSize: '1.1rem' }}>
                                        {eq.puntos ?? 0}
                                    </td>
                                </tr>
                            );
                        })}
                        {teams.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ padding: '30px', color: '#94a3b8', fontStyle: 'italic' }}>
                                    No hay resultados registrados en este grupo.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#f1f5f9', zIndex: 1500, display: 'flex', flexDirection: 'column' }}>
            {/* CABECERA AZUL */}
            <header style={{ background: '#1e3a8a', color: 'white', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.2)', flexShrink: 0 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, letterSpacing: '-0.5px' }}>🏆 TABLA DE POSICIONES</h2>
                    <span style={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 'bold', textTransform: 'uppercase' }}>Liga San Mateo • Oficial</span>
                </div>
                <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.4)', padding: '8px 20px', borderRadius: '25px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.75rem' }}>VOLVER</button>
            </header>

            {/* CUERPO DE LA TABLA */}
            <main style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
                <div style={{ maxWidth: '850px', margin: '0 auto' }}>
                    
                    {/* INFO DE CARGA SOLO SI ES NULL (TOTALMENTE VACÍO) */}
                    {!equipos ? (
                        <div style={{ textAlign: 'center', padding: '50px', color: '#1e3a8a', fontWeight: 'bold' }}>
                            Sincronizando con la liga...
                        </div>
                    ) : (
                        <>
                            <RenderTable teams={grupoA} groupName="GRUPO A" color="#2563eb" />
                            <RenderTable teams={grupoB} groupName="GRUPO B" color="#dc2626" />
                        </>
                    )}

                    <div style={{ padding: '20px', background: 'white', borderRadius: '10px', fontSize: '0.7rem', color: '#64748b', textAlign: 'center', border: '1px solid #e2e8f0', marginBottom: '30px' }}>
                        <strong>REGLAMENTO FIBA:</strong> Ganado: 2 pts | Perdido: 1 pt | Forfait: 0 pts.<br/>
                        Criterios de desempate: 1. Puntos de Tabla | 2. Diferencia de Puntos | 3. Puntos a Favor.
                    </div>
                </div>
            </main>
        </div>
    );
};

export default StandingsViewer;