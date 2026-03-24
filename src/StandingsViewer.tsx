import React, { useMemo, memo, useState, useCallback } from 'react';

interface Equipo {
    id: string;
    nombre: string;
    grupo: string;
    victorias: number;
    derrotas: number;
    puntos: number;
    puntos_favor: number;
    puntos_contra: number;
    logoUrl?: string;
}

interface Partido {
    equipoLocalId: string;
    equipoVisitanteId: string;
    marcadorLocal: number;
    marcadorVisitante: number;
    estatus: string;
    fase?: string;
    fechaAsignada?: string;
}

interface EquipoConStats extends Equipo {
    jj: number;
    dif: number;
    forma: ('G' | 'P')[];
    playoffZone: boolean;
}

interface Props {
    equipos?: Equipo[];
    partidos?: Partido[];
    onClose: () => void;
    categoria: string;
}

const DEFAULT_LOGO = 'https://cdn-icons-png.flaticon.com/512/166/166344.png';

const calcForma = (equipoId: string, partidos: Partido[], n = 5): ('G' | 'P')[] => {
    const finalizados = partidos
        .filter(p => {
            const fase = (p.fase ?? '').trim().toUpperCase();
            return p.estatus === 'finalizado' && (fase === 'REGULAR' || fase === '')
                && (p.equipoLocalId === equipoId || p.equipoVisitanteId === equipoId);
        })
        .sort((a, b) => (a.fechaAsignada || '').localeCompare(b.fechaAsignada || ''));
    return finalizados.slice(-n).map(p => {
        const esLocal = p.equipoLocalId === equipoId;
        const mio  = esLocal ? p.marcadorLocal    : p.marcadorVisitante;
        const suyo = esLocal ? p.marcadorVisitante : p.marcadorLocal;
        return mio > suyo ? 'G' : 'P';
    });
};

const esPartidoRegular = (p: Partido) => {
    const fase = (p.fase ?? '').trim().toUpperCase();
    return p.estatus === 'finalizado' && (fase === 'REGULAR' || fase === '');
};

const calcStats = (equipoId: string, partidos: Partido[]) => {
    let pts = 0, pf = 0, pc = 0;
    for (const p of partidos) {
        const esLocal = p.equipoLocalId === equipoId;
        const esVisitante = p.equipoVisitanteId === equipoId;
        if (!esLocal && !esVisitante) continue;
        const miMarcador = esLocal ? p.marcadorLocal : p.marcadorVisitante;
        const suMarcador = esLocal ? p.marcadorVisitante : p.marcadorLocal;
        pf += miMarcador;
        pc += suMarcador;
        pts += miMarcador > suMarcador ? 2 : miMarcador < suMarcador ? 1 : 0;
    }
    return { pts, pf, pc, dif: pf - pc };
};

const resolverEmpate = (empatados: EquipoConStats[], partidosRegular: Partido[]): EquipoConStats[] => {
    if (empatados.length <= 1) return empatados;
    const ids = empatados.map(e => e.id);
    const h2h = partidosRegular.filter(p => ids.includes(p.equipoLocalId) && ids.includes(p.equipoVisitanteId));
    const statsH2H = Object.fromEntries(empatados.map(e => [e.id, calcStats(e.id, h2h)]));
    const comparar = (a: EquipoConStats, b: EquipoConStats): number => {
        const ha = statsH2H[a.id];
        const hb = statsH2H[b.id];
        if (hb.pts !== ha.pts) return hb.pts - ha.pts;
        if (hb.dif !== ha.dif) return hb.dif - ha.dif;
        if (hb.pf !== ha.pf) return hb.pf - ha.pf;
        if (b.dif !== a.dif) return b.dif - a.dif;
        if (b.puntos_favor !== a.puntos_favor) return b.puntos_favor - a.puntos_favor;
        return 0;
    };
    const ordenados = [...empatados].sort(comparar);
    const resultado: EquipoConStats[] = [];
    let i = 0;
    while (i < ordenados.length) {
        let j = i + 1;
        while (j < ordenados.length && comparar(ordenados[i], ordenados[j]) === 0) j++;
        const subgrupo = ordenados.slice(i, j);
        if (subgrupo.length > 1 && subgrupo.length < empatados.length) {
            resultado.push(...resolverEmpate(subgrupo, partidosRegular));
        } else {
            resultado.push(...subgrupo);
        }
        i = j;
    }
    return resultado;
};

const sortFIBA = (equipos: EquipoConStats[], partidosRegular: Partido[]): EquipoConStats[] => {
    const porPuntos = [...equipos].sort((a, b) => b.puntos - a.puntos);
    const resultado: EquipoConStats[] = [];
    let i = 0;
    while (i < porPuntos.length) {
        let j = i + 1;
        while (j < porPuntos.length && porPuntos[j].puntos === porPuntos[i].puntos) j++;
        resultado.push(...resolverEmpate(porPuntos.slice(i, j), partidosRegular));
        i = j;
    }
    return resultado;
};

const TeamRow = memo(({ eq, index, color }: { eq: EquipoConStats; index: number; color: string }) => {
    const [imgError, setImgError] = React.useState(false);
    const esLider = index === 0;

    return (
        <tr style={{
            borderBottom: '1px solid #f1f5f9',
            background: esLider ? `${color}08` : 'transparent',
            transition: 'background 0.15s',
            borderLeft: eq.playoffZone ? `3px solid ${color}` : '3px solid transparent',
        }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
            onMouseLeave={e => (e.currentTarget.style.background = esLider ? `${color}08` : 'transparent')}
        >
            <td style={{ padding: '12px 6px 12px 8px', textAlign: 'center', width: 44 }}>
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: eq.playoffZone ? color : '#f1f5f9',
                        color: eq.playoffZone ? 'white' : '#94a3b8',
                        fontSize: '0.7rem', fontWeight: 900,
                        boxShadow: eq.playoffZone ? `0 2px 8px ${color}55` : 'none',
                    }}>
                        {index + 1}
                    </div>
                    {eq.playoffZone && (
                        <div style={{
                            position: 'absolute', bottom: -1, right: -3,
                            width: 8, height: 8, borderRadius: '50%',
                            background: '#10b981', border: '1.5px solid white',
                        }} />
                    )}
                </div>
            </td>

            <td style={{ padding: '10px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        border: eq.playoffZone ? `2px solid ${color}` : '1.5px solid #e2e8f0',
                        overflow: 'hidden', background: 'white',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0,
                    }}>
                        <img
                            src={imgError ? DEFAULT_LOGO : (eq.logoUrl || DEFAULT_LOGO)}
                            alt={eq.nombre}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={() => setImgError(true)}
                        />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.75rem', whiteSpace: 'nowrap', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80 }}>
                            {eq.nombre.toUpperCase()}
                        </span>
                        {eq.playoffZone && (
                            <span style={{ fontSize: '0.48rem', fontWeight: 900, color: '#10b981', letterSpacing: '0.5px' }}>
                                ✓ PLAYOFF
                            </span>
                        )}
                    </div>
                </div>
            </td>

            <td style={tdStyle}><span style={statStyle('#64748b')}>{eq.jj}</span></td>
            <td style={tdStyle}><span style={statStyle('#10b981')}>{eq.victorias}</span></td>
            <td style={tdStyle}><span style={statStyle('#ef4444')}>{eq.derrotas}</span></td>
            <td style={tdStyle}>
                <span style={statStyle(eq.dif >= 0 ? '#3b82f6' : '#ef4444')}>
                    {eq.dif > 0 ? `+${eq.dif}` : eq.dif}
                </span>
            </td>
            <td style={{ ...tdStyle }}>
                <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                    {eq.forma.length === 0 ? (
                        <span style={{ fontSize: '0.6rem', color: '#cbd5e1' }}>—</span>
                    ) : (
                        eq.forma.map((r, i) => (
                            <div key={i} style={{
                                width: 13, height: 13, borderRadius: 3,
                                background: r === 'G' ? '#10b981' : '#ef4444',
                                color: 'white', fontSize: '0.42rem', fontWeight: 900,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                {r}
                            </div>
                        ))
                    )}
                </div>
            </td>
            <td style={{ ...tdStyle, background: `${color}0d` }}>
                <span style={{ fontSize: '1rem', fontWeight: 900, color }}>{eq.puntos}</span>
            </td>
        </tr>
    );
});

const tdStyle: React.CSSProperties = { padding: '12px 8px', textAlign: 'center' };
const statStyle = (color: string): React.CSSProperties => ({ fontWeight: 700, color, fontSize: '0.82rem' });

const GroupTable = memo(({ teams, groupName, color }: { teams: EquipoConStats[]; groupName: string; color: string }) => {
    if (teams.length === 0) return null;
    return (
        <div style={{
            background: 'white', borderRadius: 24,
            boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
            marginBottom: 28, overflow: 'hidden',
            border: `1.5px solid ${color}30`,
        }}>
            <div style={{
                background: color, color: 'white',
                padding: '14px 20px', fontWeight: 900,
                textTransform: 'uppercase', letterSpacing: '1.5px',
                fontSize: '0.9rem', display: 'flex',
                alignItems: 'center', gap: 10,
            }}>
                <span>🏀</span>
                <span>{groupName}</span>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                <thead>
                    <tr style={{ background: '#f8fafc', color: '#94a3b8', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        <th style={{ padding: '10px', width: 44 }}>#</th>
                        <th style={{ padding: '10px', textAlign: 'left' }}>Equipo</th>
                        <th style={{ padding: '10px' }}>JJ</th>
                        <th style={{ padding: '10px' }}>JG</th>
                        <th style={{ padding: '10px' }}>JP</th>
                        <th style={{ padding: '10px' }}>DIF</th>
                        <th style={{ padding: '10px' }}>FORMA</th>
                        <th style={{ padding: '10px', background: `${color}15`, color, fontWeight: 900 }}>PTS</th>
                    </tr>
                </thead>
                <tbody>
                    {teams.map((eq, i) => (
                        <TeamRow key={eq.id} eq={eq} index={i} color={color} />
                    ))}
                </tbody>
            </table>

            <div style={{
                padding: '8px 16px', background: '#f8fafc',
                borderTop: '1px solid #f1f5f9',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: 8, flexWrap: 'wrap',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                    <span style={{ fontSize: '0.52rem', color: '#10b981', fontWeight: 700 }}>Clasifica playoff</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 13, height: 13, borderRadius: 3, background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: 'white', fontSize: '0.45rem', fontWeight: 900 }}>G</span>
                    </div>
                    <div style={{ width: 13, height: 13, borderRadius: 3, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ color: 'white', fontSize: '0.45rem', fontWeight: 900 }}>P</span>
                    </div>
                    <span style={{ fontSize: '0.52rem', color: '#94a3b8' }}>Últimos 5</span>
                </div>
            </div>
        </div>
    );
});

const StandingsViewer: React.FC<Props> = ({ equipos = [], partidos = [], onClose, categoria }) => {

    const partidosRegular = useMemo(() => partidos.filter(esPartidoRegular), [partidos]);

    const equiposConStats = useMemo<EquipoConStats[]>(() => {
        return equipos.map(eq => {
            let victorias = 0, derrotas = 0, puntos = 0, pf = 0, pc = 0;
            for (const p of partidosRegular) {
                const esLocal = p.equipoLocalId === eq.id;
                const esVisitante = p.equipoVisitanteId === eq.id;
                if (!esLocal && !esVisitante) continue;
                const miMarcador = esLocal ? p.marcadorLocal : p.marcadorVisitante;
                const suMarcador = esLocal ? p.marcadorVisitante : p.marcadorLocal;
                pf += miMarcador;
                pc += suMarcador;
                if (miMarcador > suMarcador) { victorias++; puntos += 2; }
                else if (miMarcador < suMarcador) { derrotas++; puntos += 1; }
            }
            return {
                ...eq, victorias, derrotas, puntos, puntos_favor: pf, puntos_contra: pc,
                jj: victorias + derrotas, dif: pf - pc,
                forma: calcForma(eq.id, partidos),
                playoffZone: false,
            };
        });
    }, [equipos, partidosRegular]);

    const PLAYOFF_SPOTS = 4;

    const grupoA = useMemo(() => {
        const eq = equiposConStats.filter(e => e.grupo?.toUpperCase() === 'A' || e.grupo?.toUpperCase() === 'ÚNICO');
        return sortFIBA(eq, partidosRegular).map((e, i) => ({ ...e, playoffZone: i < PLAYOFF_SPOTS }));
    }, [equiposConStats, partidosRegular]);

    const grupoB = useMemo(() => {
        const eq = equiposConStats.filter(e => e.grupo?.toUpperCase() === 'B');
        return sortFIBA(eq, partidosRegular).map((e, i) => ({ ...e, playoffZone: i < PLAYOFF_SPOTS }));
    }, [equiposConStats, partidosRegular]);

    const getGroupLabel = (groupCode: 'A' | 'B') => {
        const cat = (categoria ?? '').trim().toUpperCase();
        if (cat === 'LIBRE') return groupCode === 'A' ? 'CONFERENCIA ESTE' : 'CONFERENCIA OESTE';
        if (grupoA.some(e => e.grupo?.toUpperCase() === 'ÚNICO')) return 'TABLA GENERAL';
        return `GRUPO ${groupCode}`;
    };

    const [sharing, setSharing] = useState(false);

    const compartirTabla = useCallback(async () => {
        setSharing(true);
        try {
            const LIGA_LOGO = 'https://i.postimg.cc/FKgNmFpv/Whats_App_Image_2026_01_25_at_12_07_36_AM.jpg';
            const allTeams = [...grupoA, ...grupoB];
            const W = 700;
            const ROW_H = 52;
            const HEADER_H = 110;
            const GROUP_LABEL_H = 36;
            const FOOTER_H = 36;
            const grupos = [
                grupoA.length > 0 ? { teams: grupoA, label: getGroupLabel('A'), color: '#1e3a8a' } : null,
                grupoB.length > 0 ? { teams: grupoB, label: getGroupLabel('B'), color: '#d97706' } : null,
            ].filter(Boolean) as { teams: EquipoConStats[]; label: string; color: string }[];

            const totalRows = allTeams.length;
            const H = HEADER_H + grupos.length * (GROUP_LABEL_H + 28) + totalRows * ROW_H + FOOTER_H + 40;

            const canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            const ctx = canvas.getContext('2d')!;

            // Fondo
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(0, 0, W, H);

            // Helper cargar imagen — con timeout de 3s para no bloquearse
            const loadImg = (url: string): Promise<HTMLImageElement | null> =>
                new Promise(resolve => {
                    if (!url) { resolve(null); return; }
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    const timer = setTimeout(() => resolve(null), 3000);
                    img.onload  = () => { clearTimeout(timer); resolve(img); };
                    img.onerror = () => { clearTimeout(timer); resolve(null); };
                    img.src = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
                });

            // Header
            const grad = ctx.createLinearGradient(0, 0, W, 0);
            grad.addColorStop(0, '#1e3a8a');
            grad.addColorStop(1, '#1d4ed8');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, W, HEADER_H);

            // Logo grande en esquina izquierda
            const ligaImg = await loadImg(LIGA_LOGO);
            const logoR = 40;
            const logoX = 20 + logoR;
            const logoY = HEADER_H / 2;
            if (ligaImg) {
                ctx.save();
                ctx.beginPath(); ctx.arc(logoX, logoY, logoR, 0, Math.PI * 2);
                ctx.fillStyle = 'white'; ctx.fill(); ctx.clip();
                ctx.drawImage(ligaImg, logoX - logoR, logoY - logoR, logoR * 2, logoR * 2);
                ctx.restore();
                ctx.beginPath(); ctx.arc(logoX, logoY, logoR, 0, Math.PI * 2);
                ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2.5; ctx.stroke();
            }

            // Títulos a la derecha del logo
            const textX = logoX + logoR + 20;
            ctx.textAlign = 'left';
            ctx.font = 'bold 22px system-ui'; ctx.fillStyle = 'white';
            ctx.fillText('TABLA DE POSICIONES', textX, logoY - 10);
            ctx.font = 'bold 13px system-ui'; ctx.fillStyle = '#fbbf24';
            ctx.fillText('LIGA METROPOLITANA EJE ESTE', textX, logoY + 14);
            ctx.font = '11px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fillText(`${categoria.toUpperCase()}  ·  Fase Regular`, textX, logoY + 34);

            // Precargar todos los logos en paralelo (mucho más rápido)
            const allLogoUrls = [...new Set(
                grupos.flatMap(g => g.teams.map(t => t.logoUrl).filter(Boolean) as string[])
            )];
            const logoCache: Record<string, HTMLImageElement | null> = {};
            await Promise.all(allLogoUrls.map(async url => {
                logoCache[url] = await loadImg(url);
            }));

            let y = HEADER_H + 10;

            for (const grupo of grupos) {
                // Header del grupo
                ctx.fillStyle = grupo.color;
                ctx.fillRect(16, y, W - 32, GROUP_LABEL_H);
                ctx.font = 'bold 13px system-ui'; ctx.fillStyle = 'white'; ctx.textAlign = 'left';
                ctx.fillText(`🏀  ${grupo.label}`, 28, y + 23);
                y += GROUP_LABEL_H;

                // Cabecera columnas
                ctx.fillStyle = '#f1f5f9';
                ctx.fillRect(16, y, W - 32, 28);
                ctx.font = 'bold 10px system-ui'; ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center';
                const cols = [
                    { label: '#',     x: 40  },
                    { label: 'EQUIPO', x: 160, align: 'left' as const },
                    { label: 'JJ',    x: 330 },
                    { label: 'JG',    x: 390 },
                    { label: 'JP',    x: 445 },
                    { label: 'DIF',   x: 510 },
                    { label: 'PTS',   x: 580 },
                ];
                cols.forEach(col => {
                    ctx.textAlign = col.align || 'center';
                    ctx.fillText(col.label, col.x, y + 19);
                });
                y += 28;

                // Filas de equipos
                for (let i = 0; i < grupo.teams.length; i++) {
                    const eq = grupo.teams[i];
                    const rowY = y;
                    const isEven = i % 2 === 0;

                    // Fondo fila
                    ctx.fillStyle = eq.playoffZone
                        ? `${grupo.color}10`
                        : isEven ? '#ffffff' : '#f8fafc';
                    ctx.fillRect(16, rowY, W - 32, ROW_H);

                    // Borde izquierdo playoff
                    if (eq.playoffZone) {
                        ctx.fillStyle = grupo.color;
                        ctx.fillRect(16, rowY, 3, ROW_H);
                    }

                    const cy = rowY + ROW_H / 2;

                    // Posición
                    ctx.beginPath(); ctx.arc(40, cy, 13, 0, Math.PI * 2);
                    ctx.fillStyle = eq.playoffZone ? grupo.color : '#f1f5f9';
                    ctx.fill();
                    ctx.font = 'bold 11px system-ui';
                    ctx.fillStyle = eq.playoffZone ? 'white' : '#94a3b8';
                    ctx.textAlign = 'center';
                    ctx.fillText(String(i + 1), 40, cy + 4);

                    // Logo equipo
                    const logoImg = eq.logoUrl ? (logoCache[eq.logoUrl] ?? null) : null;
                    ctx.save();
                    ctx.beginPath(); ctx.arc(85, cy, 16, 0, Math.PI * 2);
                    if (logoImg) {
                        ctx.fillStyle = 'white'; ctx.fill(); ctx.clip();
                        ctx.drawImage(logoImg, 85 - 16, cy - 16, 32, 32);
                    } else {
                        ctx.fillStyle = '#e2e8f0'; ctx.fill();
                    }
                    ctx.restore();

                    // Nombre
                    ctx.font = 'bold 12px system-ui';
                    ctx.fillStyle = '#1e293b';
                    ctx.textAlign = 'left';
                    let nombre = eq.nombre.toUpperCase();
                    while (nombre.length > 1 && ctx.measureText(nombre).width > 200) nombre = nombre.slice(0, -1);
                    if (nombre.length < eq.nombre.length) nombre += '…';
                    ctx.fillText(nombre, 108, cy - 4);

                    // Playoff badge
                    if (eq.playoffZone) {
                        ctx.font = 'bold 8px system-ui'; ctx.fillStyle = '#10b981';
                        ctx.fillText('✓ PLAYOFF', 108, cy + 10);
                    }

                    // Stats
                    const dif = eq.dif > 0 ? `+${eq.dif}` : String(eq.dif);
                    const stats = [
                        { val: String(eq.jj),         x: 330, color: '#64748b' },
                        { val: String(eq.victorias),  x: 390, color: '#10b981' },
                        { val: String(eq.derrotas),   x: 445, color: '#ef4444' },
                        { val: dif,                   x: 510, color: eq.dif >= 0 ? '#3b82f6' : '#ef4444' },
                        { val: String(eq.puntos),     x: 580, color: grupo.color },
                    ];
                    stats.forEach(s => {
                        ctx.font = s.val === String(eq.puntos) ? 'bold 15px system-ui' : 'bold 13px system-ui';
                        ctx.fillStyle = s.color;
                        ctx.textAlign = 'center';
                        ctx.fillText(s.val, s.x, cy + 5);
                    });

                    // Forma
                    const formaX = 620;
                    eq.forma.slice(-5).forEach((r, fi) => {
                        ctx.beginPath();
                        ctx.arc(formaX + fi * 13, cy, 5, 0, Math.PI * 2);
                        ctx.fillStyle = r === 'G' ? '#10b981' : '#ef4444';
                        ctx.fill();
                    });

                    // Separador
                    ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(16, rowY + ROW_H); ctx.lineTo(W - 16, rowY + ROW_H); ctx.stroke();

                    y += ROW_H;
                }
                y += 12;
            }

            // Footer
            ctx.fillStyle = 'rgba(0,0,0,0.08)';
            ctx.fillRect(0, H - FOOTER_H, W, FOOTER_H);
            ctx.font = '11px system-ui'; ctx.fillStyle = '#94a3b8'; ctx.textAlign = 'center';
            ctx.fillText('Liga Metropolitana Eje Este  ·  San Mateo, Aragua', W / 2, H - 12);

            // Compartir / descargar
            canvas.toBlob(async blob => {
                if (!blob) return;
                const file = new File([blob], `tabla_${categoria}.png`, { type: 'image/png' });
                try {
                    if (navigator.canShare?.({ files: [file] })) {
                        await navigator.share({ files: [file], title: `Tabla ${categoria} · Liga Metropolitana` });
                    } else {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = `tabla_${categoria}.png`; a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 2000);
                    }
                } catch { /* share cancelado */ }
                setSharing(false);
            }, 'image/png');
        } catch (e) { console.error(e); setSharing(false); }
    }, [grupoA, grupoB, categoria, getGroupLabel]);

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 100, fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

            {/* Header simple — sin gradiente */}
            <div style={{ background: '#fff', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb' }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>
                    🏆 Tablas {categoria}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                        onClick={compartirTabla}
                        disabled={sharing}
                        style={{ background: sharing ? '#94a3b8' : '#1e3a8a', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, fontSize: '0.72rem', cursor: sharing ? 'not-allowed' : 'pointer' }}
                    >
                        {sharing ? '⏳...' : '📤 COMPARTIR'}
                    </button>
                    <button onClick={onClose} style={{ background: 'none', color: '#3b82f6', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>
                        ← VOLVER
                    </button>
                </div>
            </div>

            <div style={{ maxWidth: 860, margin: '0 auto', padding: '16px 16px 0' }}>
                {equiposConStats.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: 60, fontSize: '0.9rem' }}>
                        Cargando equipos...
                    </div>
                ) : (
                    <>
                        {grupoA.length > 0 && <GroupTable teams={grupoA} groupName={getGroupLabel('A')} color="#1e3a8a" />}
                        {grupoB.length > 0 && <GroupTable teams={grupoB} groupName={getGroupLabel('B')} color="#d97706" />}
                    </>
                )}
            </div>
        </div>
    );
};

export default StandingsViewer;