import React from 'react';

interface Equipo {
    id: string;
    nombre: string;
    grupo: string; // Campo crucial para la división
    victorias: number;
    derrotas: number;
    puntos: number; // Puntos de tabla (2 por ganar, 1 por perder)
    puntos_favor: number;
    puntos_contra?: number;
    logoUrl?: string;
}

const StandingsViewer: React.FC<{ equipos: Equipo[], onClose: () => void }> = ({ equipos, onClose }) => {
    
    const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/166/166344.png";

    // FUNCIÓN DE ORDENAMIENTO (Puntos > DIF > PF)
    const sortTeams = (a: Equipo, b: Equipo) => {
        if (b.puntos !== a.puntos) return b.puntos - a.puntos;
        const diffA = a.puntos_favor - (a.puntos_contra || 0);
        const diffB = b.puntos_favor - (b.puntos_contra || 0);
        if (diffB !== diffA) return diffB - diffA;
        return b.puntos_favor - a.puntos_favor;
    };

    // Filtramos y ordenamos por grupos
    const grupoA = equipos.filter(e => e.grupo === 'A').sort(sortTeams);
    const grupoB = equipos.filter(e => e.grupo === 'B').sort(sortTeams);

    // Sub-componente para renderizar cada tabla
    const RenderTable = ({ teams, groupName, color }: { teams: Equipo[], groupName: string, color: string }) => (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)', marginBottom: '30px', overflow: 'hidden' }}>
            <div style={{ background: color, color: 'white', padding: '10px 20px', fontWeight: 'bold', fontSize: '1rem', textAlign: 'center' }}>
                CLASIFICACIÓN {groupName}
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.85rem' }}>
                    <thead style={{ background: '#f8f9fa', color: '#64748b', textTransform: 'uppercase', fontSize: '0.7rem' }}>
                        <tr>
                            <th style={{ padding: '12px' }}>Pos</th>
                            <th style={{ padding: '12px', textAlign: 'left' }}>Equipo</th>
                            <th>JJ</th>
                            <th>G</th>
                            <th>P</th>
                            <th>DIF</th>
                            <th style={{ background: '#eff6ff', color: '#1e40af' }}>PTS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {teams.map((eq, index) => {
                            const jugados = eq.victorias + eq.derrotas;
                            const dif = eq.puntos_favor - (eq.puntos_contra || 0);
                            return (
                                <tr key={eq.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '12px', fontWeight: 'bold', color: '#64748b' }}>{index + 1}</td>
                                    <td style={{ padding: '12px', textAlign: 'left' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <img 
                                                src={eq.logoUrl || DEFAULT_LOGO} 
                                                style={{ width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover' }}
                                                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_LOGO; }}
                                                alt="logo"
                                            />
                                            <span style={{ fontWeight: 'bold', color: '#1f2937' }}>{eq.nombre}</span>
                                        </div>
                                    </td>
                                    <td>{jugados}</td>
                                    <td style={{ color: '#10b981', fontWeight: 'bold' }}>{eq.victorias}</td>
                                    <td style={{ color: '#ef4444', fontWeight: 'bold' }}>{eq.derrotas}</td>
                                    <td style={{ fontWeight: 'bold', color: dif >= 0 ? '#3b82f6' : '#ef4444' }}>
                                        {dif > 0 ? `+${dif}` : dif}
                                    </td>
                                    <td style={{ background: '#eff6ff', fontWeight: '900', color: '#1e40af', fontSize: '1rem' }}>
                                        {eq.puntos}
                                    </td>
                                </tr>
                            );
                        })}
                        {teams.length === 0 && (
                            <tr><td colSpan={7} style={{ padding: '20px', color: '#94a3b8' }}>No hay equipos en este grupo</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="animate-fade-in" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(243, 244, 246, 0.98)', zIndex: 1500,
            display: 'flex', flexDirection: 'column'
        }}>
            {/* HEADER AZUL FIJO */}
            <header style={{
                background: '#1e3a8a', color: 'white', padding: '15px 20px', 
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.1)'
            }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.3rem' }}>🏆 Tabla de Posiciones</h2>
                    <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Temporada Oficial • Liga San Mateo</span>
                </div>
                <button onClick={onClose} style={{
                    background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', 
                    padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
                }}>VOLVER</button>
            </header>

            {/* CONTENEDOR DE TABLAS */}
            <main style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                    
                    {/* TABLA GRUPO A (Azul) */}
                    <RenderTable teams={grupoA} groupName="GRUPO A" color="#3b82f6" />

                    {/* TABLA GRUPO B (Rojo) */}
                    <RenderTable teams={grupoB} groupName="GRUPO B" color="#ef4444" />

                    {/* LEYENDA */}
                    <div style={{ padding: '15px', borderTop: '1px solid #ddd', fontSize: '0.75rem', color: '#64748b', textAlign: 'center' }}>
                        JJ: Juegos Jugados | G: Ganados | P: Perdidos | DIF: Diferencia de Puntos | PTS: Puntos de Tabla
                    </div>
                </div>
            </main>
        </div>
    );
};

export default StandingsViewer;