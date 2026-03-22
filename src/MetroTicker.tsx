import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { collection, query, orderBy, limit, where, getDocs } from 'firebase/firestore';

const getColName = (base: string, cat: string) =>
    cat === 'MASTER40' ? base : `${base}_${cat}`;

const CATEGORIAS = ['MASTER40', 'LIBRE', 'INTERINDUSTRIAL', 'U16_FEMENINO', 'U16M'];
const LIGA_LOGO  = 'https://i.postimg.cc/FKgNmFpv/Whats_App_Image_2026_01_25_at_12_07_36_AM.jpg';
const SPEED      = 0.6; // px per frame — ajusta aquí la velocidad

interface TickerItem {
    type: 'noticia' | 'lider' | 'resultado' | 'proximo';
    text: string;
    icon: string;
}

const itemColor = (type: TickerItem['type']) => {
    switch (type) {
        case 'noticia':   return '#60a5fa';
        case 'lider':     return '#fbbf24';
        case 'resultado': return '#34d399';
        case 'proximo':   return '#a78bfa';
    }
};

const MetroTicker: React.FC = () => {
    const [items, setItems]   = useState<TickerItem[]>([]);
    const [loaded, setLoaded] = useState(false);

    // Refs para animación JS
    const wrapRef  = useRef<HTMLDivElement>(null); // contenedor con overflow:hidden
    const trackRef = useRef<HTMLDivElement>(null); // la pista doble que se mueve
    const posRef   = useRef(0);
    const rafRef   = useRef(0);
    const pauseRef = useRef(false);

    // ── Carga de datos ──
    useEffect(() => {
        const load = async () => {
            const result: TickerItem[] = [];
            const today = new Date().toISOString().split('T')[0];

            try {
                // 1. Noticias
                try {
                    const newsSnap = await getDocs(
                        query(collection(db, 'noticias'), orderBy('fecha', 'desc'), limit(3))
                    );
                    newsSnap.forEach(d =>
                        result.push({ type: 'noticia', icon: '📢', text: d.data().titulo })
                    );
                } catch { /* sin noticias */ }

                // 2. Resultados y próximos — sin combinar where+orderBy en campos distintos
                for (const cat of CATEGORIAS) {
                    const col = getColName('calendario', cat);
                    const catLabel = cat !== 'MASTER40' ? `[${cat}] ` : '';
                    try {
                        // Traemos todo y filtramos en memoria para evitar índices compuestos
                        const allSnap = await getDocs(
                            query(collection(db, col), orderBy('fechaAsignada', 'desc'), limit(40))
                        );
                        const docs = allSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

                        // Últimos 2 resultados finalizados
                        const finalizados = docs
                            .filter(p => p.estatus === 'finalizado')
                            .slice(0, 2);
                        finalizados.forEach(p => {
                            result.push({
                                type: 'resultado', icon: '🏀',
                                text: `${catLabel}${p.equipoLocalNombre} ${p.marcadorLocal ?? 0} - ${p.marcadorVisitante ?? 0} ${p.equipoVisitanteNombre}`,
                            });
                        });

                        // Próximos 2 juegos programados (fechaAsignada >= hoy)
                        const proximos = docs
                            .filter(p => p.estatus === 'programado' && (p.fechaAsignada || '') >= today)
                            .sort((a, b) => (a.fechaAsignada || '').localeCompare(b.fechaAsignada || ''))
                            .slice(0, 2);
                        proximos.forEach(p => {
                            result.push({
                                type: 'proximo', icon: '📅',
                                text: `PRÓXIMO ${catLabel}${p.equipoLocalNombre} vs ${p.equipoVisitanteNombre} · ${p.fechaAsignada}${p.hora ? ' ' + p.hora : ''}`,
                            });
                        });
                    } catch { /* col no existe */ }
                }

                // 3. Líderes por categoría — calculados desde stats_partido
                const statDefs = [
                    { key: 'puntos',  label: 'PTS', icon: '🔥' },
                    { key: 'rebotes', label: 'REB', icon: '🖐' },
                    { key: 'robos',   label: 'ROB', icon: '🛡' },
                    { key: 'triples', label: '3PT', icon: '🏹' },
                ];

                for (const cat of CATEGORIAS) {
                    const catLabel = cat !== 'MASTER40' ? ` ${cat}` : '';
                    const colJug = cat === 'MASTER40' ? 'jugadores' : `jugadores_${cat}`;
                    const colCal = getColName('calendario', cat);
                    try {
                        // Partidos finalizados de esta categoría
                        const calSnap = await getDocs(
                            query(collection(db, colCal), where('estatus', '==', 'finalizado'), limit(50))
                        );
                        if (calSnap.empty) continue;
                        const validIds = new Set(calSnap.docs.map(d => d.id));

                        // Stats de jugadores filtrando solo esos partidos
                        const statsSnap = await getDocs(collection(db, 'stats_partido'));
                        const agg: Record<string, any> = {};
                        statsSnap.docs.forEach(d => {
                            const s = d.data();
                            if (!validIds.has(s.partidoId) || !s.jugadorId) return;
                            const id = s.jugadorId;
                            if (!agg[id]) agg[id] = { nombre: s.nombre, pj: 0, puntos: 0, rebotes: 0, robos: 0, triples: 0 };
                            const pts = (Number(s.tirosLibres)||0) + (Number(s.dobles)||0)*2 + (Number(s.triples)||0)*3;
                            agg[id].pj++;
                            agg[id].puntos  += pts;
                            agg[id].rebotes += (Number(s.rebotes)||0);
                            agg[id].robos   += (Number(s.robos)||0);
                            agg[id].triples += (Number(s.triples)||0);
                        });

                        const players = Object.values(agg).filter((p: any) => p.pj > 0);
                        if (players.length === 0) continue;

                        // Un líder por stat (solo el de PTS para no saturar)
                        const topPts = [...players].sort((a: any, b: any) => (b.puntos/b.pj) - (a.puntos/a.pj))[0] as any;
                        if (topPts?.nombre) {
                            result.push({
                                type: 'lider', icon: '🔥',
                                text: `LÍDER PTS${catLabel}: ${topPts.nombre} · ${(topPts.puntos/topPts.pj).toFixed(1)} PPJ`,
                            });
                        }
                    } catch { /* col no existe */ }
                }

            } catch (e) {
                console.warn('[MetroTicker]', e);
            }

            if (result.length === 0)
                result.push({ type: 'noticia', icon: '🏀', text: 'Bienvenidos a la Liga Metropolitana Eje Este 2026' });

            setItems(result);
            setLoaded(true);
        };

        load();
        const iv = setInterval(load, 5 * 60 * 1000);
        return () => clearInterval(iv);
    }, []);

    // ── Animación RAF — se lanza una sola vez cuando los items están listos ──
    useEffect(() => {
        if (!loaded || items.length === 0) return;

        // Espera un tick para que el DOM renderice la pista
        const tid = setTimeout(() => {
            const track = trackRef.current;
            if (!track) return;

            // Ancho de la primera mitad (una copia de los items)
            const halfW = track.scrollWidth / 2;
            posRef.current = 0;

            const step = () => {
                if (!pauseRef.current) {
                    posRef.current += SPEED;
                    // Reset suave al llegar a la mitad — sin salto visible
                    if (posRef.current >= halfW) {
                        posRef.current -= halfW;
                    }
                    if (track) {
                        track.style.transform = `translateX(-${posRef.current}px)`;
                    }
                }
                rafRef.current = requestAnimationFrame(step);
            };

            rafRef.current = requestAnimationFrame(step);
        }, 100);

        return () => {
            clearTimeout(tid);
            cancelAnimationFrame(rafRef.current);
        };
    }, [loaded, items]);

    if (!loaded) return null;

    // Duplicamos para loop seamless
    const allItems = [...items, ...items];

    return (
        <div style={{
            width: '100%',
            background: 'linear-gradient(90deg, #020c1b 0%, #0d1f4a 50%, #020c1b 100%)',
            borderBottom: '2px solid #f97316',
            display: 'flex', alignItems: 'center',
            height: 36, overflow: 'hidden',
            position: 'sticky', top: 0, zIndex: 999,
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
        }}>
            {/* Logo fijo */}
            <div style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 10px', borderRight: '1px solid rgba(249,115,22,0.4)',
                height: '100%', background: 'rgba(249,115,22,0.1)',
            }}>
                <img src={LIGA_LOGO} alt="Liga"
                    style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #f97316' }} />
                <span style={{ fontSize: '0.5rem', fontWeight: 900, color: '#f97316', letterSpacing: '1.5px', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
                    METRO NEWS
                </span>
            </div>

            {/* Cinta scrolling */}
            <div
                ref={wrapRef}
                style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
                onMouseEnter={() => { pauseRef.current = true; }}
                onMouseLeave={() => { pauseRef.current = false; }}
                onTouchStart={() => { pauseRef.current = true; }}
                onTouchEnd={() => { setTimeout(() => { pauseRef.current = false; }, 1500); }}
            >
                <div
                    ref={trackRef}
                    style={{
                        display: 'flex', alignItems: 'center',
                        whiteSpace: 'nowrap', willChange: 'transform',
                    }}
                >
                    {allItems.map((item, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, paddingRight: 36 }}>
                            <span style={{ color: '#f97316', fontSize: '0.6rem', marginRight: 4, opacity: 0.5 }}>◆</span>
                            <span style={{ fontSize: '0.7rem' }}>{item.icon}</span>
                            <span style={{
                                fontSize: '0.62rem',
                                fontWeight: item.type === 'lider' ? 900 : 600,
                                color: itemColor(item.type),
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