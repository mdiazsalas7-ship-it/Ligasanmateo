import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';

interface PlayoffViewerProps {
    categoria: string;
    onClose: () => void;
}

// Subcomponente para procesar y mostrar los logos correctamente
const TeamLogo = ({ logoPath, fallbackName }: { logoPath: string, fallbackName: string }) => {
    const [url, setUrl] = useState<string>('https://via.placeholder.com/30?text=Logo');

    useEffect(() => {
        if (!logoPath) return;

        // Si la URL es de Firebase Storage (empieza con gs://)
        if (logoPath.startsWith('gs://')) {
            const storage = getStorage();
            const fileRef = ref(storage, logoPath);
            
            getDownloadURL(fileRef)
                .then((downloadUrl) => {
                    setUrl(downloadUrl);
                })
                .catch((error) => {
                    console.error(`Error cargando el logo de ${fallbackName}:`, error);
                    setUrl('https://via.placeholder.com/30?text=Error');
                });
        } 
        // Si ya es una URL web válida (http:// o https://)
        else if (logoPath.startsWith('http')) {
            setUrl(logoPath);
        }
    }, [logoPath, fallbackName]);

    return (
        <img 
            src={url} 
            alt={`Logo ${fallbackName}`} 
            style={{ width: '28px', height: '28px', objectFit: 'contain', borderRadius: '4px' }} 
            onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/30?text=NA'; }}
        />
    );
};

const PlayoffViewer: React.FC<PlayoffViewerProps> = ({ categoria, onClose }) => {
    const [matches, setMatches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const getCollectionName = (base: string) => {
        const cat = categoria.trim().toUpperCase();
        return cat === 'MASTER40' ? base : `${base}_${cat}`;
    };

    useEffect(() => {
        const colName = getCollectionName('calendario');
        // Ordenamos por fecha y luego por hora para la vista cronológica
        const q = query(
            collection(db, colName), 
            orderBy('fechaAsignada', 'asc'),
            orderBy('hora', 'asc')
        );
        
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs
                .map(d => ({id: d.id, ...d.data()} as any))
                .filter(m => m.fase && m.fase !== 'REGULAR');
            setMatches(data);
            setLoading(false);
        });
        return () => unsub();
    }, [categoria]);

    const MatchCard = ({ m }: { m: any }) => (
        <div style={{ 
            background: 'white', 
            borderRadius: '12px', 
            padding: '12px', 
            marginBottom: '12px', 
            borderLeft: '5px solid #f59e0b', 
            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', 
            fontSize: '0.75rem', 
            minWidth: '220px' 
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#64748b', fontWeight: '600', fontSize: '0.65rem' }}>
                <span>📅 {m.fechaAsignada} • ⏰ {m.hora}</span>
                <span style={{ 
                    padding: '2px 6px', 
                    borderRadius: '4px', 
                    background: m.estatus === 'finalizado' ? '#d1fae5' : '#fef3c7',
                    color: m.estatus === 'finalizado' ? '#065f46' : '#92400e' 
                }}>
                    {m.estatus === 'finalizado' ? 'FINAL' : 'PENDIENTE'}
                </span>
            </div>

            {/* Equipo Local */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TeamLogo logoPath={m.equipoLocalLogo} fallbackName={m.equipoLocalNombre} />
                    <span style={{ fontWeight: '800', color: '#1e293b' }}>{m.equipoLocalNombre}</span>
                </div>
                <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#1e3a8a' }}>{m.marcadorLocal ?? '-'}</span>
            </div>

            {/* Equipo Visitante */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TeamLogo logoPath={m.equipoVisitanteLogo} fallbackName={m.equipoVisitanteNombre} />
                    <span style={{ fontWeight: '800', color: '#1e293b' }}>{m.equipoVisitanteNombre}</span>
                </div>
                <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#1e3a8a' }}>{m.marcadorVisitante ?? '-'}</span>
            </div>
        </div>
    );

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(circle, #1e3a8a 0%, #0f172a 100%)', zIndex: 2000, overflowY: 'auto', color: 'white', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 10 }}>
                <h2 style={{ margin: 0, textTransform: 'uppercase', fontSize: '1.3rem', letterSpacing: '1px' }}>🏆 Playoffs {categoria}</h2>
                <button onClick={onClose} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', transition: '0.3s' }}>SALIR</button>
            </div>

            {loading ? (
                <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>Cargando llaves...</div>
            ) : (
                <div style={{ display: 'flex', gap: '30px', padding: '40px 20px', overflowX: 'auto', flex: 1, alignItems: 'flex-start' }}>
                    
                    {/* Renderizado de Columnas por Fase */}
                    {['OCTAVOS', 'CUARTOS', 'SEMIS', 'FINAL'].map((fase) => {
                        const phaseMatches = matches.filter(m => m.fase === fase);
                        if (fase === 'OCTAVOS' && phaseMatches.length === 0) return null;

                        return (
                            <div key={fase} style={{ minWidth: '260px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <h3 style={{ 
                                    textAlign: 'center', 
                                    background: fase === 'FINAL' ? '#f59e0b' : 'rgba(255,255,255,0.1)', 
                                    padding: '10px', 
                                    borderRadius: '8px',
                                    fontSize: '0.9rem',
                                    margin: 0 
                                }}>
                                    {fase === 'SEMIS' ? '⚡ SEMIFINALES' : fase === 'FINAL' ? '👑 GRAN FINAL' : `🔥 ${fase}`}
                                </h3>
                                
                                {phaseMatches.length > 0 ? (
                                    phaseMatches.map(m => (
                                        <div key={m.id} style={fase === 'FINAL' ? { transform: 'scale(1.1)', marginTop: '20px' } : {}}>
                                            <MatchCard m={m} />
                                            {fase === 'FINAL' && m.estatus === 'finalizado' && (
                                                <div style={{ textAlign: 'center', marginTop: '20px', animation: 'bounce 2s infinite' }}>
                                                    <span style={{ fontSize: '4rem' }}>🏆</span>
                                                    <div style={{ fontWeight: '900', fontSize: '1.5rem', color: '#f59e0b' }}>
                                                        {m.marcadorLocal > m.marcadorVisitante ? m.equipoLocalNombre : m.equipoVisitanteNombre}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>CAMPEÓN INDISCUTIBLE</div>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ textAlign: 'center', opacity: 0.4, fontSize: '0.8rem', padding: '20px', border: '1px dashed white', borderRadius: '10px' }}>
                                        Esperando resultados...
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default PlayoffViewer;