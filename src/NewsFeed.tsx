import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

interface NewsItem { id: string; titulo: string; cuerpo: string; tipo: 'general' | 'sancion' | 'destacado'; fecha: any; imageUrl?: string; }

const NewsFeed: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

    const LEAGUE_LOGO = "https://i.postimg.cc/qMsBxr6P/image.png";

    useEffect(() => {
        const q = query(collection(db, 'noticias'), orderBy('fecha', 'desc'), limit(20));
        // Usamos onSnapshot para que si la IA genera una noticia, aparezca sola sin recargar
        const unsub = onSnapshot(q, (snap) => {
            setNews(snap.docs.map(d => ({ id: d.id, ...d.data() } as NewsItem)));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    // --- VISTA DE LA NOTICIA COMPLETA (ESTILO DIARIO DEPORTIVO) ---
    if (selectedNews) {
        return (
            <div className="animate-fade-in" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'white', zIndex: 2000, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                
                {/* HEADER 50PX (Igual que Mesa Técnica para consistencia) */}
                <div style={{ height: '50px', background: '#111', display: 'flex', alignItems: 'center', padding: '0 15px', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10, borderBottom: '1px solid #333' }}>
                    <button onClick={() => setSelectedNews(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}>
                        ← VOLVER
                    </button>
                    <img src={LEAGUE_LOGO} style={{ height: '30px' }} alt="Liga" />
                </div>

                {/* CUERPO DEL ARTÍCULO */}
                <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
                    
                    {/* FOTO COMPLETA ARRIBA */}
                    {selectedNews.imageUrl && (
                        <div style={{ width: '100%', background: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <img 
                                src={selectedNews.imageUrl} 
                                alt="Portada" 
                                style={{ width: '100%', maxHeight: '500px', objectFit: 'contain' }} 
                            />
                        </div>
                    )}

                    {/* TEXTO DE LA NOTICIA */}
                    <div style={{ padding: '25px', background: 'white' }}>
                        <div style={{ marginBottom: '20px' }}>
                            <span style={{ 
                                background: selectedNews.tipo === 'sancion' ? '#ef4444' : '#1e3a8a', 
                                color: 'white', padding: '4px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: '900', textTransform: 'uppercase' 
                            }}>
                                {selectedNews.tipo}
                            </span>
                            <h1 style={{ fontSize: '2rem', fontWeight: '900', color: '#111', marginTop: '15px', lineHeight: 1.1 }}>
                                {selectedNews.titulo.toUpperCase()}
                            </h1>
                            <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '10px', borderBottom: '1px solid #eee', paddingBottom: '15px' }}>
                                Publicado el: {selectedNews.fecha?.seconds ? new Date(selectedNews.fecha.seconds * 1000).toLocaleDateString(undefined, {weekday:'long', year:'numeric', month:'long', day:'numeric'}) : 'Recientemente'}
                            </p>
                        </div>

                        <div style={{ 
                            whiteSpace: 'pre-wrap', 
                            lineHeight: '1.8', 
                            color: '#334155', 
                            fontSize: '1.15rem', 
                            fontFamily: 'serif' // Fuente tipo periódico para el cuerpo
                        }}>
                            {selectedNews.cuerpo}
                        </div>

                        <div style={{ marginTop: '50px', padding: '20px', background: '#f8fafc', borderRadius: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem', border: '1px solid #e2e8f0' }}>
                            <b>LIGA SAN MATEO</b><br />Departamento de Prensa y Comunicaciones
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // --- VISTA DE LISTA (FEED PRINCIPAL) ---
    return (
        <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '0 10px' }}>
                <h2 style={{ fontSize: '1.5rem', color: '#1e3a8a', margin: 0, fontWeight: 900 }}>📢 NOTICIAS</h2>
                <button onClick={onClose} style={{ background: '#333', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>✕ CERRAR</button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>Cargando boletines oficiales...</div>
            ) : news.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', background: 'white', borderRadius: '15px' }}>No hay noticias publicadas.</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '0 10px' }}>
                    {news.map(item => (
                        <div 
                            key={item.id} 
                            onClick={() => setSelectedNews(item)}
                            style={{ 
                                background: 'white', 
                                borderRadius: '16px', 
                                overflow: 'hidden', 
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', 
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                border: '1px solid #e2e8f0'
                            }}
                        >
                            {item.imageUrl && (
                                <div style={{ width: '100%', height: '180px', background: `url(${item.imageUrl}) center/cover no-repeat` }} />
                            )}
                            <div style={{ padding: '15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.65rem', fontWeight: '900', color: '#3b82f6', textTransform: 'uppercase' }}>{item.tipo}</span>
                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                        {item.fecha?.seconds ? new Date(item.fecha.seconds * 1000).toLocaleDateString() : ''}
                                    </span>
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#1e293b', fontWeight: 'bold', lineHeight: 1.2 }}>{item.titulo}</h3>
                                <p style={{ margin: '8px 0 0 0', color: '#64748b', fontSize: '0.85rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {item.cuerpo}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default NewsFeed;