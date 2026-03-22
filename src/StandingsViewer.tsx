import React, { useMemo, memo } from 'react';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
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
    forma: ('G' | 'P')[];   // últimos 5 resultados, más reciente al final
    playoffZone: boolean;   // clasifica a playoff
}

interface Props {
    equipos?: Equipo[];
    partidos?: Partido[];
    onClose: () => void;
    categoria: string;
}

const DEFAULT_LOGO = 'https://cdn-icons-png.flaticon.com/512/166/166344.png';

// ─────────────────────────────────────────────
// HELPERS FIBA APPENDIX D (2024)
//
// D.1.1 - Clasificación por puntos (2 victoria, 1 derrota, 0 no presentación)
// D.1.3 - Empate: se analizan SOLO los partidos entre los implicados
//   Criterio 1: Mayor récord V/D entre ellos (= más puntos H2H)
//   Criterio 2: Mayor diferencia de puntos en partidos entre ellos
//   Criterio 3: Mayor número de puntos anotados en partidos entre ellos
//   Criterio 4: Mayor diferencia de puntos en TODOS los partidos del grupo
//   Criterio 5: Mayor número de puntos anotados en TODOS los partidos del grupo
//   Criterio 6: Sorteo (aquí dejamos el orden actual como fallback)
//
// IMPORTANTE: Si tras aplicar un criterio el grupo de N empatados se reduce
// a un sub-empate de M < N, se reinicia el proceso DESDE el criterio 1
// solo para ese subgrupo. Esta implementación aplica eso correctamente
// mediante ordenación estable iterativa.
// ─────────────────────────────────────────────

/** Calcula los últimos N resultados de un equipo */
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

/** Filtra partidos de fase regular finalizados */
const esPartidoRegular = (p: Partido) => {
    const fase = (p.fase ?? '').trim().toUpperCase();
    return p.estatus === 'finalizado' && (fase === 'REGULAR' || fase === '');
};

/** Estadísticas de un equipo en un subconjunto de partidos */
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

/**
 * Ordena un grupo de equipos empatados en puntos usando los criterios
 * del Apéndice D.1.3 FIBA 2024. Aplica reinicio de criterios si el
 * sub-grupo de empatados se reduce.
 */
const resolverEmpate = (empatados: EquipoConStats[], partidosRegular: Partido[]): EquipoConStats[] => {
    if (empatados.length <= 1) return empatados;

    const ids = empatados.map(e => e.id);

    // Partidos H2H solo entre los empatados
    const h2h = partidosRegular.filter(
        p => ids.includes(p.equipoLocalId) && ids.includes(p.equipoVisitanteId)
    );

    // Stats H2H de cada equipo
    const statsH2H = Object.fromEntries(empatados.map(e => [e.id, calcStats(e.id, h2h)]));

    // Comparador por criterios D.1.3
    const comparar = (a: EquipoConStats, b: EquipoConStats): number => {
        const ha = statsH2H[a.id];
        const hb = statsH2H[b.id];

        // Criterio 1: récord H2H (puntos H2H: 2=win, 1=loss)
        if (hb.pts !== ha.pts) return hb.pts - ha.pts;
        // Criterio 2: diferencia de puntos H2H
        if (hb.dif !== ha.dif) return hb.dif - ha.dif;
        // Criterio 3: puntos a favor H2H
        if (hb.pf !== ha.pf) return hb.pf - ha.pf;
        // Criterio 4: diferencia de puntos en TODOS los partidos del grupo
        if (b.dif !== a.dif) return b.dif - a.dif;
        // Criterio 5: puntos a favor en TODOS los partidos del grupo
        if (b.puntos_favor !== a.puntos_favor) return b.puntos_favor - a.puntos_favor;
        // Criterio 6: sorteo → mantenemos orden original
        return 0;
    };

    // Ordenamos por los criterios
    const ordenados = [...empatados].sort(comparar);

    // Reinicio: si un subgrupo sigue empatado en TODOS los criterios H2H,
    // debemos procesar ese subgrupo recursivamente con sus propios partidos H2H.
    // Detectamos los sub-grupos que quedaron "juntos" tras el sort.
    const resultado: EquipoConStats[] = [];
    let i = 0;
    while (i < ordenados.length) {
        let j = i + 1;
        // Agrupar equipos que son idénticos en todos los criterios
        while (j < ordenados.length && comparar(ordenados[i], ordenados[j]) === 0) {
            j++;
        }
        const subgrupo = ordenados.slice(i, j);
        // Si el subgrupo es menor al original, hay oportunidad de reordenar
        if (subgrupo.length > 1 && subgrupo.length < empatados.length) {
            // Reinicio recursivo para el subgrupo
            resultado.push(...resolverEmpate(subgrupo, partidosRegular));
        } else {
            resultado.push(...subgrupo);
        }
        i = j;
    }

    return resultado;
};

/**
 * Ordenación principal del grupo:
 * 1. Ordena por puntos generales (D.1.1)
 * 2. Agrupa empatados y aplica D.1.3
 */
const sortFIBA = (equipos: EquipoConStats[], partidosRegular: Partido[]): EquipoConStats[] => {
    const porPuntos = [...equipos].sort((a, b) => b.puntos - a.puntos);

    const resultado: EquipoConStats[] = [];
    let i = 0;
    while (i < porPuntos.length) {
        let j = i + 1;
        while (j < porPuntos.length && porPuntos[j].puntos === porPuntos[i].puntos) j++;
        const empatados = porPuntos.slice(i, j);
        resultado.push(...resolverEmpate(empatados, partidosRegular));
        i = j;
    }
    return resultado;
};

// ─────────────────────────────────────────────
// COMPONENTE: Fila de equipo en la tabla
// ─────────────────────────────────────────────
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
            {/* Posición + indicador playoff */}
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

            {/* Equipo */}
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
                        <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.75rem', whiteSpace: 'nowrap', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>
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

            {/* JJ */}
            <td style={tdStyle}><span style={statStyle('#64748b')}>{eq.jj}</span></td>
            {/* JG */}
            <td style={tdStyle}><span style={statStyle('#10b981')}>{eq.victorias}</span></td>
            {/* JP */}
            <td style={tdStyle}><span style={statStyle('#ef4444')}>{eq.derrotas}</span></td>
            {/* DIF */}
            <td style={tdStyle}>
                <span style={statStyle(eq.dif >= 0 ? '#3b82f6' : '#ef4444')}>
                    {eq.dif > 0 ? `+${eq.dif}` : eq.dif}
                </span>
            </td>
            {/* FORMA — últimos 5 resultados */}
            <td style={{ ...tdStyle, minWidth: 82 }}>
                <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                    {eq.forma.length === 0 ? (
                        <span style={{ fontSize: '0.6rem', color: '#cbd5e1' }}>—</span>
                    ) : (
                        eq.forma.map((r, i) => (
                            <div key={i} style={{
                                width: 18, height: 18, borderRadius: 4,
                                background: r === 'G' ? '#10b981' : '#ef4444',
                                color: 'white', fontSize: '0.52rem', fontWeight: 900,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: r === 'G' ? '0 1px 4px #10b98155' : '0 1px 4px #ef444455',
                            }}>
                                {r}
                            </div>
                        ))
                    )}
                </div>
            </td>
            {/* PTS */}
            <td style={{ ...tdStyle, background: `${color}0d` }}>
                <span style={{ fontSize: '1rem', fontWeight: 900, color }}>{eq.puntos}</span>
            </td>
        </tr>
    );
});

const tdStyle: React.CSSProperties = { padding: '12px 8px', textAlign: 'center' };
const statStyle = (color: string): React.CSSProperties => ({ fontWeight: 700, color, fontSize: '0.82rem' });

// ─────────────────────────────────────────────
// COMPONENTE: Tabla de grupo
// ─────────────────────────────────────────────
const GroupTable = memo(({ teams, groupName, color }: { teams: EquipoConStats[]; groupName: string; color: string }) => {
    if (teams.length === 0) return null;
    return (
        <div style={{
            background: 'white', borderRadius: 24,
            boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
            marginBottom: 28, overflow: 'hidden',
            border: `1.5px solid ${color}30`,
        }}>
            {/* Header del grupo */}
            <div style={{
                background: color, color: 'white',
                padding: '14px 20px', fontWeight: 900,
                textTransform: 'uppercase', letterSpacing: '1.5px',
                fontSize: '0.9rem', display: 'flex',
                alignItems: 'center', gap: 10,
            }}>
                <span>🏀</span>
                <span>{groupName}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.6rem', opacity: 0.7, letterSpacing: '1px' }}>FASE REGULAR</span>
            </div>

            {/* Tabla */}
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', minWidth: 420 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', color: '#94a3b8', fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            <th style={{ padding: '10px', width: 44 }}>#</th>
                            <th style={{ padding: '10px', textAlign: 'left' }}>Equipo</th>
                            <th style={{ padding: '10px' }}>JJ</th>
                            <th style={{ padding: '10px' }}>JG</th>
                            <th style={{ padding: '10px' }}>JP</th>
                            <th style={{ padding: '10px' }}>DIF</th>
                            <th style={{ padding: '10px', minWidth: 82 }}>FORMA</th>
                            <th style={{ padding: '10px', background: `${color}15`, color, fontWeight: 900, minWidth: 50 }}>PTS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {teams.map((eq, i) => (
                            <TeamRow key={eq.id} eq={eq} index={i} color={color} />
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Leyenda */}
            <div style={{
                padding: '8px 16px', background: '#f8fafc',
                borderTop: '1px solid #f1f5f9',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                gap: 8, flexWrap: 'wrap',
            }}>
                <span style={{ fontSize: '0.52rem', color: '#94a3b8' }}>
                    Desempate: Apéndice D FIBA 2024 • H2H → Dif. H2H → PF H2H → Dif. general
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                        <span style={{ fontSize: '0.52rem', color: '#10b981', fontWeight: 700 }}>Clasifica playoff</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: 'white', fontSize: '0.45rem', fontWeight: 900 }}>G</span>
                        </div>
                        <div style={{ width: 14, height: 14, borderRadius: 3, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: 'white', fontSize: '0.45rem', fontWeight: 900 }}>P</span>
                        </div>
                        <span style={{ fontSize: '0.52rem', color: '#94a3b8' }}>Últimos 5</span>
                    </div>
                </div>
            </div>
        </div>
    );
});

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────

const StandingsViewer: React.FC<Props> = ({ equipos = [], partidos = [], onClose, categoria }) => {

    // Partidos regulares finalizados (única fuente de verdad)
    const partidosRegular = useMemo(
        () => partidos.filter(esPartidoRegular),
        [partidos]
    );

    // Recalcular estadísticas desde los partidos (ignoramos los datos de la DB)
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

                if (miMarcador > suMarcador) {
                    victorias++; puntos += 2;
                } else if (miMarcador < suMarcador) {
                    derrotas++; puntos += 1;
                }
                // Empate: no suma puntos (no debería ocurrir en basquetbol, pero lo manejamos)
            }
            return {
                ...eq, victorias, derrotas, puntos, puntos_favor: pf, puntos_contra: pc,
                jj: victorias + derrotas, dif: pf - pc,
                forma: calcForma(eq.id, partidos),
                playoffZone: false, // se asigna después del sort
            };
        });
    }, [equipos, partidosRegular]);

    // Separar grupos y ordenar con reglas FIBA
    const PLAYOFF_SPOTS = 4; // top 4 clasifican a playoff por grupo

    const grupoA = useMemo(() => {
        const equipos = equiposConStats.filter(e => {
            const g = e.grupo?.toUpperCase();
            return g === 'A' || g === 'ÚNICO';
        });
        return sortFIBA(equipos, partidosRegular).map((e, i) => ({ ...e, playoffZone: i < PLAYOFF_SPOTS }));
    }, [equiposConStats, partidosRegular]);

    const grupoB = useMemo(() => {
        const equipos = equiposConStats.filter(e => e.grupo?.toUpperCase() === 'B');
        return sortFIBA(equipos, partidosRegular).map((e, i) => ({ ...e, playoffZone: i < PLAYOFF_SPOTS }));
    }, [equiposConStats, partidosRegular]);

    const getGroupLabel = (groupCode: 'A' | 'B') => {
        const cat = (categoria ?? '').trim().toUpperCase();
        if (cat === 'LIBRE') return groupCode === 'A' ? 'CONFERENCIA ESTE' : 'CONFERENCIA OESTE';
        if (grupoA.some(e => e.grupo?.toUpperCase() === 'ÚNICO')) return 'TABLA GENERAL';
        return `GRUPO ${groupCode}`;
    };

    const hayDatos = equiposConStats.length > 0;

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 100, fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

            {/* Header */}
            <div style={{
                background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
                color: 'white', padding: '28px 20px 36px',
                borderRadius: '0 0 36px 36px', marginBottom: 28,
                boxShadow: '0 8px 30px rgba(30,58,138,0.3)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 860, margin: '0 auto' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, letterSpacing: '1px' }}>
                            TABLAS {categoria.toUpperCase()}
                        </h2>
                        <p style={{ margin: '4px 0 0', fontSize: '0.6rem', fontWeight: 700, color: '#fbbf24', letterSpacing: '1px', textTransform: 'uppercase' }}>
                            Solo fase regular • Desempate Apéndice D FIBA 2024
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.15)', color: 'white',
                            border: '1px solid rgba(255,255,255,0.3)',
                            padding: '9px 18px', borderRadius: 12,
                            fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem',
                            backdropFilter: 'blur(8px)', transition: 'background 0.2s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
                    >
                        ✕ CERRAR
                    </button>
                </div>
            </div>
            {/* Tablas */}
            <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 16px' }}>
                {!hayDatos ? (
                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: 60, fontSize: '0.9rem' }}>
                        Cargando equipos...
                    </div>
                ) : (
                    <>
                        {grupoA.length > 0 && (
                            <GroupTable teams={grupoA} groupName={getGroupLabel('A')} color="#1e3a8a" />
                        )}
                        {grupoB.length > 0 && (
                            <GroupTable teams={grupoB} groupName={getGroupLabel('B')} color="#d97706" />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default StandingsViewer;