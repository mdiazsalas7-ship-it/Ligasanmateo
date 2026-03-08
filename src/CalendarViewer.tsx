import React, { useState, useEffect, useMemo, memo } from 'react';
import { db } from './firebase';
import {
    collection, query, onSnapshot, orderBy,
    deleteDoc, doc, getDocs, where, updateDoc, writeBatch, addDoc, setDoc
} from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
interface Match {
    id: string;
    fechaAsignada: string;
    hora?: string;
    estatus: string;
    fase?: string;
    grupo?: string;
    categoria?: string;
    equipoLocalId?: string;
    equipoLocalNombre: string;
    equipoVisitanteId?: string;
    equipoVisitanteNombre: string;
    marcadorLocal?: number;
    marcadorVisitante?: number;
}

interface Equipo {
    id: string;
    nombre: string;
    logoUrl?: string;
}

interface Stat {
    id: string;
    jugadorId: string;
    nombre: string;
    equipo: string;
    equipoId?: string;
    fotoUrl?: string;
    dobles?: number;
    triples?: number;
    tirosLibres?: number;
    rebotes?: number;
    robos?: number;
    bloqueos?: number;
    tapones?: number;
    puntos?: number;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const DEFAULT_LOGO = 'https://cdn-icons-png.flaticon.com/512/451/451716.png';

const getColName = (base: string, categoria: string) => {
    const cat = categoria.trim().toUpperCase();
    return (cat === 'MASTER40' || cat === 'MASTER') ? base : `${base}_${cat}`;
};

const FASES_PLAYOFF = new Set(['FINAL', 'SEMIS', 'SEMIFINAL', 'CUARTOS', 'OCTAVOS', '3ER LUGAR', 'PLAYOFF', 'PLAYOFFS']);

const esFasePlayoff = (fase?: string) =>
    fase ? FASES_PLAYOFF.has(fase.trim().toUpperCase()) : false;

const formatFecha = (dateStr: string): string => {
    try {
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    } catch {
        return dateStr;
    }
};

const agruparPorFecha = (matches: Match[]): { fecha: string; partidos: Match[] }[] => {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
        const f = m.fechaAsignada ?? 'Sin fecha';
        if (!map.has(f)) map.set(f, []);
        map.get(f)!.push(m);
    }
    return Array.from(map.entries()).map(([fecha, partidos]) => ({ fecha, partidos }));
};

// ─────────────────────────────────────────────
// COMPONENTE: Logo con soporte gs://
// ─────────────────────────────────────────────
const TeamLogo = memo(({ logoUrl, altText }: { logoUrl?: string; altText?: string }) => {
    const [url, setUrl] = useState(DEFAULT_LOGO);

    useEffect(() => {
        if (!logoUrl) { setUrl(DEFAULT_LOGO); return; }
        if (logoUrl.startsWith('gs://')) {
            getDownloadURL(ref(getStorage(), logoUrl))
                .then(setUrl)
                .catch(() => setUrl(DEFAULT_LOGO));
        } else {
            setUrl(logoUrl);
        }
    }, [logoUrl]);

    return (
        <img
            src={url}
            alt={altText ?? ''}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={() => setUrl(DEFAULT_LOGO)}
        />
    );
});

// ─────────────────────────────────────────────
// COMPONENTE: MatchForm (inline — reemplaza MatchForm.tsx borrado)
// ─────────────────────────────────────────────
const MatchForm: React.FC<{
    matchToEdit: Match | null;
    categoriaActiva: string;
    equipos: Equipo[];
    onSuccess: () => void;
    onClose: () => void;
}> = ({ matchToEdit, categoriaActiva, equipos, onSuccess, onClose }) => {
    const [fecha, setFecha]             = useState(matchToEdit?.fechaAsignada ?? '');
    const [hora, setHora]               = useState(matchToEdit?.hora ?? '');
    const [localId, setLocalId]         = useState(matchToEdit?.equipoLocalId ?? '');
    const [visitanteId, setVisitanteId] = useState(matchToEdit?.equipoVisitanteId ?? '');
    const [fase, setFase]               = useState(matchToEdit?.fase ?? 'REGULAR');
    const [grupo, setGrupo]             = useState(matchToEdit?.grupo ?? '');
    const [estatus, setEstatus]         = useState(matchToEdit?.estatus ?? 'programado');
    const [marcLocal, setMarcLocal]     = useState<string>(matchToEdit?.marcadorLocal?.toString() ?? '');
    const [marcVisit, setMarcVisit]     = useState<string>(matchToEdit?.marcadorVisitante?.toString() ?? '');
    const [saving, setSaving]           = useState(false);

    const colCal = getColName('calendario', categoriaActiva);

    const getEquipoNombre = (id: string) =>
        equipos.find(e => e.id === id)?.nombre ?? '';

    const handleSave = async () => {
        if (!fecha || !localId || !visitanteId) {
            alert('Completa fecha y ambos equipos');
            return;
        }
        if (localId === visitanteId) {
            alert('Los equipos no pueden ser el mismo');
            return;
        }
        setSaving(true);
        try {
            const data: any = {
                fechaAsignada: fecha,
                hora: hora || null,
                equipoLocalId: localId,
                equipoLocalNombre: getEquipoNombre(localId),
                equipoVisitanteId: visitanteId,
                equipoVisitanteNombre: getEquipoNombre(visitanteId),
                fase,
                grupo: grupo || null,
                estatus,
                categoria: categoriaActiva,
            };
            if (estatus === 'finalizado') {
                data.marcadorLocal     = parseInt(marcLocal) || 0;
                data.marcadorVisitante = parseInt(marcVisit) || 0;
            }
            if (matchToEdit) {
                await setDoc(doc(db, colCal, matchToEdit.id), data, { merge: true });
            } else {
                await addDoc(collection(db, colCal), data);
            }
            onSuccess();
        } catch (e: any) {
            alert('Error: ' + e.message);
        }
        setSaving(false);
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '9px 12px', borderRadius: 8,
        border: '1px solid #e2e8f0', fontSize: '0.82rem',
        background: '#f8fafc', boxSizing: 'border-box',
    };
    const labelStyle: React.CSSProperties = {
        fontSize: '0.62rem', fontWeight: 800, color: '#64748b',
        textTransform: 'uppercase', letterSpacing: '0.5px',
        display: 'block', marginBottom: 4,
    };

    return (
        <div style={{ padding: 20, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color: '#0f172a' }}>
                    {matchToEdit ? '✏️ Editar Partido' : '➕ Nuevo Partido'}
                </h3>
                <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Fecha y hora */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                        <label style={labelStyle}>Fecha</label>
                        <input type="date" style={inputStyle} value={fecha} onChange={e => setFecha(e.target.value)} />
                    </div>
                    <div>
                        <label style={labelStyle}>Hora</label>
                        <input type="time" style={inputStyle} value={hora} onChange={e => setHora(e.target.value)} />
                    </div>
                </div>

                {/* Equipos */}
                <div>
                    <label style={labelStyle}>Equipo Local</label>
                    <select style={inputStyle} value={localId} onChange={e => setLocalId(e.target.value)}>
                        <option value="">Seleccionar...</option>
                        {equipos.map(eq => <option key={eq.id} value={eq.id}>{eq.nombre}</option>)}
                    </select>
                </div>
                <div>
                    <label style={labelStyle}>Equipo Visitante</label>
                    <select style={inputStyle} value={visitanteId} onChange={e => setVisitanteId(e.target.value)}>
                        <option value="">Seleccionar...</option>
                        {equipos.map(eq => <option key={eq.id} value={eq.id}>{eq.nombre}</option>)}
                    </select>
                </div>

                {/* Fase y Grupo */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                        <label style={labelStyle}>Fase</label>
                        <select style={inputStyle} value={fase} onChange={e => setFase(e.target.value)}>
                            {['REGULAR','CUARTOS','SEMIFINAL','3ER LUGAR','FINAL'].map(f =>
                                <option key={f} value={f}>{f}</option>
                            )}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>Grupo</label>
                        <select style={inputStyle} value={grupo} onChange={e => setGrupo(e.target.value)}>
                            <option value="">—</option>
                            <option value="A">Grupo A</option>
                            <option value="B">Grupo B</option>
                        </select>
                    </div>
                </div>

                {/* Estatus */}
                <div>
                    <label style={labelStyle}>Estatus</label>
                    <select style={inputStyle} value={estatus} onChange={e => setEstatus(e.target.value)}>
                        <option value="programado">Programado</option>
                        <option value="finalizado">Finalizado</option>
                        <option value="suspendido">Suspendido</option>
                    </select>
                </div>

                {/* Marcador si finalizado */}
                {estatus === 'finalizado' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                            <label style={labelStyle}>Marcador Local</label>
                            <input type="number" style={inputStyle} value={marcLocal} onChange={e => setMarcLocal(e.target.value)} min={0} />
                        </div>
                        <div>
                            <label style={labelStyle}>Marcador Visitante</label>
                            <input type="number" style={inputStyle} value={marcVisit} onChange={e => setMarcVisit(e.target.value)} min={0} />
                        </div>
                    </div>
                )}

                {/* Botones */}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '11px', borderRadius: 8, border: 'none', background: '#1e3a8a', color: 'white', fontWeight: 900, fontSize: '0.82rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                        {saving ? 'Guardando...' : matchToEdit ? '💾 Guardar cambios' : '➕ Crear partido'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────
// COMPONENTE: BoxScore Modal
// ─────────────────────────────────────────────
const BoxScoreModal = memo(({
    match, onClose, getLogo, rol,
}: {
    match: Match;
    onClose: () => void;
    getLogo: (id?: string, nombre?: string) => string | undefined;
    rol?: string;
}) => {
    const [stats, setStats] = useState<Stat[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editedStats, setEditedStats] = useState<Record<string, Stat>>({});

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const snap = await getDocs(
                    query(collection(db, 'stats_partido'), where('partidoId', '==', match.id))
                );
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Stat));

                // Buscar fotos en todas las colecciones de jugadores posibles
                const jugadorIds = [...new Set(data.map(s => s.jugadorId).filter(Boolean))];
                const fotoMap: Record<string, string> = {};

                if (jugadorIds.length > 0) {
                    const colsJugadores = [
                        'jugadores_MASTER40', 'jugadores', 'jugadores_LIBRE',
                        'jugadores_INTERINDUSTRIAL', 'jugadores_U16_FEMENINO', 'jugadores_U16M',
                    ];
                    await Promise.all(colsJugadores.map(async col => {
                        try {
                            const jSnap = await getDocs(collection(db, col));
                            jSnap.forEach(d => {
                                if (jugadorIds.includes(d.id) && d.data().fotoUrl) {
                                    fotoMap[d.id] = d.data().fotoUrl;
                                }
                            });
                        } catch { /* colección no existe, ignorar */ }
                    }));
                }

                // Inyectar fotoUrl en cada stat
                const dataConFoto = data.map(s => ({
                    ...s,
                    fotoUrl: fotoMap[s.jugadorId] || s.fotoUrl || '',
                }));

                setStats(dataConFoto);
                const init: Record<string, Stat> = {};
                dataConFoto.forEach(s => { init[s.id] = { ...s, bloqueos: s.bloqueos ?? s.tapones ?? 0 }; });
                setEditedStats(init);
            } catch (e) { console.error(e); }
            setLoading(false);
        };
        fetchStats();
    }, [match.id]);

    const mvp = useMemo(() => {
        if (!stats.length) return null;
        const ptsL = Number(match.marcadorLocal) || 0;
        const ptsV = Number(match.marcadorVisitante) || 0;
        const ganadorId = ptsL > ptsV ? match.equipoLocalId : ptsV > ptsL ? match.equipoVisitanteId : null;
        const ganadorNombre = ptsL > ptsV ? match.equipoLocalNombre : ptsV > ptsL ? match.equipoVisitanteNombre : null;

        let elegibles = stats.filter(s =>
            (ganadorId && s.equipoId?.toString() === ganadorId.toString()) ||
            (ganadorNombre && s.equipo?.trim().toUpperCase() === ganadorNombre.trim().toUpperCase())
        );
        if (!elegibles.length) elegibles = stats;

        const val = (p: Stat) =>
            (Number(p.dobles ?? 0) * 2 + Number(p.triples ?? 0) * 3 + Number(p.tirosLibres ?? 0)) +
            Number(p.rebotes ?? 0) + Number(p.robos ?? 0) + Number(p.bloqueos ?? p.tapones ?? 0);

        return [...elegibles].sort((a, b) => val(b) - val(a))[0];
    }, [stats, match]);

    const handleChange = (statId: string, field: keyof Stat, value: string) => {
        const n = value === '' ? 0 : parseInt(value);
        setEditedStats(prev => ({
            ...prev,
            [statId]: { ...prev[statId], [field]: isNaN(n) ? 0 : n },
        }));
    };

    const saveChanges = async () => {
        try {
            await Promise.all(Object.values(editedStats).map(async stat => {
                if (!stat.id) return;
                await updateDoc(doc(db, 'stats_partido', stat.id), {
                    dobles: Number(stat.dobles) || 0,
                    triples: Number(stat.triples) || 0,
                    tirosLibres: Number(stat.tirosLibres) || 0,
                    rebotes: Number(stat.rebotes) || 0,
                    robos: Number(stat.robos) || 0,
                    bloqueos: Number(stat.bloqueos) || 0,
                    tapones: Number(stat.bloqueos) || 0,
                });
            }));
            setIsEditing(false);
            setStats(Object.values(editedStats));
        } catch (e: any) { alert(`Error: ${e.message}`); }
    };

    const inputStyle: React.CSSProperties = {
        width: 40, padding: '5px 2px', textAlign: 'center',
        border: '1px solid #cbd5e1', borderRadius: 4, fontSize: '0.8rem',
    };

    const renderTeamTable = (teamName: string, teamId?: string) => {
        const players = stats.filter(s =>
            (teamId && s.equipoId?.toString() === teamId) ||
            s.equipo?.trim().toUpperCase() === teamName.trim().toUpperCase()
        );
        const source = isEditing
            ? Object.values(editedStats).filter(s => players.find(p => p.id === s.id))
            : players;
        const totalPts = source.reduce((acc, p) =>
            acc + (Number(p.tirosLibres ?? 0)) + (Number(p.dobles ?? 0) * 2) + (Number(p.triples ?? 0) * 3), 0);

        return (
            <div style={{ marginBottom: 24, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{
                    background: '#f8fafc', padding: '10px 14px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '2px solid #e2e8f0',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', overflow: 'hidden', background: '#fff' }}>
                            <TeamLogo logoUrl={getLogo(teamId, teamName)} altText={teamName} />
                        </div>
                        <span style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '0.85rem' }}>{teamName}</span>
                    </div>
                    <span style={{ background: '#e2e8f0', padding: '3px 10px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 700 }}>
                        {totalPts} PTS
                    </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'center', minWidth: 380 }}>
                        <thead style={{ background: '#fff', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                            <tr>
                                <th style={{ textAlign: 'left', padding: '10px 14px' }}>JUGADOR</th>
                                <th style={{ fontWeight: 900, color: '#0f172a' }}>PTS</th>
                                <th>2P</th><th>3P</th><th>TL</th><th>REB</th><th>TAP</th><th>ROB</th>
                            </tr>
                        </thead>
                        <tbody>
                            {players.map(p => {
                                const cur = isEditing ? editedStats[p.id] : p;
                                const pts = (Number(cur?.tirosLibres ?? 0)) + (Number(cur?.dobles ?? 0) * 2) + (Number(cur?.triples ?? 0) * 3);
                                const isMVP = mvp?.id === p.id;
                                return (
                                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9', background: isMVP && !isEditing ? '#fff9db' : '#fff' }}>
                                        <td style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600 }}>
                                            {p.nombre}
                                            {isMVP && !isEditing && (
                                                <span style={{ marginLeft: 6, fontSize: '0.55rem', background: '#f59e0b', color: '#fff', padding: '2px 5px', borderRadius: 4, fontWeight: 900 }}>MVP</span>
                                            )}
                                        </td>
                                        <td style={{ fontWeight: 900, fontSize: '0.95rem' }}>{pts}</td>
                                        {isEditing ? (
                                            <>
                                                <td><input type="number" style={inputStyle} value={cur?.dobles ?? 0} onChange={e => handleChange(p.id, 'dobles', e.target.value)} /></td>
                                                <td><input type="number" style={inputStyle} value={cur?.triples ?? 0} onChange={e => handleChange(p.id, 'triples', e.target.value)} /></td>
                                                <td><input type="number" style={inputStyle} value={cur?.tirosLibres ?? 0} onChange={e => handleChange(p.id, 'tirosLibres', e.target.value)} /></td>
                                                <td><input type="number" style={inputStyle} value={cur?.rebotes ?? 0} onChange={e => handleChange(p.id, 'rebotes', e.target.value)} /></td>
                                                <td><input type="number" style={inputStyle} value={cur?.bloqueos ?? 0} onChange={e => handleChange(p.id, 'bloqueos', e.target.value)} /></td>
                                                <td><input type="number" style={inputStyle} value={cur?.robos ?? 0} onChange={e => handleChange(p.id, 'robos', e.target.value)} /></td>
                                            </>
                                        ) : (
                                            <>
                                                <td>{p.dobles ?? 0}</td>
                                                <td>{p.triples ?? 0}</td>
                                                <td>{p.tirosLibres ?? 0}</td>
                                                <td>{p.rebotes ?? 0}</td>
                                                <td>{p.bloqueos ?? p.tapones ?? 0}</td>
                                                <td>{p.robos ?? 0}</td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })}
                            {players.length === 0 && (
                                <tr><td colSpan={8} style={{ padding: 16, color: '#94a3b8', fontStyle: 'italic', fontSize: '0.75rem' }}>Sin estadísticas registradas</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
            <div style={{ background: '#fff', width: '100%', maxWidth: 720, borderRadius: 14, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
                <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900 }}>{isEditing ? '✏️ EDITAR ESTADÍSTICAS' : '📊 BOX SCORE'}</h3>
                        <p style={{ margin: '2px 0 0', fontSize: '0.65rem', color: '#64748b' }}>
                            {match.equipoLocalNombre} {match.marcadorLocal ?? '—'} – {match.marcadorVisitante ?? '—'} {match.equipoVisitanteNombre}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {rol === 'admin' && (
                            isEditing
                                ? <button onClick={saveChanges} style={btnStyle('#10b981')}>💾 GUARDAR</button>
                                : <button onClick={() => setIsEditing(true)} style={btnStyle('#f59e0b')}>✏️ EDITAR</button>
                        )}
                        <button onClick={onClose} style={btnStyle('#e2e8f0', '#334155')}>CERRAR</button>
                    </div>
                </div>

                <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
                    {!loading && mvp && !isEditing && (
                        <div style={{ background: 'linear-gradient(to right, #fff9db, #fffbeb)', padding: '12px 16px', borderRadius: 10, marginBottom: 20, border: '1px solid #fcd34d', display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span style={{ fontSize: '2rem' }}>🏆</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '1px' }}>MVP del Partido</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>{mvp.nombre}</div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>
                                    {(Number(mvp.dobles ?? 0) * 2 + Number(mvp.triples ?? 0) * 3 + Number(mvp.tirosLibres ?? 0))} PTS
                                    {' · '}{mvp.rebotes ?? 0} REB
                                    {' · '}{mvp.robos ?? 0} ROB
                                    {' · '}{mvp.bloqueos ?? mvp.tapones ?? 0} TAP
                                </div>
                            </div>
                            <div style={{ width: 48, height: 48, borderRadius: '50%', border: '2px solid #fcd34d', overflow: 'hidden', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {mvp.fotoUrl ? (
                                    <img src={mvp.fotoUrl} alt={mvp.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                                ) : (
                                    <span style={{ fontWeight: 900, fontSize: '1.3rem', color: 'white' }}>
                                        {(mvp.nombre || '?').charAt(0).toUpperCase()}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                    {/* Tabla de cuartos */}
                    {(match.cuartosLocal || match.cuartosVisitante) && (
                        <div style={{ marginBottom: 20, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'center' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <th style={{ textAlign: 'left', padding: '8px 14px', fontWeight: 800, color: '#64748b', fontSize: '0.65rem' }}>EQUIPO</th>
                                        {['Q1','Q2','Q3','Q4'].map(q => (
                                            <th key={q} style={{ padding: '8px', fontWeight: 900, color: '#1e3a8a', fontSize: '0.65rem' }}>{q}</th>
                                        ))}
                                        <th style={{ padding: '8px', fontWeight: 900, color: '#0f172a', fontSize: '0.7rem' }}>TOT</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ textAlign: 'left', padding: '8px 14px', fontWeight: 700, fontSize: '0.72rem' }}>{match.equipoLocalNombre}</td>
                                        {['Q1','Q2','Q3','Q4'].map(q => (
                                            <td key={q} style={{ padding: '8px', color: '#3b82f6', fontWeight: 700 }}>
                                                {match.cuartosLocal?.[q] ?? 0}
                                            </td>
                                        ))}
                                        <td style={{ fontWeight: 900, fontSize: '0.9rem' }}>{match.marcadorLocal ?? 0}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ textAlign: 'left', padding: '8px 14px', fontWeight: 700, fontSize: '0.72rem' }}>{match.equipoVisitanteNombre}</td>
                                        {['Q1','Q2','Q3','Q4'].map(q => (
                                            <td key={q} style={{ padding: '8px', color: '#ef4444', fontWeight: 700 }}>
                                                {match.cuartosVisitante?.[q] ?? 0}
                                            </td>
                                        ))}
                                        <td style={{ fontWeight: 900, fontSize: '0.9rem' }}>{match.marcadorVisitante ?? 0}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}

                    {loading
                        ? <p style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Cargando estadísticas...</p>
                        : <>
                            {renderTeamTable(match.equipoLocalNombre, match.equipoLocalId)}
                            {renderTeamTable(match.equipoVisitanteNombre, match.equipoVisitanteId)}
                        </>
                    }
                </div>
            </div>
        </div>
    );
});

const btnStyle = (bg: string, color = 'white'): React.CSSProperties => ({
    background: bg, color, border: 'none', borderRadius: 8,
    padding: '8px 14px', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer',
});

// ─────────────────────────────────────────────
// COMPONENTE: Tarjeta de partido individual
// ─────────────────────────────────────────────
const MatchCard = memo(({
    m, getLogo, rol, onBoxScore, onEdit, onDelete,
}: {
    m: Match;
    getLogo: (id?: string, nombre?: string) => string | undefined;
    rol?: string;
    onBoxScore: (m: Match) => void;
    onEdit: (m: Match) => void;
    onDelete: (id: string) => void;
}) => {
    const isFinished = m.estatus === 'finalizado';
    const isPlayoff = esFasePlayoff(m.fase);
    const localGana = isFinished && Number(m.marcadorLocal) > Number(m.marcadorVisitante);
    const visitanteGana = isFinished && Number(m.marcadorVisitante) > Number(m.marcadorLocal);

    const themeColor = isPlayoff ? '#ef4444'
        : m.grupo?.toUpperCase() === 'A' ? '#3b82f6'
        : m.grupo?.toUpperCase() === 'B' ? '#f59e0b'
        : '#10b981';

    return (
        <div style={{
            display: 'flex', background: '#fff', borderRadius: 12,
            border: `1.5px solid ${themeColor}25`,
            overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
            transition: 'box-shadow 0.2s',
        }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)')}
        >
            <div style={{
                width: 62, flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                justifyContent: 'center', alignItems: 'center',
                background: `${themeColor}12`, gap: 3, padding: '8px 0',
            }}>
                {isPlayoff && (
                    <span style={{ fontSize: '0.45rem', fontWeight: 900, color: themeColor, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                        {m.fase?.toUpperCase()}
                    </span>
                )}
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: isFinished ? '#10b981' : themeColor }}>
                    {isFinished ? 'FINAL' : (m.hora ?? 'VS')}
                </span>
            </div>

            <div style={{ flex: 1, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', border: '1px solid #f1f5f9', flexShrink: 0 }}>
                            <TeamLogo logoUrl={getLogo(m.equipoLocalId, m.equipoLocalNombre)} />
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: localGana ? 900 : 500, color: localGana ? '#0f172a' : '#475569' }}>
                            {m.equipoLocalNombre}
                        </span>
                    </div>
                    {isFinished && (
                        <span style={{ fontWeight: 900, fontSize: '0.95rem', color: localGana ? '#0f172a' : '#94a3b8' }}>
                            {m.marcadorLocal}
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 22, height: 22, borderRadius: '50%', overflow: 'hidden', border: '1px solid #f1f5f9', flexShrink: 0 }}>
                            <TeamLogo logoUrl={getLogo(m.equipoVisitanteId, m.equipoVisitanteNombre)} />
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: visitanteGana ? 900 : 500, color: visitanteGana ? '#0f172a' : '#475569' }}>
                            {m.equipoVisitanteNombre}
                        </span>
                    </div>
                    {isFinished && (
                        <span style={{ fontWeight: 900, fontSize: '0.95rem', color: visitanteGana ? '#0f172a' : '#94a3b8' }}>
                            {m.marcadorVisitante}
                        </span>
                    )}
                </div>
            </div>

            <div style={{ width: 72, borderLeft: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '8px 0' }}>
                {isFinished ? (
                    <button onClick={() => onBoxScore(m)} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.65rem', fontWeight: 800, cursor: 'pointer', letterSpacing: '0.5px' }}>
                        📊 STATS
                    </button>
                ) : (
                    <span style={{ fontSize: '0.6rem', color: '#cbd5e1', textAlign: 'center' }}>PRÓXIMO</span>
                )}
                {rol === 'admin' && (
                    <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => onEdit(m)} style={{ background: 'none', border: 'none', fontSize: '0.9rem', cursor: 'pointer', padding: '2px 4px' }}>✏️</button>
                        <button onClick={() => onDelete(m.id)} style={{ background: 'none', border: 'none', fontSize: '0.9rem', cursor: 'pointer', padding: '2px 4px' }}>🗑️</button>
                    </div>
                )}
            </div>
        </div>
    );
});

// ─────────────────────────────────────────────
// COMPONENTE: Separador de fecha
// ─────────────────────────────────────────────
const DateDivider = ({ fecha, isToday, isFuture }: { fecha: string; isToday: boolean; isFuture: boolean }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 10px' }}>
        <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: isToday ? '#1e3a8a' : '#f8fafc',
            border: `1px solid ${isToday ? '#1e3a8a' : '#e2e8f0'}`,
            borderRadius: 20, padding: '4px 12px',
        }}>
            {isToday && <span style={{ fontSize: '0.6rem' }}>📍</span>}
            {isFuture && !isToday && <span style={{ fontSize: '0.6rem' }}>📅</span>}
            <span style={{ fontSize: '0.65rem', fontWeight: 900, color: isToday ? 'white' : '#475569', textTransform: 'capitalize' }}>
                {isToday ? 'HOY — ' : ''}{formatFecha(fecha)}
            </span>
        </div>
        <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
    </div>
);

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
type FilterType = 'TODOS' | 'A' | 'B' | 'PLAYOFFS' | 'PENDIENTES' | 'FINALIZADOS';

const CalendarViewer: React.FC<{ rol?: string; onClose: () => void; categoria: string }> = ({
    rol, onClose, categoria,
}) => {
    const [matches, setMatches]               = useState<Match[]>([]);
    const [equipos, setEquipos]               = useState<Equipo[]>([]);
    const [loading, setLoading]               = useState(true);
    const [showMatchForm, setShowMatchForm]   = useState(false);
    const [selectedBoxScore, setSelectedBoxScore] = useState<Match | null>(null);
    const [activeFilter, setActiveFilter]     = useState<FilterType>('TODOS');
    const [matchToEdit, setMatchToEdit]       = useState<Match | null>(null);

    const today = new Date().toISOString().split('T')[0];

    useEffect(() => {
        setLoading(true);
        const catStr = categoria.trim().toUpperCase();
        const isMaster = catStr === 'MASTER40' || catStr === 'MASTER';
        const colCal = getColName('calendario', categoria);
        const colEq  = getColName('equipos',    categoria);

        const qM = query(collection(db, colCal), orderBy('fechaAsignada', 'asc'));
        const unsubM = onSnapshot(qM, snap => {
            let all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
            if (isMaster) {
                const EXCLUIR = new Set(['U19', 'FEMENINO', 'LIBRE', 'INTERINDUSTRIAL']);
                all = all.filter(m => !EXCLUIR.has((m.categoria ?? '').trim().toUpperCase()));
            }
            all.sort((a, b) =>
                a.fechaAsignada.localeCompare(b.fechaAsignada) ||
                (a.hora ?? '').localeCompare(b.hora ?? '')
            );
            setMatches(all);
            setLoading(false);
        });

        const qE = query(collection(db, colEq), orderBy('nombre', 'asc'));
        const unsubE = onSnapshot(qE, snap =>
            setEquipos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Equipo)))
        );

        return () => { unsubM(); unsubE(); };
    }, [categoria]);

    const getLogo = (teamId?: string, teamName?: string): string | undefined => {
        const porId = equipos.find(e => e.id === teamId?.toString());
        if (porId?.logoUrl) return porId.logoUrl;
        const porNombre = equipos.find(e =>
            e.nombre?.trim().toUpperCase() === teamName?.trim().toUpperCase()
        );
        return porNombre?.logoUrl ?? DEFAULT_LOGO;
    };

    const handleDelete = (id: string) => {
        if (!window.confirm('¿Eliminar partido? También se borrarán sus estadísticas.')) return;
        const colCal = getColName('calendario', categoria);
        const doDelete = async () => {
            const batch = writeBatch(db);
            const statsSnap = await getDocs(query(collection(db, 'stats_partido'), where('partidoId', '==', id)));
            statsSnap.forEach(d => batch.delete(d.ref));
            const jugadasSnap = await getDocs(query(collection(db, 'jugadas_partido'), where('partidoId', '==', id)));
            jugadasSnap.forEach(d => batch.delete(d.ref));
            batch.delete(doc(db, colCal, id));
            await batch.commit();
        };
        doDelete().catch(console.error);
    };

    const filtered = useMemo(() => {
        return matches.filter(m => {
            switch (activeFilter) {
                case 'TODOS':       return true;
                case 'PLAYOFFS':    return esFasePlayoff(m.fase);
                case 'PENDIENTES':  return m.estatus !== 'finalizado';
                case 'FINALIZADOS': return m.estatus === 'finalizado';
                case 'A':           return m.grupo?.toUpperCase() === 'A';
                case 'B':           return m.grupo?.toUpperCase() === 'B';
                default:            return true;
            }
        });
    }, [matches, activeFilter]);

    const grupos = useMemo(() => agruparPorFecha(filtered), [filtered]);

    const filters: { id: FilterType; label: string }[] = [
        { id: 'TODOS',       label: 'Todos' },
        { id: 'PENDIENTES',  label: 'Próximos' },
        { id: 'FINALIZADOS', label: 'Resultados' },
        { id: 'PLAYOFFS',    label: '🔥 Playoffs' },
        { id: 'A',           label: 'Grupo A' },
        { id: 'B',           label: 'Grupo B' },
    ];

    return (
        <div style={{ position: 'fixed', inset: 0, background: '#f3f4f6', zIndex: 1000, display: 'flex', flexDirection: 'column', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

            {selectedBoxScore && (
                <BoxScoreModal
                    match={selectedBoxScore}
                    onClose={() => setSelectedBoxScore(null)}
                    getLogo={getLogo}
                    rol={rol}
                />
            )}

            {/* Header */}
            <div style={{ background: '#fff', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>
                        📅 Calendario {categoria}
                    </h2>
                    <p style={{ margin: '2px 0 0', fontSize: '0.6rem', color: '#94a3b8' }}>Liga Metropolitana Eje Este</p>
                </div>
                <button onClick={onClose} style={{ background: 'none', color: '#3b82f6', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}>
                    ← VOLVER
                </button>
            </div>

            {/* Filtros */}
            <div className="no-scrollbar" style={{ background: '#fff', padding: '10px 16px', display: 'flex', gap: 8, overflowX: 'auto', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
                {filters.map(f => (
                    <button key={f.id} onClick={() => setActiveFilter(f.id)} style={{
                        padding: '6px 14px', borderRadius: 20, whiteSpace: 'nowrap',
                        border: activeFilter === f.id ? '1px solid #1e3a8a' : '1px solid #e2e8f0',
                        background: activeFilter === f.id ? '#1e3a8a' : '#fff',
                        color: activeFilter === f.id ? '#fff' : '#64748b',
                        fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                    }}>
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Lista */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 100px' }}>
                <div style={{ maxWidth: 680, margin: '0 auto' }}>

                    {rol === 'admin' && (
                        <button
                            onClick={() => { setMatchToEdit(null); setShowMatchForm(true); }}
                            style={{
                                width: '100%', marginTop: 16, padding: '12px',
                                background: '#fff', border: '1.5px dashed #cbd5e1',
                                borderRadius: 10, fontWeight: 700, fontSize: '0.78rem',
                                color: '#475569', cursor: 'pointer', transition: 'border-color 0.2s, color 0.2s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#1e3a8a'; e.currentTarget.style.color = '#1e3a8a'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#475569'; }}
                        >
                            ➕ Programar nuevo partido
                        </button>
                    )}

                    {loading && (
                        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: '0.85rem' }}>Cargando calendario...</div>
                    )}

                    {!loading && grupos.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>
                                {activeFilter === 'PLAYOFFS' ? '🏆' : activeFilter === 'PENDIENTES' ? '📅' : '🏀'}
                            </div>
                            <p style={{ fontWeight: 700, color: '#475569', fontSize: '0.85rem', margin: 0 }}>
                                {activeFilter === 'PLAYOFFS' ? 'No hay partidos de playoffs registrados'
                                    : activeFilter === 'PENDIENTES' ? 'No hay partidos próximos'
                                    : activeFilter === 'FINALIZADOS' ? 'No hay resultados aún'
                                    : `No hay partidos para ${activeFilter}`}
                            </p>
                            {activeFilter !== 'TODOS' && (
                                <button onClick={() => setActiveFilter('TODOS')} style={{ marginTop: 12, background: 'none', border: '1px solid #e2e8f0', color: '#64748b', padding: '6px 14px', borderRadius: 20, fontSize: '0.7rem', cursor: 'pointer' }}>
                                    Ver todos
                                </button>
                            )}
                        </div>
                    )}

                    {!loading && grupos.map(({ fecha, partidos }) => {
                        const isToday = fecha === today;
                        const isFuture = fecha > today;
                        return (
                            <div key={fecha}>
                                <DateDivider fecha={fecha} isToday={isToday} isFuture={isFuture} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {partidos.map(m => (
                                        <MatchCard
                                            key={m.id} m={m} getLogo={getLogo} rol={rol}
                                            onBoxScore={setSelectedBoxScore}
                                            onEdit={match => { setMatchToEdit(match); setShowMatchForm(true); }}
                                            onDelete={handleDelete}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Modal MatchForm inline */}
            {showMatchForm && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 14, overflow: 'hidden', maxHeight: '90vh', overflowY: 'auto' }}>
                        <MatchForm
                            matchToEdit={matchToEdit}
                            categoriaActiva={categoria}
                            equipos={equipos}
                            onSuccess={() => setShowMatchForm(false)}
                            onClose={() => setShowMatchForm(false)}
                        />
                    </div>
                </div>
            )}

            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
};

export default CalendarViewer;