import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, getDoc, setDoc, collection, getDocs, updateDoc, orderBy, query } from 'firebase/firestore';

interface Equipo {
    id: string;
    nombre: string;
    logoUrl?: string;
    grupo?: string;
}

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
export interface ConfigCategoria {
    numGrupos: 1 | 2;
    nombreGrupoA: string;  // ej. "CONF. ESTE" o "GRUPO A" o "ÚNICO"
    nombreGrupoB: string;  // solo si numGrupos === 2
    usaPlayIn: boolean;    // Conf. Este usa Play-In
    equiposPorGrupo: number; // cuántos equipos por grupo
    fasesPlayoff: string[]; // fases habilitadas
}

export const CONFIG_DEFAULT: ConfigCategoria = {
    numGrupos: 2,
    nombreGrupoA: 'CONF. ESTE',
    nombreGrupoB: 'CONF. OESTE',
    usaPlayIn: true,
    equiposPorGrupo: 6,
    fasesPlayoff: ['PLAYIN', 'SEMIFINAL', 'FINAL', 'GRAN FINAL'],
};

const CATEGORIAS = [
    { id: 'LIBRE',           label: '🏀 LIBRE'           },
    { id: 'INTERINDUSTRIAL', label: '🏭 INTERINDUSTRIAL' },
    { id: 'U16_FEMENINO',    label: '👧 U16 FEMENINO'    },
    { id: 'U16M',            label: '👦 U16 MASCULINO'   },
    { id: 'MASTER40',        label: '🍷 MASTER 40'       },
];

const FASES_DISPONIBLES = [
    { id: 'PLAYIN',     label: '⚡ Play-In'    },
    { id: 'CUARTOS',    label: '🔢 Cuartos'   },
    { id: 'SEMIFINAL',  label: '🏅 Semifinal'  },
    { id: '3ER LUGAR',  label: '🥉 3er Lugar'  },
    { id: 'FINAL',      label: '🏆 Final'      },
    { id: 'GRAN FINAL', label: '👑 Gran Final' },
];

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
const ConfigTorneo: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [catActiva, setCatActiva]   = useState('LIBRE');
    const [config, setConfig]         = useState<ConfigCategoria>({ ...CONFIG_DEFAULT });
    const [loading, setLoading]       = useState(false);
    const [saving, setSaving]         = useState(false);
    const [saved, setSaved]           = useState(false);
    const [equipos, setEquipos]       = useState<Equipo[]>([]);
    const [grupoMap, setGrupoMap]     = useState<Record<string, string>>({});

    // Cargar config de Firestore al cambiar categoría
    useEffect(() => {
        setLoading(true);
        setSaved(false);
        const colEq = catActiva.trim().toUpperCase() === 'MASTER40'
            ? 'equipos' : `equipos_${catActiva.trim().toUpperCase()}`;

        Promise.all([
            getDoc(doc(db, 'config_torneo', catActiva)),
            getDocs(query(collection(db, colEq), orderBy('nombre', 'asc'))),
        ]).then(([configSnap, eqSnap]) => {
            if (configSnap.exists()) {
                setConfig({ ...CONFIG_DEFAULT, ...configSnap.data() } as ConfigCategoria);
            } else {
                setConfig({ ...CONFIG_DEFAULT });
            }
            const eqs = eqSnap.docs.map(d => ({ id: d.id, ...d.data() } as Equipo));
            setEquipos(eqs);
            // Build grupoMap from current grupo field
            const gMap: Record<string, string> = {};
            eqs.forEach(e => { if (e.grupo) gMap[e.id] = e.grupo; });
            setGrupoMap(gMap);
        }).catch(() => {
            setConfig({ ...CONFIG_DEFAULT });
        }).finally(() => setLoading(false));
    }, [catActiva]);

    const handleSave = async () => {
        setSaving(true);
        try {
            // Guardar config
            await setDoc(doc(db, 'config_torneo', catActiva), config);
            // Guardar grupo de cada equipo
            const colEq = catActiva.trim().toUpperCase() === 'MASTER40'
                ? 'equipos' : `equipos_${catActiva.trim().toUpperCase()}`;
            await Promise.all(
                equipos.map(eq =>
                    updateDoc(doc(db, colEq, eq.id), {
                        grupo: grupoMap[eq.id] ?? '',
                    })
                )
            );
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (e) {
            alert('Error al guardar');
        }
        setSaving(false);
    };

    const toggleFase = (fase: string) => {
        setConfig(prev => ({
            ...prev,
            fasesPlayoff: prev.fasesPlayoff.includes(fase)
                ? prev.fasesPlayoff.filter(f => f !== fase)
                : [...prev.fasesPlayoff, fase],
        }));
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '9px 12px', borderRadius: 8,
        border: '1px solid #e2e8f0', fontSize: '0.82rem',
        background: '#f8fafc', boxSizing: 'border-box', color: '#0f172a',
    };
    const labelStyle: React.CSSProperties = {
        fontSize: '0.62rem', fontWeight: 800, color: '#64748b',
        textTransform: 'uppercase', letterSpacing: '0.5px',
        display: 'block', marginBottom: 4,
    };
    const sectionStyle: React.CSSProperties = {
        background: 'white', borderRadius: 14, padding: 16,
        border: '1.5px solid #e2e8f0', marginBottom: 14,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    };

    return (
        <div style={{ background: '#f3f4f6', minHeight: '100vh', fontFamily: "'Inter','Segoe UI',sans-serif", overflowY: 'auto' }}>
            {/* Header */}
            <div style={{ background: 'white', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, zIndex: 10 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>
                        ⚙️ Configuración del Torneo
                    </h2>
                    <p style={{ margin: '2px 0 0', fontSize: '0.6rem', color: '#94a3b8' }}>
                        Define la estructura de cada categoría
                    </p>
                </div>
                <button onClick={onClose} style={{ background: 'none', color: '#3b82f6', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>
                    ← VOLVER
                </button>
            </div>

            {/* Selector de categoría */}
            <div style={{ background: 'white', padding: '10px 16px', display: 'flex', gap: 8, overflowX: 'auto', borderBottom: '1px solid #e5e7eb' }}
                className="no-scrollbar">
                {CATEGORIAS.map(cat => (
                    <button key={cat.id} onClick={() => setCatActiva(cat.id)} style={{
                        padding: '6px 14px', borderRadius: 20, whiteSpace: 'nowrap', border: 'none',
                        background: catActiva === cat.id ? '#1e3a8a' : '#f1f5f9',
                        color: catActiva === cat.id ? 'white' : '#64748b',
                        fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                    }}>
                        {cat.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Cargando...</div>
            ) : (
                <div style={{ padding: '16px', maxWidth: 500, margin: '0 auto', paddingBottom: 60 }}>

                    {/* ── FASE REGULAR ── */}
                    <div style={sectionStyle}>
                        <h3 style={{ margin: '0 0 14px', fontSize: '0.82rem', fontWeight: 900, color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: 6 }}>
                            📋 Fase Regular
                        </h3>

                        {/* Número de grupos */}
                        <div style={{ marginBottom: 14 }}>
                            <label style={labelStyle}>Estructura de grupos</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                {([1, 2] as const).map(n => (
                                    <button
                                        key={n}
                                        onClick={() => {
                                            setConfig(prev => ({ ...prev, numGrupos: n }));
                                            if (n === 1) {
                                                // Todos al grupo A (único)
                                                const all: Record<string, string> = {};
                                                equipos.forEach(e => { all[e.id] = 'A'; });
                                                setGrupoMap(all);
                                            }
                                        }}
                                        style={{
                                            padding: '12px', borderRadius: 10, border: '2px solid',
                                            borderColor: config.numGrupos === n ? '#1e3a8a' : '#e2e8f0',
                                            background: config.numGrupos === n ? '#eff6ff' : 'white',
                                            color: config.numGrupos === n ? '#1e3a8a' : '#64748b',
                                            fontWeight: 900, fontSize: '0.72rem', cursor: 'pointer',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                        }}
                                    >
                                        <span style={{ fontSize: '1.4rem' }}>{n === 1 ? '🏀' : '⚖️'}</span>
                                        <span>{n === 1 ? 'Un solo grupo' : 'Dos grupos / Conferencias'}</span>
                                        <span style={{ fontSize: '0.55rem', fontWeight: 400, color: '#94a3b8' }}>
                                            {n === 1 ? 'Todos contra todos' : 'Grupo A y Grupo B'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Nombres de grupos */}
                        <div style={{ display: 'grid', gridTemplateColumns: config.numGrupos === 2 ? '1fr 1fr' : '1fr', gap: 10 }}>
                            <div>
                                <label style={labelStyle}>{config.numGrupos === 2 ? 'Nombre Grupo A' : 'Nombre del Grupo'}</label>
                                <input
                                    style={inputStyle}
                                    value={config.nombreGrupoA}
                                    onChange={e => setConfig(prev => ({ ...prev, nombreGrupoA: e.target.value }))}
                                    placeholder="ej. CONF. ESTE"
                                />
                            </div>
                            {config.numGrupos === 2 && (
                                <div>
                                    <label style={labelStyle}>Nombre Grupo B</label>
                                    <input
                                        style={inputStyle}
                                        value={config.nombreGrupoB}
                                        onChange={e => setConfig(prev => ({ ...prev, nombreGrupoB: e.target.value }))}
                                        placeholder="ej. CONF. OESTE"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Equipos por grupo */}
                        <div style={{ marginTop: 12 }}>
                            <label style={labelStyle}>Equipos {config.numGrupos === 2 ? 'por grupo' : 'en total'}</label>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {[4, 5, 6, 7, 8, 10].map(n => (
                                    <button key={n} onClick={() => setConfig(prev => ({ ...prev, equiposPorGrupo: n }))}
                                        style={{
                                            padding: '6px 14px', borderRadius: 20, border: '1.5px solid',
                                            borderColor: config.equiposPorGrupo === n ? '#1e3a8a' : '#e2e8f0',
                                            background: config.equiposPorGrupo === n ? '#1e3a8a' : 'white',
                                            color: config.equiposPorGrupo === n ? 'white' : '#64748b',
                                            fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer',
                                        }}>
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── PLAYOFF ── */}
                    <div style={sectionStyle}>
                        <h3 style={{ margin: '0 0 14px', fontSize: '0.82rem', fontWeight: 900, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6 }}>
                            🏆 Playoff
                        </h3>

                        {/* Play-In toggle (solo si hay 2 grupos) */}
                        {config.numGrupos === 2 && (
                            <div style={{ marginBottom: 14, background: config.usaPlayIn ? '#f5f3ff' : '#f8fafc', border: `1.5px solid ${config.usaPlayIn ? '#7c3aed' : '#e2e8f0'}`, borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                onClick={() => setConfig(prev => ({ ...prev, usaPlayIn: !prev.usaPlayIn }))}>
                                <div>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 800, color: config.usaPlayIn ? '#7c3aed' : '#475569' }}>
                                        ⚡ Play-In para Grupo A
                                    </div>
                                    <div style={{ fontSize: '0.58rem', color: '#94a3b8', marginTop: 2 }}>
                                        3°-6° disputan Play-In · 1° y 2° van directo a Semis
                                    </div>
                                </div>
                                <div style={{
                                    width: 40, height: 22, borderRadius: 11,
                                    background: config.usaPlayIn ? '#7c3aed' : '#e2e8f0',
                                    position: 'relative', flexShrink: 0, transition: 'background 0.2s',
                                }}>
                                    <div style={{
                                        position: 'absolute', top: 3,
                                        left: config.usaPlayIn ? 21 : 3,
                                        width: 16, height: 16, borderRadius: '50%', background: 'white',
                                        transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                                    }} />
                                </div>
                            </div>
                        )}

                        {/* Fases habilitadas */}
                        <div>
                            <label style={labelStyle}>Fases del playoff habilitadas</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {FASES_DISPONIBLES.map(f => {
                                    // Ocultar Play-In si no está activado o no hay 2 grupos
                                    if (f.id === 'PLAYIN' && (config.numGrupos === 1 || !config.usaPlayIn)) return null;
                                    const active = config.fasesPlayoff.includes(f.id);
                                    return (
                                        <div key={f.id}
                                            onClick={() => toggleFase(f.id)}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                                                background: active ? '#f5f3ff' : '#f8fafc',
                                                border: `1.5px solid ${active ? '#7c3aed' : '#e2e8f0'}`,
                                            }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: active ? 700 : 500, color: active ? '#7c3aed' : '#64748b' }}>
                                                {f.label}
                                            </span>
                                            <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${active ? '#7c3aed' : '#cbd5e1'}`, background: active ? '#7c3aed' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                {active && <span style={{ color: 'white', fontSize: '0.65rem', fontWeight: 900 }}>✓</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* ── ASIGNACIÓN DE GRUPOS ── */}
                    {equipos.length > 0 && (
                        <div style={sectionStyle}>
                            <h3 style={{ margin: '0 0 14px', fontSize: '0.82rem', fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                                🗂️ Asignar grupos a equipos
                            </h3>
                            <p style={{ fontSize: '0.6rem', color: '#94a3b8', margin: '0 0 12px' }}>
                                {config.numGrupos === 1
                                    ? `Selecciona los equipos que participan en ${config.nombreGrupoA || 'el grupo'}. Los no seleccionados quedan fuera.`
                                    : `Asigna cada equipo a ${config.nombreGrupoA || 'Grupo A'} o ${config.nombreGrupoB || 'Grupo B'}.`}
                            </p>
                            {config.numGrupos === 1 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <span style={{ fontSize: '0.6rem', color: '#475569', fontWeight: 700 }}>
                                        {Object.values(grupoMap).filter(g => g === 'A').length} equipos seleccionados
                                    </span>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => { const all: Record<string,string> = {}; equipos.forEach(e => { all[e.id] = 'A'; }); setGrupoMap(all); }}
                                            style={{ fontSize: '0.58rem', padding: '3px 10px', borderRadius: 20, border: '1px solid #1e40af', background: '#dbeafe', color: '#1e40af', fontWeight: 700, cursor: 'pointer' }}>
                                            Todos ✓
                                        </button>
                                        <button onClick={() => setGrupoMap({})}
                                            style={{ fontSize: '0.58rem', padding: '3px 10px', borderRadius: 20, border: '1px solid #e2e8f0', background: 'white', color: '#94a3b8', fontWeight: 700, cursor: 'pointer' }}>
                                            Ninguno
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {equipos.map(eq => (
                                    <div key={eq.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, border: `1.5px solid ${config.numGrupos === 1 ? (grupoMap[eq.id] === 'A' ? '#1e40af' : '#e2e8f0') : '#e2e8f0'}`, background: config.numGrupos === 1 ? (grupoMap[eq.id] === 'A' ? '#eff6ff' : '#f8fafc') : '#f8fafc', cursor: config.numGrupos === 1 ? 'pointer' : 'default', transition: 'all 0.15s' }}
                                        onClick={() => {
                                            if (config.numGrupos !== 1) return;
                                            setGrupoMap(prev => ({ ...prev, [eq.id]: prev[eq.id] === 'A' ? '' : 'A' }));
                                        }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                                            {config.numGrupos === 1 && (
                                                <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${grupoMap[eq.id] === 'A' ? '#1e40af' : '#cbd5e1'}`, background: grupoMap[eq.id] === 'A' ? '#1e40af' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    {grupoMap[eq.id] === 'A' && <span style={{ color: 'white', fontSize: '0.65rem', fontWeight: 900 }}>✓</span>}
                                                </div>
                                            )}
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: config.numGrupos === 1 ? (grupoMap[eq.id] === 'A' ? '#1e40af' : '#94a3b8') : '#0f172a' }}>
                                                {eq.nombre}
                                            </span>
                                        </div>
                                        {config.numGrupos === 1 ? (
                                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: grupoMap[eq.id] === 'A' ? '#1e40af' : '#94a3b8' }}>
                                                {grupoMap[eq.id] === 'A' ? `✓ ${config.nombreGrupoA || 'Participa'}` : 'No participa'}
                                            </span>
                                        ) : (
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                {[
                                                    { v: 'A', label: config.nombreGrupoA || 'Grupo A', color: '#1e40af', bg: '#dbeafe' },
                                                    { v: 'B', label: config.nombreGrupoB || 'Grupo B', color: '#92400e', bg: '#fef3c7' },
                                                ].map(opt => (
                                                    <button key={opt.v}
                                                        onClick={() => setGrupoMap(prev => ({ ...prev, [eq.id]: opt.v }))}
                                                        style={{
                                                            padding: '4px 12px', borderRadius: 20, border: '1.5px solid',
                                                            borderColor: grupoMap[eq.id] === opt.v ? opt.color : '#e2e8f0',
                                                            background: grupoMap[eq.id] === opt.v ? opt.bg : 'white',
                                                            color: grupoMap[eq.id] === opt.v ? opt.color : '#94a3b8',
                                                            fontSize: '0.62rem', fontWeight: 700, cursor: 'pointer',
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {config.numGrupos === 2 && (
                                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f1f5f9', borderRadius: 8, fontSize: '0.62rem', color: '#475569' }}>
                                    <span>🔵 {config.nombreGrupoA}: <b style={{ color: '#1e40af' }}>{Object.values(grupoMap).filter(g => g === 'A').length} equipos</b></span>
                                    <span>🟠 {config.nombreGrupoB}: <b style={{ color: '#92400e' }}>{Object.values(grupoMap).filter(g => g === 'B').length} equipos</b></span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── RESUMEN ── */}
                    <div style={{ background: '#0f172a', borderRadius: 14, padding: 16, marginBottom: 14 }}>
                        <h4 style={{ margin: '0 0 10px', fontSize: '0.72rem', fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            📊 Resumen — {catActiva}
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {[
                                ['Estructura', config.numGrupos === 1 ? `1 grupo · ${config.equiposPorGrupo} equipos` : `2 grupos · ${config.equiposPorGrupo} equipos c/u`],
                                ['Grupo A', config.nombreGrupoA],
                                ...(config.numGrupos === 2 ? [['Grupo B', config.nombreGrupoB]] as const : []),
                                ['Play-In', config.numGrupos === 2 && config.usaPlayIn ? '✅ Activo (Grupo A)' : '❌ Sin Play-In'],
                                ['Fases playoff', config.fasesPlayoff.join(' → ')],
                            ].map(([k, v]) => (
                                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem' }}>
                                    <span style={{ color: '#64748b', fontWeight: 700 }}>{k}</span>
                                    <span style={{ color: 'white', fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{v}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── GUARDAR ── */}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                            background: saved ? '#10b981' : '#1e3a8a',
                            color: 'white', fontWeight: 900, fontSize: '0.85rem',
                            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                            transition: 'background 0.3s',
                        }}>
                        {saving ? 'Guardando...' : saved ? '✅ Configuración guardada' : `💾 Guardar configuración — ${catActiva}`}
                    </button>

                    <p style={{ textAlign: 'center', fontSize: '0.58rem', color: '#94a3b8', marginTop: 10 }}>
                        Los cambios solo afectan cómo se muestran las tablas y el playoff. Los partidos ya creados no se modifican.
                    </p>
                </div>
            )}

            <style>{`.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
        </div>
    );
};

export default ConfigTorneo;