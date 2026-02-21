import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, doc, updateDoc, getDocs, query, where, orderBy } from 'firebase/firestore';

const PlayoffAdmin: React.FC<{ categoria: string, onClose: () => void }> = ({ categoria, onClose }) => {
    const [matches, setMatches] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Mapeo de colecciones: MASTER40 -> calendario | LIBRE -> calendario_LIBRE
    const colName = categoria.trim().toUpperCase() === 'MASTER40' ? 'calendario' : `calendario_${categoria.trim().toUpperCase()}`;

    const fetchPlayoffs = async () => {
        try {
            const q = query(collection(db, colName)); 
            const snap = await getDocs(q);
            
            // Filtramos manualmente para ser más flexibles con los nombres de las fases
            const playoffGames = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as any))
                .filter(m => m.fase && m.fase.toUpperCase() !== 'REGULAR'); // Trae TODO lo que no sea REGULAR

            setMatches(playoffGames);
        } catch (error) {
            console.error("Error cargando juegos:", error);
            alert("Error al conectar con la base de datos.");
        }
    };

    useEffect(() => { fetchPlayoffs(); }, [categoria]);

    const guardarMarcador = async (matchId: string) => {
        const inputL = document.getElementById(`L-${matchId}`) as HTMLInputElement;
        const inputV = document.getElementById(`V-${matchId}`) as HTMLInputElement;

        if (!inputL.value || !inputV.value) return alert("Por favor, ingresa los dos marcadores.");

        setLoading(true);
        try {
            await updateDoc(doc(db, colName, matchId), {
                marcadorLocal: Number(inputL.value),
                marcadorVisitante: Number(inputV.value),
                estatus: 'finalizado' 
            });
            alert("✅ Resultado guardado. Ya debería aparecer en las llaves.");
            fetchPlayoffs();
        } catch (e) {
            alert("Error al guardar. Revisa tu conexión.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.98)', zIndex: 9999, padding: '20px', color: 'white', overflowY: 'auto', fontFamily: 'sans-serif' }}>
            
            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', borderBottom: '1px solid #334155', paddingBottom: '10px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.2rem' }}>🏆 CARGAR SCORES: {categoria}</h2>
                    <button onClick={onClose} style={{ background: '#ef4444', border: 'none', color: 'white', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>SALIR</button>
                </div>

                {matches.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', background: '#1e293b', borderRadius: '15px' }}>
                        <p>No se encontraron juegos de Playoff.</p>
                        <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Asegúrate de que en el Calendario, los juegos tengan el campo <b>fase</b> con nombres como: OCTAVOS, CUARTOS, SEMIS o FINAL.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {matches.map(m => (
                            <div key={m.id} style={{ background: '#1e293b', padding: '20px', borderRadius: '15px', border: m.estatus === 'finalizado' ? '2px solid #10b981' : '1px solid #334155' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                                    <span style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '0.75rem' }}>{m.fase}</span>
                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{m.fechaAsignada}</span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                    {/* Local */}
                                    <div style={{ flex: 1, textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.85rem', marginBottom: '8px', fontWeight: '600' }}>{m.equipoLocalNombre}</div>
                                        <input 
                                            id={`L-${m.id}`} 
                                            type="number" 
                                            defaultValue={m.marcadorLocal}
                                            style={{ width: '60px', padding: '12px', textAlign: 'center', borderRadius: '10px', border: 'none', fontSize: '1.2rem', fontWeight: 'bold' }} 
                                        />
                                    </div>

                                    <div style={{ fontWeight: 'bold', color: '#475569' }}>VS</div>

                                    {/* Visitante */}
                                    <div style={{ flex: 1, textAlign: 'center' }}>
                                        <div style={{ fontSize: '0.85rem', marginBottom: '8px', fontWeight: '600' }}>{m.equipoVisitanteNombre}</div>
                                        <input 
                                            id={`V-${m.id}`} 
                                            type="number" 
                                            defaultValue={m.marcadorVisitante}
                                            style={{ width: '60px', padding: '12px', textAlign: 'center', borderRadius: '10px', border: 'none', fontSize: '1.2rem', fontWeight: 'bold' }} 
                                        />
                                    </div>
                                </div>

                                <button 
                                    onClick={() => guardarMarcador(m.id)}
                                    disabled={loading}
                                    style={{ width: '100%', marginTop: '20px', background: m.estatus === 'finalizado' ? '#059669' : '#3b82f6', color: 'white', border: 'none', padding: '12px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                                >
                                    {loading ? 'GUARDANDO...' : m.estatus === 'finalizado' ? 'ACTUALIZAR RESULTADO' : 'FINALIZAR JUEGO'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PlayoffAdmin;