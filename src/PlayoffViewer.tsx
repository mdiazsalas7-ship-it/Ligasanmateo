import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase'; 
import { collection, query, onSnapshot, orderBy, doc, updateDoc, getDoc, where, getDocs } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';

interface PlayoffViewerProps {
    categoria: string;
    onClose: () => void;
}

const TeamLogo = ({ logoPath, fallbackName, categoria }: { logoPath: string, fallbackName: string, categoria: string }) => {
    const [url, setUrl] = useState<string>('');
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        const fetchLogo = async () => {
            // 1. Si ya viene la ruta en el objeto del partido, intentamos usarla
            if (logoPath && logoPath.startsWith('http')) {
                setUrl(logoPath);
                return;
            }

            // 2. Si no hay ruta (o está rota), buscamos en la colección de 'equipos' por el NOMBRE
            try {
                const colEquipos = categoria.trim().toUpperCase() === 'MASTER40' ? 'equipos' : `equipos_${categoria.trim().toUpperCase()}`;
                const q = query(collection(db, colEquipos), where('nombre', '==', fallbackName));
                const querySnap = await getDocs(q);

                if (!querySnap.empty) {
                    const data = querySnap.docs[0].data();
                    // Usamos 'logoUrl' que es como me mostraste que está en tu base de datos
                    if (data.logoUrl) {
                        setUrl(data.logoUrl);
                        setHasError(false);
                    } else {
                        setHasError(true);
                    }
                } else {
                    setHasError(true);
                }
            } catch (error) {
                setHasError(true);
            }
        };

        fetchLogo();
    }, [logoPath, fallbackName, categoria]);

    if (hasError || !url) {
        const initial = fallbackName ? fallbackName.charAt(0).toUpperCase() : '🏀';
        return (
            <div style={{ 
                width: '30px', height: '30px', borderRadius: '6px', 
                background: '#3b82f6', color: 'white', display: 'flex', 
                justifyContent: 'center', alignItems: 'center', fontWeight: '900', fontSize: '14px' 
            }}>
                {initial}
            </div>
        );
    }

    return (
        <img 
            src={url} 
            alt={fallbackName} 
            style={{ width: '30px', height: '30px', objectFit: 'contain', borderRadius: '4px', background: 'white' }} 
            onError={() => setHasError(true)}
        />
    );
};

const PlayoffViewer: React.FC<PlayoffViewerProps> = ({ categoria, onClose }) => {
    const [matches, setMatches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isActualAdmin, setIsActualAdmin] = useState(false); 
    const [editMode, setEditMode] = useState(false); 
    const [editScores, setEditScores] = useState<{ [key: string]: { l: number, v: number } }>({});

    const colName = categoria.trim().toUpperCase() === 'MASTER40' ? 'calendario' : `calendario_${categoria.trim().toUpperCase()}`;

    useEffect(() => {
        const checkAdminStatus = async () => {
            const user = auth.currentUser;
            if (user) {
                const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
                if (userDoc.exists() && userDoc.data().rol === 'admin') {
                    setIsActualAdmin(true);
                }
            }
        };
        checkAdminStatus();

        const q = query(collection(db, colName), orderBy('fechaAsignada', 'asc'));
        const unsub = onSnapshot(q, (snap) => {
            const data = snap.docs
                .map(d => ({ id: d.id, ...d.data() } as any))
                .filter(m => m.fase && m.fase.toUpperCase() !== 'REGULAR');
            setMatches(data);
            setLoading(false);
        });
        return () => unsub();
    }, [categoria, colName]);

    const handleSaveScore = async (id: string) => {
        const score = editScores[id];
        if (!score) return alert("Modifica el marcador antes de guardar.");
        try {
            await updateDoc(doc(db, colName, id), {
                marcadorLocal: Number(score.l),
                marcadorVisitante: Number(score.v),
                estatus: 'finalizado'
            });
            alert("✅ Resultado actualizado.");
        } catch (e) {
            alert("Error al guardar.");
        }
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'radial-gradient(circle, #1e3a8a 0%, #0f172a 100%)', zIndex: 2000, overflowY: 'auto', color: 'white', fontFamily: 'sans-serif' }}>
            <div style={{ padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 10 }}>
                <h2 style={{ margin: 0, fontSize: '1rem' }}>🏆 PLAYOFFS {categoria}</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {isActualAdmin && (
                        <button onClick={() => setEditMode(!editMode)} style={{ background: editMode ? '#f59e0b' : '#3b82f6', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.7rem' }}>
                            {editMode ? 'VER PÚBLICO' : 'EDITAR RESULTADOS'}
                        </button>
                    )}
                    <button onClick={onClose} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.7rem' }}>SALIR</button>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', marginTop: '100px' }}>Cargando...</div>
            ) : (
                <div style={{ display: 'flex', gap: '30px', padding: '30px 20px', overflowX: 'auto' }}>
                    {['OCTAVOS', 'CUARTOS', 'SEMIS', 'FINAL'].map((fase) => {
                        const phaseMatches = matches.filter(m => m.fase?.toUpperCase() === fase);
                        if (phaseMatches.length === 0) return null;
                        return (
                            <div key={fase} style={{ minWidth: '260px' }}>
                                <h3 style={{ textAlign: 'center', background: 'rgba(255,255,255,0.1)', padding: '10px', borderRadius: '8px', fontSize: '0.8rem', marginBottom: '15px' }}>{fase}</h3>
                                {phaseMatches.map(m => (
                                    <div key={m.id} style={{ background: 'white', borderRadius: '12px', padding: '12px', marginBottom: '12px', color: '#1e293b' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: '#64748b', marginBottom: '8px' }}>
                                            <span>{m.fechaAsignada}</span>
                                            <span style={{ fontWeight: 'bold' }}>{m.estatus === 'finalizado' ? 'FINAL' : 'PENDIENTE'}</span>
                                        </div>
                                        
                                        {/* Fila Equipo Local */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <TeamLogo logoPath={m.equipoLocalLogo} fallbackName={m.equipoLocalNombre} categoria={categoria} />
                                                <span style={{ fontWeight: 'bold' }}>{m.equipoLocalNombre}</span>
                                            </div>
                                            {editMode ? (
                                                <input type="number" defaultValue={m.marcadorLocal} onChange={(e) => setEditScores({...editScores, [m.id]: {...(editScores[m.id] || {v: m.marcadorVisitante || 0}), l: Number(e.target.value)}})} style={{ width: '40px', textAlign: 'center' }} />
                                            ) : (
                                                <span style={{ fontSize: '1.1rem', fontWeight: '900' }}>{m.marcadorLocal ?? '-'}</span>
                                            )}
                                        </div>

                                        {/* Fila Equipo Visitante */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <TeamLogo logoPath={m.equipoVisitanteLogo} fallbackName={m.equipoVisitanteNombre} categoria={categoria} />
                                                <span style={{ fontWeight: 'bold' }}>{m.equipoVisitanteNombre}</span>
                                            </div>
                                            {editMode ? (
                                                <input type="number" defaultValue={m.marcadorVisitante} onChange={(e) => setEditScores({...editScores, [m.id]: {...(editScores[m.id] || {l: m.marcadorLocal || 0}), v: Number(e.target.value)}})} style={{ width: '40px', textAlign: 'center' }} />
                                            ) : (
                                                <span style={{ fontSize: '1.1rem', fontWeight: '900' }}>{m.marcadorVisitante ?? '-'}</span>
                                            )}
                                        </div>

                                        {editMode && (
                                            <button onClick={() => handleSaveScore(m.id)} style={{ width: '100%', marginTop: '10px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', padding: '5px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>GUARDAR</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default PlayoffViewer;