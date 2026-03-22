import React, { useState, useEffect, useRef } from 'react';
import { db } from './firebase';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';

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

const MetroTicker: React.FC = () => {
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
                // Activa = tiene al menos 1 partido programado o finalizado
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

                        // ── Tabla de posiciones desde los resultados ──
                        const regularFin = docs.filter((p: any) => {
                            const fase = (p.fase || '').trim().toUpperCase();
                            return p.estatus === 'finalizado' && (fase === 'REGULAR' || fase === '');
                        });

                        if (regularFin.length > 0) {
                            // Acumular puntos por equipo
                            const tabla: Record<string, { nombre: string; pts: number; v: number; d: number }> = {};
                            regularFin.forEach((p: any) => {
                                const l = p.equipoLocalNombre?.trim();
                                const v = p.equipoVisitanteNombre?.trim();
                                if (!l || !v) return;
                                if (!tabla[l]) tabla[l] = { nombre: l, pts: 0, v: 0, d: 0 };
                                if (!tabla[v]) tabla[v] = { nombre: v, pts: 0, v: 0, d: 0 };
                                if ((p.marcadorLocal ?? 0) > (p.marcadorVisitante ?? 0)) {
                                    tabla[l].pts += 2; tabla[l].v++;
                                    tabla[v].pts += 1; tabla[v].d++;
                                } else {
                                    tabla[v].pts += 2; tabla[v].v++;
                                    tabla[l].pts += 1; tabla[l].d++;
                                }
                            });

                            const sorted = Object.values(tabla)
                                .sort((a, b) => b.pts - a.pts)
                                .slice(0, 5);

                            if (sorted.length > 0) {
                                const posStr = sorted
                                    .map((e, i) => `${i + 1}.${e.nombre.split(' ')[0]} (${e.pts}pts)`)
                                    .join(' · ');
                                result.push({
                                    type: 'tabla', icon: '🏆',
                                    text: `[${catLabel}] TABLA: ${posStr}`,
                                });
                            }
                        }

                        // ── Líderes en 4 estadísticas ──
                        if (finalizados.length > 0) {
                            const validIds = new Set(finalizados.map((p: any) => p.id));
                            const statsSnap = await getDocs(
                                query(collection(db, 'stats_partido'), limit(500))
                            );
                            const agg: Record<string, any> = {};
                            statsSnap.docs.forEach(d => {
                                const s = d.data();
                                if (!validIds.has(s.partidoId) || !s.jugadorId) return;
                                const id = s.jugadorId;
                                if (!agg[id]) agg[id] = { nombre: s.nombre, pj: 0, pts: 0, reb: 0, rob: 0, tri: 0 };
                                agg[id].pj++;
                                agg[id].pts += (Number(s.tirosLibres) || 0) + (Number(s.dobles) || 0) * 2 + (Number(s.triples) || 0) * 3;
                                agg[id].reb += (Number(s.rebotes)  || 0);
                                agg[id].rob += (Number(s.robos)    || 0);
                                agg[id].tri += (Number(s.triples)  || 0);
                            });

                            const players = Object.values(agg).filter((p: any) => p.pj > 0);
                            if (players.length > 0) {
                                const top = (key: string) =>
                                    [...players].sort((a: any, b: any) => (b[key] / b.pj) - (a[key] / a.pj))[0] as any;

                                const lideres = [
                                    { key: 'pts', label: 'PTS', icon: '🔥' },
                                    { key: 'reb', label: 'REB', icon: '🖐' },
                                    { key: 'rob', label: 'ROB', icon: '🛡' },
                                    { key: 'tri', label: '3PT', icon: '🏹' },
                                ];
                                lideres.forEach(({ key, label, icon }) => {
                                    const lider = top(key);
                                    if (lider?.nombre && lider[key] > 0) {
                                        result.push({
                                            type: 'lider', icon,
                                            text: `[${catLabel}] LÍDER ${label}: ${lider.nombre} · ${(lider[key] / lider.pj).toFixed(1)} ${label}/PJ`,
                                        });
                                    }
                                });
                            }
                        }

                    } catch { /* error en esta categoría, continuar */ }
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

    const allItems = [...items, ...items];

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