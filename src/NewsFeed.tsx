import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

interface NewsItem { id: string; titulo: string; cuerpo: string; tipo: 'general' | 'sancion' | 'destacado'; fecha: any; imageUrl?: string; }

const LEAGUE_LOGO = "https://i.postimg.cc/FKgNmFpv/Whats_App_Image_2026_01_25_at_12_07_36_AM.jpg";

const tipoColor = (tipo: string) => tipo === 'sancion' ? '#ef4444' : tipo === 'destacado' ? '#f59e0b' : '#1e3a8a';

const NewsFeed: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [news, setNews]           = useState<NewsItem[]>([]);
    const [loading, setLoading]     = useState(true);
    const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

    useEffect(() => {
        const q = query(collection(db, 'noticias'), orderBy('fecha', 'desc'), limit(20));
        return onSnapshot(q, snap => {
            setNews(snap.docs.map(d => ({ id: d.id, ...d.data() } as NewsItem)));
            setLoading(false);
        });
    }, []);

    // ── Vista completa de la noticia ──
    if (selectedNews) return (
        <div style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 2000, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ height: 50, background: '#111', display: 'flex', alignItems: 'center', padding: '0 15px', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10, borderBottom: '1px solid #333' }}>
                <button onClick={() => setSelectedNews(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}>← VOLVER</button>
                <img src={LEAGUE_LOGO} style={{ height: 30, borderRadius: '50%' }} alt="Liga" />
            </div>
            <div style={{ width: '100%', maxWidth: 800, margin: '0 auto' }}>
                {selectedNews.imageUrl && (
                    <div style={{ width: '100%', background: '#000', display: 'flex', justifyContent: 'center' }}>
                        <img src={selectedNews.imageUrl} alt="Portada" style={{ width: '100%', maxHeight: 500, objectFit: 'contain' }} />
                    </div>
                )}
                <div style={{ padding: 25 }}>
                    <span style={{ background: tipoColor(selectedNews.tipo), color: 'white', padding: '4px 10px', borderRadius: 4, fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase' }}>
                        {selectedNews.tipo}
                    </span>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#111', marginTop: 15, lineHeight: 1.1 }}>{selectedNews.titulo.toUpperCase()}</h1>
                    <p style={{ color: '#666', fontSize: '0.85rem', marginTop: 10, borderBottom: '1px solid #eee', paddingBottom: 15 }}>
                        {selectedNews.fecha?.seconds ? new Date(selectedNews.fecha.seconds * 1000).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Recientemente'}
                    </p>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#334155', fontSize: '1.05rem' }}>{selectedNews.cuerpo}</div>
                </div>
            </div>
        </div>
    );

    const [portada, ...resto] = news;

    // ── Feed principal ──
    return (
        <div style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 40 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '0 12px' }}>
                <h2 style={{ fontSize: '1.4rem', color: '#1e3a8a', margin: 0, fontWeight: 900 }}>📢 NOTICIAS</h2>
                <button onClick={onClose} style={{ background: '#333', color: 'white', border: 'none', padding: '8px 15px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold' }}>✕ CERRAR</button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: '0.85rem' }}>Cargando boletines oficiales...</div>
            ) : news.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>No hay noticias publicadas aún.</div>
            ) : (
                <>
                    {/* ── BANNER PORTADA — noticia más reciente ── */}
                    {portada && (
                        <div
                            onClick={() => setSelectedNews(portada)}
                            style={{
                                margin: '0 12px 20px',
                                borderRadius: 20, overflow: 'hidden',
                                cursor: 'pointer', position: 'relative',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                                minHeight: 220,
                                background: portada.imageUrl ? '#000' : 'linear-gradient(135deg, #1e3a8a, #3b82f6)',
                            }}
                        >
                            {portada.imageUrl && (
                                <img
                                    src={portada.imageUrl} alt="Portada"
                                    style={{ width: '100%', height: 260, objectFit: 'cover', display: 'block', opacity: 0.7 }}
                                />
                            )}
                            {/* Gradiente oscuro abajo */}
                            <div style={{
                                position: 'absolute', bottom: 0, left: 0, right: 0,
                                background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
                                padding: '24px 18px 18px',
                            }}>
                                {/* Badge tipo */}
                                <span style={{
                                    background: tipoColor(portada.tipo), color: 'white',
                                    padding: '3px 10px', borderRadius: 4,
                                    fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase',
                                    marginBottom: 8, display: 'inline-block',
                                }}>
                                    ⭐ {portada.tipo === 'destacado' ? 'DESTACADO' : portada.tipo === 'sancion' ? 'SANCIÓN' : 'ÚLTIMO BOLETÍN'}
                                </span>
                                <h2 style={{ margin: '6px 0 8px', color: 'white', fontWeight: 900, fontSize: '1.2rem', lineHeight: 1.2 }}>
                                    {portada.titulo}
                                </h2>
                                <p style={{ margin: 0, color: 'rgba(255,255,255,0.7)', fontSize: '0.78rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {portada.cuerpo}
                                </p>
                                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem' }}>
                                        {portada.fecha?.seconds ? new Date(portada.fecha.seconds * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : ''}
                                    </span>
                                    <span style={{ color: '#60a5fa', fontSize: '0.7rem', fontWeight: 700 }}>Leer más →</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Resto de noticias ── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 12px' }}>
                        {resto.map(item => (
                            <div
                                key={item.id} onClick={() => setSelectedNews(item)}
                                style={{ background: 'white', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer', display: 'flex', border: '1px solid #e2e8f0', minHeight: 80 }}
                            >
                                {item.imageUrl && (
                                    <div style={{ width: 88, flexShrink: 0, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                        <img src={item.imageUrl} alt="n" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                )}
                                <div style={{ padding: '12px 14px', flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                        <span style={{ fontSize: '0.58rem', fontWeight: 900, color: tipoColor(item.tipo), textTransform: 'uppercase' }}>{item.tipo}</span>
                                        <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>
                                            {item.fecha?.seconds ? new Date(item.fecha.seconds * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : ''}
                                        </span>
                                    </div>
                                    <h3 style={{ margin: '0 0 4px', fontSize: '0.88rem', color: '#1e293b', fontWeight: 800, lineHeight: 1.2 }}>{item.titulo}</h3>
                                    <p style={{ margin: 0, color: '#64748b', fontSize: '0.75rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.cuerpo}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default NewsFeed;