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
    partidos: Match[];
    onSuccess: () => void;
    onClose: () => void;
}> = ({ matchToEdit, categoriaActiva, equipos, partidos, onSuccess, onClose }) => {
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

    // ── Rivales disponibles: mismo grupo y que no se hayan enfrentado aún ──
    const rivalesdisponibles = useMemo(() => {
        // En playoffs no filtramos — cualquier rival puede jugar
        if (!localId || fase !== 'REGULAR') return equipos.filter(e => e.id !== localId);

        // Construir set de equipos ya enfrentados por localId en fase regular
        const yaEnfrentados = new Set<string>();
        partidos
            .filter(p =>
                p.fase?.toUpperCase() === 'REGULAR' &&
                p.id !== matchToEdit?.id
            )
            .forEach(p => {
                if (p.equipoLocalId === localId && p.equipoVisitanteId)
                    yaEnfrentados.add(p.equipoVisitanteId);
                if (p.equipoVisitanteId === localId && p.equipoLocalId)
                    yaEnfrentados.add(p.equipoLocalId);
            });

        // Obtener el grupo del equipo local buscando en los partidos existentes
        // (el equipo local tiene el mismo grupo que sus partidos anteriores)
        let grupoLocal = grupo; // usa el grupo seleccionado en el form si existe
        if (!grupoLocal) {
            // Intentar inferir el grupo del equipo local desde partidos anteriores
            const partidoDelLocal = partidos.find(p =>
                p.fase?.toUpperCase() === 'REGULAR' && p.grupo &&
                (p.equipoLocalId === localId || p.equipoVisitanteId === localId)
            );
            grupoLocal = partidoDelLocal?.grupo ?? '';
        }

        return equipos.filter(e => {
            if (e.id === localId) return false;           // no contra sí mismo
            if (yaEnfrentados.has(e.id)) return false;   // ya se enfrentaron

            // Si sabemos el grupo, filtrar por mismo grupo
            if (grupoLocal) {
                // Buscar en qué grupo juega este equipo rival
                const partidoDelRival = partidos.find(p =>
                    p.fase?.toUpperCase() === 'REGULAR' && p.grupo &&
                    (p.equipoLocalId === e.id || p.equipoVisitanteId === e.id)
                );
                const grupoRival = partidoDelRival?.grupo ?? '';
                if (grupoRival && grupoRival !== grupoLocal) return false;
            }

            return true;
        });
    }, [localId, fase, grupo, partidos, equipos, matchToEdit]);

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
                    <label style={labelStyle}>
                        Equipo Visitante
                        {fase === 'REGULAR' && localId && rivalesdisponibles.length < equipos.length - 1 && (
                            <span style={{ marginLeft: 6, fontSize: '0.55rem', background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                                {rivalesdisponibles.length} disponibles
                            </span>
                        )}
                    </label>
                    <select style={inputStyle} value={visitanteId} onChange={e => setVisitanteId(e.target.value)}>
                        <option value="">Seleccionar...</option>
                        {(fase === 'REGULAR' && localId ? rivalesdisponibles : equipos.filter(e => e.id !== localId))
                            .map(eq => <option key={eq.id} value={eq.id}>{eq.nombre}</option>)}
                    </select>
                    {fase === 'REGULAR' && localId && rivalesdisponibles.length === 0 && (
                        <p style={{ margin: '4px 0 0', fontSize: '0.62rem', color: '#ef4444', fontWeight: 700 }}>
                            ⚠️ Este equipo ya se enfrentó a todos en fase regular
                        </p>
                    )}
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

    const [sharing, setSharing] = useState(false);

    // Fetch imagen como blob → base64 (evita bloqueo CORS de Firebase Storage en canvas)
    const toBase64 = async (url: string): Promise<string> => {
        if (!url) return '';
        try {
            const res = await fetch(url);
            if (!res.ok) return '';
            const blob = await res.blob();
            return new Promise(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror  = () => resolve('');
                reader.readAsDataURL(blob);
            });
        } catch { return ''; }
    };

    const compartirResultado = async () => {
        setSharing(true);
        try {
            const W = 800, H = 500;
            const canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            const ctx = canvas.getContext('2d')!;

            // Carga imagen remota como base64 (funciona con CORS configurado)
            const loadRemoteImg = (url: string): Promise<HTMLImageElement | null> =>
                new Promise(async resolve => {
                    try {
                        const res = await fetch(url);
                        if (!res.ok) { resolve(null); return; }
                        const blob = await res.blob();
                        const b64 = await new Promise<string>(r => {
                            const fr = new FileReader();
                            fr.onloadend = () => r(fr.result as string);
                            fr.onerror   = () => r('');
                            fr.readAsDataURL(blob);
                        });
                        if (!b64) { resolve(null); return; }
                        const img = new Image();
                        img.onload  = () => resolve(img);
                        img.onerror = () => resolve(null);
                        img.src = b64;
                    } catch { resolve(null); }
                });

            const PALETTE = ['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#8b5cf6','#ec4899','#06b6d4','#84cc16'];

            // Dibuja imagen circular con fallback a iniciales
            const drawCircleImg = async (url: string | undefined, name: string, cx: number, cy: number, r: number, borderColor = 'rgba(255,255,255,0.3)', borderW = 1.5) => {
                let h = 0;
                for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % PALETTE.length;
                const color = PALETTE[Math.abs(h)];
                const img = url ? await loadRemoteImg(url) : null;
                ctx.save();
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                if (img) {
                    ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip();
                    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
                } else {
                    const gr = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
                    gr.addColorStop(0, color + 'ff'); gr.addColorStop(1, color + '99');
                    ctx.fillStyle = gr; ctx.fill(); ctx.clip();
                    const words = name.trim().split(' ');
                    const initials = words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
                    ctx.font = 'bold ' + Math.round(r * 0.72) + 'px system-ui';
                    ctx.fillStyle = 'white'; ctx.textAlign = 'center';
                    ctx.fillText(initials, cx, cy + r * 0.27);
                }
                ctx.restore();
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.strokeStyle = borderColor; ctx.lineWidth = borderW; ctx.stroke();
            };

            // Color único por nombre de equipo
            const teamColor = (name: string) => {
                let h = 0;
                for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % PALETTE.length;
                return PALETTE[Math.abs(h)];
            };

            // Círculo con iniciales del equipo
            const drawTeamBadge = (name: string, cx: number, cy: number, r: number, winner: boolean) => {
                const color = teamColor(name);
                const words = name.trim().split(' ');
                const initials = words.length >= 2
                    ? (words[0][0] + words[1][0]).toUpperCase()
                    : name.substring(0, 2).toUpperCase();
                // Glow si ganador
                if (winner) { ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 30; }
                // Relleno
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                const gr = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
                gr.addColorStop(0, color + 'ff');
                gr.addColorStop(1, color + '99');
                ctx.fillStyle = gr; ctx.fill();
                if (winner) ctx.restore();
                // Borde
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.strokeStyle = winner ? '#fbbf24' : 'rgba(255,255,255,0.25)';
                ctx.lineWidth = winner ? 3 : 1.5; ctx.stroke();
                // Iniciales
                ctx.font = `bold ${Math.round(r * 0.72)}px system-ui`;
                ctx.fillStyle = 'white'; ctx.textAlign = 'center';
                ctx.fillText(initials, cx, cy + r * 0.27);
            };

            // Círculo MVP dorado
            const drawMvpBadge = (name: string, cx: number, cy: number, r: number) => {
                ctx.save(); ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 20;
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                const gr = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
                gr.addColorStop(0, '#fde68a'); gr.addColorStop(1, '#b45309');
                ctx.fillStyle = gr; ctx.fill(); ctx.restore();
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.stroke();
                ctx.font = `bold ${Math.round(r * 0.85)}px system-ui`;
                ctx.fillStyle = 'white'; ctx.textAlign = 'center';
                ctx.fillText((name || '?').charAt(0).toUpperCase(), cx, cy + r * 0.32);
            };

            // ── Fondo ──
            const bg = ctx.createLinearGradient(0, 0, W, H);
            bg.addColorStop(0, '#050d20'); bg.addColorStop(0.5, '#0d1f5c'); bg.addColorStop(1, '#050d20');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
            // Puntos
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            for (let x = 0; x < W; x += 20) for (let y = 0; y < H; y += 20) ctx.fillRect(x, y, 2, 2);

            // ── Logo liga (con fallback a emoji) ──
            const LIGA_LOGO = 'https://i.postimg.cc/FKgNmFpv/Whats_App_Image_2026_01_25_at_12_07_36_AM.jpg';
            const ligaImg = await loadRemoteImg(LIGA_LOGO);
            if (ligaImg) {
                const lr = 38;
                ctx.save();
                ctx.beginPath(); ctx.arc(W / 2, 46, lr, 0, Math.PI * 2);
                ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip();
                ctx.drawImage(ligaImg, W / 2 - lr, 46 - lr, lr * 2, lr * 2);
                ctx.restore();
                ctx.beginPath(); ctx.arc(W / 2, 46, lr, 0, Math.PI * 2);
                ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.stroke();
            } else {
                ctx.font = '52px system-ui'; ctx.textAlign = 'center';
                ctx.fillText('🏀', W / 2, 58);
            }

            // ── Título ──
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 24px system-ui';
            ctx.fillText('LIGA METROPOLITANA EJE ESTE', W / 2, 108);
            ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '13px system-ui';
            ctx.fillText(`${(match.categoria || '').toUpperCase()}  ·  ${match.fechaAsignada || ''}`, W / 2, 128);

            // Línea dorada
            const gl = ctx.createLinearGradient(80, 0, W - 80, 0);
            gl.addColorStop(0, 'transparent'); gl.addColorStop(0.35, 'rgba(251,191,36,0.5)');
            gl.addColorStop(0.65, 'rgba(251,191,36,0.5)'); gl.addColorStop(1, 'transparent');
            ctx.strokeStyle = gl; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(80, 140); ctx.lineTo(W - 80, 140); ctx.stroke();

            const localGana = (match.marcadorLocal ?? 0) > (match.marcadorVisitante ?? 0);
            const visitGana = (match.marcadorVisitante ?? 0) > (match.marcadorLocal ?? 0);

            // Truncar texto al ancho máximo
            const fitText = (text: string, maxW: number, font: string) => {
                ctx.font = font;
                if (ctx.measureText(text).width <= maxW) return text;
                let t = text;
                while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
                return t + '…';
            };

            // ── Zona de equipos: local izquierda, visitante derecha ──
            // Logo centrado en x=170 y x=W-170, nombre debajo a 2 líneas si largo
            const logoLocalUrl  = getLogo(match.equipoLocalId,     match.equipoLocalNombre);
            const logoVisitUrl  = getLogo(match.equipoVisitanteId, match.equipoVisitanteNombre);
            const LX = 190, RX = W - 190, LY = 240, R = 52;

            await drawCircleImg(logoLocalUrl,  match.equipoLocalNombre,  LX, LY, R, localGana ? '#fbbf24' : 'rgba(255,255,255,0.2)', localGana ? 3 : 1.5);
            await drawCircleImg(logoVisitUrl,  match.equipoVisitanteNombre, RX, LY, R, visitGana ? '#fbbf24' : 'rgba(255,255,255,0.2)', visitGana ? 3 : 1.5);

            // Nombres de equipos — dos líneas si no caben
            const drawTeamName = (name: string, cx: number, startY: number, winner: boolean) => {
                ctx.fillStyle = winner ? '#fbbf24' : 'rgba(255,255,255,0.9)';
                ctx.textAlign = 'center';
                const maxW = 270;
                const font = 'bold 16px system-ui';
                ctx.font = font;
                const upper = name.toUpperCase();
                if (ctx.measureText(upper).width <= maxW) {
                    ctx.fillText(upper, cx, startY);
                } else {
                    // Cortar en palabras
                    const words = upper.split(' ');
                    let line1 = '', line2 = '';
                    for (const w of words) {
                        if (ctx.measureText(line1 + ' ' + w).width <= maxW) line1 = (line1 + ' ' + w).trim();
                        else line2 = (line2 + ' ' + w).trim();
                    }
                    ctx.fillText(line1, cx, startY);
                    if (line2) ctx.fillText(line2, cx, startY + 18);
                }
            };
            drawTeamName(match.equipoLocalNombre,     LX, LY + R + 16, localGana);
            drawTeamName(match.equipoVisitanteNombre, RX, LY + R + 16, visitGana);

            // ── Caja marcador central ──
            const MBW = 230, MBH = 108, MBX = W / 2 - MBW / 2, MBY = 168;
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.beginPath(); ctx.roundRect(MBX, MBY, MBW, MBH, 18); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(MBX, MBY, MBW, MBH, 18); ctx.stroke();

            ctx.textAlign = 'center';
            // Marcador local
            ctx.font = 'bold 74px system-ui';
            ctx.fillStyle = localGana ? '#fbbf24' : 'white';
            ctx.fillText(String(match.marcadorLocal ?? 0), W / 2 - 58, 258);
            // Guión visible
            ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = 'bold 40px system-ui';
            ctx.fillText('-', W / 2, 254);
            // Marcador visitante
            ctx.font = 'bold 74px system-ui';
            ctx.fillStyle = visitGana ? '#fbbf24' : 'white';
            ctx.fillText(String(match.marcadorVisitante ?? 0), W / 2 + 58, 258);
            // Etiqueta finalizado
            ctx.fillStyle = '#10b981'; ctx.font = 'bold 11px system-ui';
            ctx.fillText('✓  FINALIZADO', W / 2, 276);

            // ── Cuartos ──
            const qL = (match as any).cuartosLocal;
            const qV = (match as any).cuartosVisitante;
            if (qL || qV) {
                const qs = ['Q1','Q2','Q3','Q4'];
                const cw = 80; const sx = W / 2 - (qs.length * cw) / 2; const ry = 310;
                // Fondo cuartos
                ctx.fillStyle = 'rgba(255,255,255,0.04)';
                ctx.beginPath(); ctx.roundRect(sx - 10, ry - 12, qs.length * cw + 20, 52, 8); ctx.fill();
                ctx.font = 'bold 10px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.35)';
                qs.forEach((q, i) => { ctx.textAlign = 'center'; ctx.fillText(q, sx + i * cw + cw / 2, ry); });
                ctx.font = 'bold 16px system-ui';
                qs.forEach((q, i) => {
                    const lv = qL?.[q] ?? 0; const vv = qV?.[q] ?? 0;
                    ctx.fillStyle = lv > vv ? '#60a5fa' : 'rgba(255,255,255,0.65)';
                    ctx.fillText(String(lv), sx + i * cw + cw / 2, ry + 18);
                    ctx.fillStyle = vv > lv ? '#f87171' : 'rgba(255,255,255,0.65)';
                    ctx.fillText(String(vv), sx + i * cw + cw / 2, ry + 35);
                });
            }

            // ── MVP ──
            if (mvp) {
                const hasQ = !!(qL || qV);
                const mvpY = hasQ ? 380 : 320;
                const mvpPts = Number(mvp.dobles ?? 0) * 2 + Number(mvp.triples ?? 0) * 3 + Number(mvp.tirosLibres ?? 0);
                // Foto centrada en x, banner centrado también
                const pr = 28;
                const bannerW = 420, bannerH = 66;
                const bannerX = W / 2 - bannerW / 2;
                const pcy = mvpY + bannerH / 2;
                const px  = bannerX + pr + 8;

                // Fondo MVP
                ctx.fillStyle = 'rgba(251,191,36,0.1)';
                ctx.beginPath(); ctx.roundRect(bannerX, mvpY, bannerW, bannerH, 12); ctx.fill();
                ctx.strokeStyle = 'rgba(251,191,36,0.3)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.roundRect(bannerX, mvpY, bannerW, bannerH, 12); ctx.stroke();

                await drawCircleImg(mvp.fotoUrl, mvp.nombre, px, pcy, pr, '#fbbf24', 2.5);

                ctx.textAlign = 'left';
                ctx.font = 'bold 11px system-ui'; ctx.fillStyle = '#fbbf24';
                ctx.fillText('🏆  MVP DEL PARTIDO', px + pr + 12, mvpY + 18);
                ctx.font = 'bold 18px system-ui'; ctx.fillStyle = 'white';
                ctx.fillText(fitText(mvp.nombre.toUpperCase(), 290, 'bold 18px system-ui'), px + pr + 12, mvpY + 38);
                ctx.font = '13px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
                ctx.fillText(`${mvpPts} PTS  ·  ${mvp.rebotes ?? 0} REB  ·  ${mvp.robos ?? 0} ROB`, px + pr + 12, mvpY + 56);
            }

            // ── Footer ──
            ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
            ctx.fillText('Liga Metropolitana Eje Este  ·  San Mateo, Aragua', W / 2, H - 14);

            // ── Compartir / Descargar ──
            canvas.toBlob(async (blob) => {
                if (!blob) return;
                const file = new File([blob], 'resultado.png', { type: 'image/png' });
                try {
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: `${match.equipoLocalNombre} ${match.marcadorLocal} - ${match.marcadorVisitante} ${match.equipoVisitanteNombre}` });
                    } else {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = 'resultado.png'; a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 2000);
                    }
                } catch {}
                setSharing(false);
            }, 'image/png');
        } catch (e) { console.error(e); setSharing(false); }
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
                        {match.estatus === 'finalizado' && !isEditing && (
                            <button
                                onClick={compartirResultado}
                                disabled={sharing}
                                style={btnStyle('#1e3a8a', 'white')}
                            >
                                {sharing ? '⏳...' : '📤 COMPARTIR'}
                            </button>
                        )}
                        {rol === 'admin' && (
                            isEditing
                                ? <button onClick={saveChanges} style={btnStyle('#10b981')}>💾 GUARDAR</button>
                                : <button onClick={() => setIsEditing(true)} style={btnStyle('#f59e0b')}>✏️ EDITAR</button>
                        )}
                        <button onClick={onClose} style={btnStyle('#e2e8f0', '#334155')}>CERRAR</button>
                    </div>
                </div>

                <div style={{ padding: '16px 20px 80px', overflowY: 'auto', flex: 1 }}>
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
    const [sharing, setSharing] = useState(false);
    const isFinished = m.estatus === 'finalizado';

    const compartirPartido = async () => {
        setSharing(true);
        try {
            const W = 600, H = 340;
            const canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            const ctx = canvas.getContext('2d')!;

            const loadImg = (url: string): Promise<HTMLImageElement | null> =>
                new Promise(async resolve => {
                    try {
                        const res = await fetch(url);
                        if (!res.ok) { resolve(null); return; }
                        const blob = await res.blob();
                        const b64 = await new Promise<string>(r => {
                            const fr = new FileReader();
                            fr.onloadend = () => r(fr.result as string);
                            fr.onerror = () => r('');
                            fr.readAsDataURL(blob);
                        });
                        if (!b64) { resolve(null); return; }
                        const img = new Image();
                        img.onload = () => resolve(img);
                        img.onerror = () => resolve(null);
                        img.src = b64;
                    } catch { resolve(null); }
                });

            // ── Fondo ──
            const bg = ctx.createLinearGradient(0, 0, W, H);
            bg.addColorStop(0, '#020c1b');
            bg.addColorStop(0.5, '#0d1f4a');
            bg.addColorStop(1, '#020c1b');
            ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

            // Puntos decorativos
            ctx.fillStyle = 'rgba(255,255,255,0.025)';
            for (let x = 0; x < W; x += 22) for (let y = 0; y < H; y += 22) ctx.fillRect(x, y, 2, 2);

            // Línea superior naranja
            const lineGrad = ctx.createLinearGradient(0, 0, W, 0);
            lineGrad.addColorStop(0, 'transparent');
            lineGrad.addColorStop(0.3, '#f97316');
            lineGrad.addColorStop(0.7, '#f97316');
            lineGrad.addColorStop(1, 'transparent');
            ctx.strokeStyle = lineGrad; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(W, 3); ctx.stroke();

            // ── Logo liga ──
            const LIGA_LOGO = 'https://i.postimg.cc/FKgNmFpv/Whats_App_Image_2026_01_25_at_12_07_36_AM.jpg';
            const ligaImg = await loadImg(LIGA_LOGO);
            const lr = 26;
            if (ligaImg) {
                ctx.save();
                ctx.beginPath(); ctx.arc(W/2, 38, lr, 0, Math.PI*2);
                ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip();
                ctx.drawImage(ligaImg, W/2-lr, 38-lr, lr*2, lr*2);
                ctx.restore();
                ctx.beginPath(); ctx.arc(W/2, 38, lr, 0, Math.PI*2);
                ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2; ctx.stroke();
            }

            // ── Encabezado ──
            ctx.textAlign = 'center';
            ctx.font = 'bold 11px system-ui'; ctx.fillStyle = '#94a3b8';
            ctx.fillText('LIGA METROPOLITANA EJE ESTE', W/2, 80);

            // Categoría y fecha
            const fechaFmt = (() => {
                try {
                    const [y, mo, d] = (m.fechaAsignada || '').split('-').map(Number);
                    return new Date(y, mo-1, d).toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
                } catch { return m.fechaAsignada || ''; }
            })();
            ctx.font = 'bold 13px system-ui'; ctx.fillStyle = '#f97316';
            ctx.fillText((m.categoria || '').toUpperCase() + (m.fase && m.fase !== 'REGULAR' ? ' · ' + m.fase.toUpperCase() : ''), W/2, 100);
            ctx.font = '12px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.fillText(fechaFmt.toUpperCase() + (m.hora ? ' · ' + m.hora : ''), W/2, 118);

            // Línea divisoria
            ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(60, 130); ctx.lineTo(W-60, 130); ctx.stroke();

            // ── Logos y nombres de equipos ──
            const drawTeam = async (name: string, id: string|undefined, cx: number, isWinner: boolean) => {
                const logoUrl = getLogo(id, name);
                const R = 48;
                const img = logoUrl ? await loadImg(logoUrl) : null;

                ctx.save();
                ctx.beginPath(); ctx.arc(cx, 190, R, 0, Math.PI*2);
                if (img) {
                    ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip();
                    ctx.drawImage(img, cx-R, 190-R, R*2, R*2);
                } else {
                    ctx.fillStyle = '#1e3a8a'; ctx.fill(); ctx.clip();
                    ctx.font = `bold ${R*0.7}px system-ui`;
                    ctx.fillStyle = 'white'; ctx.textAlign = 'center';
                    ctx.fillText(name.charAt(0).toUpperCase(), cx, 190 + R*0.25);
                }
                ctx.restore();

                // Borde
                ctx.beginPath(); ctx.arc(cx, 190, R, 0, Math.PI*2);
                ctx.strokeStyle = isWinner ? '#fbbf24' : 'rgba(255,255,255,0.15)';
                ctx.lineWidth = isWinner ? 3 : 1.5; ctx.stroke();

                // Nombre del equipo
                ctx.textAlign = 'center';
                ctx.font = `${isWinner ? 'bold' : ''} 13px system-ui`;
                ctx.fillStyle = isWinner ? '#fbbf24' : 'rgba(255,255,255,0.85)';
                const maxW = 200;
                const upper = name.toUpperCase();
                if (ctx.measureText(upper).width <= maxW) {
                    ctx.fillText(upper, cx, 254);
                } else {
                    const words = upper.split(' ');
                    let l1 = '', l2 = '';
                    for (const w of words) ctx.measureText(l1+' '+w).width <= maxW ? l1=(l1+' '+w).trim() : l2=(l2+' '+w).trim();
                    ctx.fillText(l1, cx, 250); if (l2) ctx.fillText(l2, cx, 266);
                }
            };

            const localGana = isFinished && (m.marcadorLocal??0) > (m.marcadorVisitante??0);
            const visitGana = isFinished && (m.marcadorVisitante??0) > (m.marcadorLocal??0);

            await drawTeam(m.equipoLocalNombre, m.equipoLocalId, 130, localGana);
            await drawTeam(m.equipoVisitanteNombre, m.equipoVisitanteId, W-130, visitGana);

            // ── Centro: marcador o VS ──
            if (isFinished) {
                ctx.textAlign = 'center';
                ctx.font = 'bold 62px system-ui';
                ctx.fillStyle = localGana ? '#fbbf24' : 'white';
                ctx.fillText(String(m.marcadorLocal ?? 0), W/2 - 44, 202);
                ctx.font = 'bold 28px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.fillText('-', W/2, 196);
                ctx.font = 'bold 62px system-ui';
                ctx.fillStyle = visitGana ? '#fbbf24' : 'white';
                ctx.fillText(String(m.marcadorVisitante ?? 0), W/2 + 44, 202);
                ctx.font = 'bold 11px system-ui'; ctx.fillStyle = '#10b981';
                ctx.fillText('✓  RESULTADO FINAL', W/2, 222);
            } else {
                // VS animado
                const vsGrad = ctx.createRadialGradient(W/2, 185, 0, W/2, 185, 38);
                vsGrad.addColorStop(0, 'rgba(249,115,22,0.25)');
                vsGrad.addColorStop(1, 'rgba(249,115,22,0)');
                ctx.fillStyle = vsGrad;
                ctx.beginPath(); ctx.arc(W/2, 185, 38, 0, Math.PI*2); ctx.fill();
                ctx.font = 'bold 36px system-ui'; ctx.fillStyle = '#f97316'; ctx.textAlign = 'center';
                ctx.fillText('VS', W/2, 197);
                ctx.font = 'bold 15px system-ui'; ctx.fillStyle = '#fbbf24';
                ctx.fillText(m.hora ? '🕐 ' + m.hora : 'PRÓXIMO', W/2, 230);
            }

            // ── Footer ──
            ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
            ctx.fillText('Liga Metropolitana Eje Este  ·  San Mateo, Aragua', W/2, H - 14);

            // ── Compartir ──
            canvas.toBlob(async blob => {
                if (!blob) return;
                const file = new File([blob], 'partido.png', { type: 'image/png' });
                const title = isFinished
                    ? `${m.equipoLocalNombre} ${m.marcadorLocal} - ${m.marcadorVisitante} ${m.equipoVisitanteNombre}`
                    : `${m.equipoLocalNombre} vs ${m.equipoVisitanteNombre} · ${m.fechaAsignada}`;
                try {
                    if (navigator.canShare?.({ files: [file] })) {
                        await navigator.share({ files: [file], title, text: '🏀 Liga Metropolitana Eje Este' });
                    } else {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a'); a.href = url; a.download = 'partido.png'; a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 2000);
                    }
                } catch {}
                setSharing(false);
            }, 'image/png');
        } catch (e) { console.error(e); setSharing(false); }
    };
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
                <button
                    onClick={compartirPartido}
                    disabled={sharing}
                    style={{ background: 'none', border: 'none', color: sharing ? '#cbd5e1' : '#f97316', fontSize: '0.65rem', fontWeight: 800, cursor: sharing ? 'not-allowed' : 'pointer' }}
                >
                    {sharing ? '⏳' : '📤'}
                </button>
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


// ── Selector de categoría portátil ──
const CategoriaBar: React.FC<{
    categoriaActiva: string;
    onCategoriaChange: (cat: string) => void;
}> = ({ categoriaActiva, onCategoriaChange }) => {
    const CATS = [
        { id: 'MASTER40',        label: '🍷 MASTER 40'      },
        { id: 'LIBRE',           label: '🏀 LIBRE'           },
        { id: 'INTERINDUSTRIAL', label: '🏭 INTERINDUSTRIAL' },
        { id: 'U16_FEMENINO',    label: '👧 U16 FEM'         },
        { id: 'U16M',            label: '👦 U16 MASC'        },
    ];
    return (
        <div className="no-scrollbar" style={{
            display: 'flex', gap: 6, overflowX: 'auto',
            padding: '8px 14px', background: '#f8fafc',
            borderBottom: '1px solid #e5e7eb', flexShrink: 0,
        }}>
            {CATS.map(cat => (
                <button key={cat.id} onClick={() => onCategoriaChange(cat.id)} style={{
                    padding: '5px 12px', borderRadius: 20, border: 'none',
                    whiteSpace: 'nowrap', flexShrink: 0,
                    background: categoriaActiva === cat.id ? '#1e3a8a' : '#f1f5f9',
                    color: categoriaActiva === cat.id ? 'white' : '#64748b',
                    fontSize: '0.6rem', fontWeight: 900, cursor: 'pointer', transition: 'all 0.2s',
                }}>
                    {cat.label}
                </button>
            ))}
        </div>
    );
};

const CalendarViewer: React.FC<{ rol?: string; onClose: () => void; categoria: string; onCategoriaChange?: (cat: string) => void }> = ({
    rol, onClose, categoria, onCategoriaChange,
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
        <div style={{ position: 'relative', background: '#f3f4f6', minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

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

            {onCategoriaChange && <CategoriaBar categoriaActiva={categoria} onCategoriaChange={onCategoriaChange} />}

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
                            partidos={matches}
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