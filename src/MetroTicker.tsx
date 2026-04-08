import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

const getColName = (base: string, cat: string) =>
    cat === 'MASTER40' ? base : `${base}_${cat}`;

const TODAS_CATS  = ['LIBRE', 'INTERINDUSTRIAL', 'U16_FEMENINO', 'U16M', 'MASTER40'];
const LIGA_LOGO   = 'https://i.postimg.cc/FKgNmFpv/Whats_App_Image_2026_01_25_at_12_07_36_AM.jpg';
const SPEED       = 0.6; // px por frame

interface TickerItem {
    type: 'noticia' | 'lider' | 'resultado' | 'proximo' | 'tabla';
    text: string;
    icon: string;
}

const itemColor = (type: TickerItem['type']) => {
    switch (type) {
        case 'noticia':   return '#60a5fa';
        case 'resultado': return '#34d399';
        case 'proximo':   return '#a78bfa';
        case 'tabla':     return '#fbbf24';
        case 'lider':     return '#fb923c';
    }
};

interface LiderTicker {
    label: string;
    icon: string;
    color: string;
    val: number;
    unit: string;
    p: { nombre: string; equipo: string };
    categoria: string;
}

const MetroTicker: React.FC<{ lideres?: LiderTicker[] }> = ({ lideres = [] }) => {
    const [items, setItems]   = useState<TickerItem[]>([]);
    const [loaded, setLoaded] = useState(false);

    const wrapRef  = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const posRef   = useRef(0);
    const rafRef   = useRef(0);
    const pauseRef = useRef(false);

    useEffect(() => {
        const load = async () => {
            const result: TickerItem[] = [];
            const today = new Date().toISOString().split('T')[0];

            try {
                // ── 1. Últimas 3 noticias ──
                try {
                    const snap = await getDocs(
                        query(collection(db, 'noticias'), orderBy('fecha', 'desc'), limit(3))
                    );
                    snap.forEach(d =>
                        result.push({ type: 'noticia', icon: '📢', text: d.data().titulo })
                    );
                } catch { /* sin noticias */ }

                // ── 2. Detectar categorías activas ──
                const categoriasActivas: string[] = [];
                for (const cat of TODAS_CATS) {
                    const col = getColName('calendario', cat);
                    try {
                        const snap = await getDocs(
                            query(collection(db, col), limit(1))
                        );
                        if (!snap.empty) categoriasActivas.push(cat);
                    } catch { /* col no existe */ }
                }

                // ── 3. Por cada categoría activa: resultados, próximos, tabla, líder ──
                for (const cat of categoriasActivas) {
                    const col      = getColName('calendario', cat);
                    const catLabel = cat === 'MASTER40' ? 'MASTER' : cat.replace('_', ' ');

                    try {
                        const allSnap = await getDocs(
                            query(collection(db, col), orderBy('fechaAsignada', 'desc'), limit(60))
                        );
                        const docs = allSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

                        // ── Últimos 4 resultados ──
                        const finalizados = docs
                            .filter((p: any) => p.estatus === 'finalizado')
                            .slice(0, 4);

                        finalizados.forEach((p: any) => {
                            const localGana = (p.marcadorLocal ?? 0) > (p.marcadorVisitante ?? 0);
                            result.push({
                                type: 'resultado', icon: '🏀',
                                text: `[${catLabel}] ${p.equipoLocalNombre} ${p.marcadorLocal ?? 0} - ${p.marcadorVisitante ?? 0} ${p.equipoVisitanteNombre}${localGana ? ' 🏆' : ''}`,
                            });
                        });

                        // ── Próximos juegos ──
                        const proximos = docs
                            .filter((p: any) => p.estatus === 'programado' && (p.fechaAsignada || '') >= today)
                            .sort((a: any, b: any) => (a.fechaAsignada || '').localeCompare(b.fechaAsignada || ''))
                            .slice(0, 3);

                        proximos.forEach((p: any) => {
                            result.push({
                                type: 'proximo', icon: '📅',
                                text: `[${catLabel}] PRÓXIMO: ${p.equipoLocalNombre} vs ${p.equipoVisitanteNombre} · ${p.fechaAsignada}${p.hora ? ' ' + p.hora : ''}`,
                            });
                        });

                        // ── Tabla de posiciones SEPARADA POR GRUPOS/CONFERENCIAS ──
                        const regularFin = docs.filter((p: any) => {
                            const fase = (p.fase || '').trim().toUpperCase();
                            return p.estatus === 'finalizado' && (fase === 'REGULAR' || fase === '');
                        });

                        if (regularFin.length > 0) {
                            // Obtener los equipos para saber a qué grupo pertenecen
                            const eqCol = getColName('equipos', cat);
                            const eqSnap = await getDocs(collection(db, eqCol));
                            const eqMap: Record<string, { nombre: string; grupo: string; pts: number }> = {};

                            eqSnap.forEach(d => {
                                const data = d.data();
                                if (data.nombre) {
                                    eqMap[data.nombre.trim().toUpperCase()] = {
                                        nombre: data.nombre.trim(),
                                        grupo: (data.grupo || 'A').toUpperCase(),
                                        pts: 0
                                    };
                                }
                            });

                            // Acumular puntos (Aplicando regla FIBA del Forfait = 0pts)
                            regularFin.forEach((p: any) => {
                                const l = p.equipoLocalNombre?.trim().toUpperCase();
                                const v = p.equipoVisitanteNombre?.trim().toUpperCase();
                                if (!l || !v) return;

                                // Si por error el equipo no existe, lo creamos en grupo A temporal
                                if (!eqMap[l]) eqMap[l] = { nombre: p.equipoLocalNombre.trim(), grupo: 'A', pts: 0 };
                                if (!eqMap[v]) eqMap[v] = { nombre: p.equipoVisitanteNombre.trim(), grupo: 'A', pts: 0 };

                                const ml = p.marcadorLocal ?? 0;
                                const mv = p.marcadorVisitante ?? 0;

                                if (ml > mv) {
                                    eqMap[l].pts += 2;
                                    eqMap[v].pts += p.esForfait ? 0 : 1; // Castigo Forfait
                                } else if (ml < mv) {
                                    eqMap[v].pts += 2;
                                    eqMap[l].pts += p.esForfait ? 0 : 1; // Castigo Forfait
                                }
                            });

                            // Separar por Conferencias / Grupos
                            const grupos: Record<string, any[]> = {};
                            Object.values(eqMap).forEach(eq => {
                                if (!grupos[eq.grupo]) grupos[eq.grupo] = [];
                                grupos[eq.grupo].push(eq);
                            });

                            // Armar el texto del Ticker por cada Conferencia
                            Object.entries(grupos).forEach(([grupoCode, equipos]) => {
                                const sorted = equipos.sort((a, b) => b.pts - a.pts).slice(0, 4); // Top 4 por conferencia

                                // Solo mostramos si hay puntos en la conferencia
                                if (sorted.some(e => e.pts > 0)) {
                                    const posStr = sorted
                                        .map((e, i) => `${i + 1}.${e.nombre.split(' ')[0]} (${e.pts}p)`)
                                        .join(' · ');

                                    let label = `GRUPO ${grupoCode}`;
                                    if (cat === 'LIBRE') {
                                        label = grupoCode === 'A' ? 'CONF. ESTE' : 'CONF. OESTE';
                                    } else if (grupoCode === 'ÚNICO' || Object.keys(grupos).length === 1) {
                                        label = 'GENERAL';
                                    }

                                    result.push({
                                        type: 'tabla', icon: '🏆',
                                        text: `[${catLabel}] TABLA ${label}: ${posStr}`,
                                    });
                                }
                            });
                        }

                    } catch { /* error en esta categoría, continuar con la siguiente */ }
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
        const iv = setInterval(load, 5 * 60 * 1000); // Recarga cada 5 min
        return () => clearInterval(iv);
    }, []);

    // ── Animación RAF ──
    useEffect(() => {
        if (!loaded || items.length === 0) return;

        const tid = setTimeout(() => {
            const track = trackRef.current;
            if (!track) return;
            const halfW = track.scrollWidth / 2;
            posRef.current = 0;

            const step = () => {
                if (!pauseRef.current) {
                    posRef.current += SPEED;
                    if (posRef.current >= halfW) posRef.current -= halfW;
                    if (track) track.style.transform = `translateX(-${posRef.current}px)`;
                }
                rafRef.current = requestAnimationFrame(step);
            };
            rafRef.current = requestAnimationFrame(step);
        }, 100);

        return () => { clearTimeout(tid); cancelAnimationFrame(rafRef.current); };
    }, [loaded, items]);

    if (!loaded) return null;

    // Líderes recibidos desde App.tsx
    const liderItems: TickerItem[] = lideres.map(l => ({
        type: 'lider' as const,
        icon: l.icon,
        text: `[${l.categoria}] LÍDER ${l.label}: ${l.p.nombre} · ${l.val} ${l.unit}`,
    }));

    const combined = [...items, ...liderItems];
    const allItems = [...combined, ...combined]; // Duplicado para loop infinito

    return (
        <div style={{
            width: '100%',
            background: 'linear-gradient(90deg, #020c1b 0%, #0d1f4a 50%, #020c1b 100%)',
            borderBottom: '2px solid #f97316',
            display: 'flex', alignItems: 'center',
            height: 36, overflow: 'hidden', zIndex: 1,
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
                <div ref={trackRef} style={{ display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', willChange: 'transform' }}>
                    {allItems.map((item, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, paddingRight: 36 }}>
                            <span style={{ color: '#f97316', fontSize: '0.6rem', marginRight: 4, opacity: 0.4 }}>◆</span>
                            <span style={{ fontSize: '0.7rem' }}>{item.icon}</span>
                            <span style={{
                                fontSize: '0.62rem', fontWeight: 700,
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