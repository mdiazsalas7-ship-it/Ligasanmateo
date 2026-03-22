import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { collection, query, orderBy, limit, where, getDocs } from 'firebase/firestore';

// ─────────────────────────────────────────────
// Colección según categoría
// ─────────────────────────────────────────────
const getColName = (base: string, cat: string) =>
    cat === 'MASTER40' ? base : `${base}_${cat}`;

const CATEGORIAS = ['MASTER40', 'LIBRE', 'INTERINDUSTRIAL', 'U16_FEMENINO', 'U16M'];

const LIGA_LOGO = 'https://i.postimg.cc/FKgNmFpv/Whats_App_Image_2026_01_25_at_12_07_36_AM.jpg';

interface TickerItem {
    type: 'noticia' | 'lider' | 'resultado' | 'proximo';
    text: string;
    icon: string;
}

const MetroTicker: React.FC = () => {
    const [items, setItems]     = useState<TickerItem[]>([]);
    const [loaded, setLoaded]   = useState(false);
    const trackRef              = useRef<HTMLDivElement>(null);
    const animRef               = useRef<number>(0);
    const posRef                = useRef(0);

    // ── Carga de datos ──
    useEffect(() => {
        const load = async () => {
            const result: TickerItem[] = [];

            try {
                // 1. Últimas noticias
                const newsSnap = await getDocs(
                    query(collection(db, 'noticias'), orderBy('fecha', 'desc'), limit(4))
                );
                newsSnap.forEach(d => {
                    result.push({ type: 'noticia', icon: '📢', text: d.data().titulo });
                });

                // 2. Resultados recientes y próximos juegos de todas las categorías
                for (const cat of CATEGORIAS) {
                    const col = getColName('calendario', cat);
                    try {
                        // Resultados
                        const resSnap = await getDocs(
                            query(collection(db, col),
                                where('estatus', '==', 'finalizado'),
                                orderBy('fechaAsignada', 'desc'),
                                limit(3))
                        );
                        resSnap.forEach(d => {
                            const p = d.data();
                            result.push({
                                type: 'resultado', icon: '🏀',
                                text: `${cat !== 'MASTER40' ? `[${cat}] ` : ''}${p.equipoLocalNombre} ${p.marcadorLocal ?? 0} - ${p.marcadorVisitante ?? 0} ${p.equipoVisitanteNombre}`,
                            });
                        });

                        // Próximos
                        const today = new Date().toISOString().split('T')[0];
                        const proxSnap = await getDocs(
                            query(collection(db, col),
                                where('estatus', '==', 'programado'),
                                where('fechaAsignada', '>=', today),
                                orderBy('fechaAsignada', 'asc'),
                                limit(2))
                        );
                        proxSnap.forEach(d => {
                            const p = d.data();
                            result.push({
                                type: 'proximo', icon: '📅',
                                text: `${cat !== 'MASTER40' ? `[${cat}] ` : ''}${p.equipoLocalNombre} vs ${p.equipoVisitanteNombre} · ${p.fechaAsignada}${p.hora ? ' ' + p.hora : ''}`,
                            });
                        });
                    } catch { /* colección no existe */ }
                }

                // 3. Líderes de stats (MASTER40)
                try {
                    const jugSnap = await getDocs(collection(db, 'jugadores'));
                    const jugs = jugSnap.docs.map(d => ({ ...d.data() } as any)).filter(j => j.partidosJugados > 0);
                    const top = (key: string) => jugs.sort((a, b) => (b[key] || 0) - (a[key] || 0))[0];
                    const statLabels: { key: string; label: string; icon: string }[] = [
                        { key: 'puntos',   label: 'PTS', icon: '🔥' },
                        { key: 'rebotes',  label: 'REB', icon: '🖐' },
                        { key: 'robos',    label: 'ROB', icon: '🛡' },
                        { key: 'triples',  label: '3PT', icon: '🏹' },
                    ];
                    for (const st of statLabels) {
                        const lider = top(st.key);
                        if (lider?.nombre) {
                            const avg = lider.partidosJugados > 0
                                ? (lider[st.key] / lider.partidosJugados).toFixed(1)
                                : lider[st.key];
                            result.push({
                                type: 'lider', icon: st.icon,
                                text: `LÍDER ${st.label}: ${lider.nombre} · ${avg} ${st.label}/PJ`,
                            });
                        }
                    }
                } catch { /* sin jugadores */ }

            } catch (e) {
                console.warn('[MetroTicker] Error cargando datos:', e);
            }

            // Fallback si no hay nada
            if (result.length === 0) {
                result.push({ type: 'noticia', icon: '🏀', text: 'Bienvenidos a la Liga Metropolitana Eje Este 2026' });
            }

            setItems(result);
            setLoaded(true);
        };

        load();
        // Recargar cada 5 minutos
        const interval = setInterval(load, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    // ── Animación CSS pura — sin JS scroll ──
    // Se usan dos copias para loop infinito seamless
    const itemColor = (type: TickerItem['type']) => {
        switch (type) {
            case 'noticia':   return '#60a5fa';
            case 'lider':     return '#fbbf24';
            case 'resultado': return '#34d399';
            case 'proximo':   return '#a78bfa';
        }
    };

    if (!loaded) return null;

    // Duplicamos para loop continuo
    const allItems = [...items, ...items];

    return (
        <div style={{
            width: '100%',
            background: 'linear-gradient(90deg, #020c1b 0%, #0d1f4a 50%, #020c1b 100%)',
            borderBottom: '2px solid #f97316',
            display: 'flex',
            alignItems: 'center',
            height: 36,
            overflow: 'hidden',
            position: 'sticky',
            top: 0,
            zIndex: 999,
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
        }}>
            {/* Logo fijo a la izquierda */}
            <div style={{
                flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 10px',
                borderRight: '1px solid rgba(249,115,22,0.4)',
                height: '100%',
                background: 'rgba(249,115,22,0.1)',
            }}>
                <img
                    src={LIGA_LOGO}
                    alt="Liga"
                    style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #f97316' }}
                />
                <span style={{
                    fontSize: '0.5rem', fontWeight: 900, color: '#f97316',
                    letterSpacing: '1.5px', whiteSpace: 'nowrap', textTransform: 'uppercase',
                }}>
                    METRO NEWS
                </span>
            </div>

            {/* Cinta scrolling */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                <style>{`
                    @keyframes metroScroll {
                        0%   { transform: translateX(0); }
                        100% { transform: translateX(-50%); }
                    }
                    .metro-track {
                        display: flex;
                        align-items: center;
                        white-space: nowrap;
                        animation: metroScroll ${Math.max(items.length * 1, 5)}s linear infinite;
                        will-change: transform;
                    }
                    .metro-track:hover {
                        animation-play-state: paused;
                    }
                `}</style>

                <div className="metro-track">
                    {allItems.map((item, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, paddingRight: 32 }}>
                            {/* Separador */}
                            <span style={{ color: '#f97316', fontSize: '0.6rem', marginRight: 6, opacity: 0.5 }}>◆</span>
                            {/* Icono */}
                            <span style={{ fontSize: '0.7rem' }}>{item.icon}</span>
                            {/* Texto */}
                            <span style={{
                                fontSize: '0.62rem',
                                fontWeight: item.type === 'lider' ? 900 : 600,
                                color: itemColor(item.type),
                                fontFamily: "'Inter','Segoe UI',sans-serif",
                                letterSpacing: '0.3px',
                            }}>
                                {item.text}
                            </span>
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default MetroTicker;