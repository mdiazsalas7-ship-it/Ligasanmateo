import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import {
    collection, getDocs, query, where, writeBatch, doc, deleteDoc,
} from 'firebase/firestore';
import type { CategoriaLiga } from './ligaConfig';
import {
    cargarCategorias, guardarCategoria, borrarCategoriaDoc,
    sembrarCategoriasSiVacio, getColName, normalizarCategoria,
} from './ligaConfig';

// ─────────────────────────────────────────────────────────────
// PANEL DE CATEGORÍAS (solo admin)
// Crear, editar, ocultar/mostrar y borrar categorías de la liga.
//
// Ocultar  = quita la categoría del menú pero conserva TODOS sus datos.
// Borrar   = elimina la categoría Y todos sus datos (equipos, jugadores,
//            calendario, stats, jugadas). Irreversible → confirmación por
//            nombre + resumen de lo que se va a borrar.
// ─────────────────────────────────────────────────────────────

const EMOJIS = ['🏀', '👦', '👧', '🏭', '🍷', '⭐', '🔥', '🏆', '🥇', '👶', '🧑', '�", "🎓', '🏫'];

interface Conteo { equipos: number; partidos: number; }

const AdminCategorias: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [cats, setCats]         = useState<CategoriaLiga[]>([]);
    const [loading, setLoading]   = useState(true);
    const [toast, setToast]       = useState<{ msg: string; color: string } | null>(null);

    // formulario nueva/editar
    const [editId, setEditId]     = useState<string | null>(null); // null = crear
    const [fId, setFId]           = useState('');
    const [fEmoji, setFEmoji]     = useState('🏀');
    const [fNombre, setFNombre]   = useState('');
    const [saving, setSaving]     = useState(false);

    // borrado
    const [delTarget, setDelTarget] = useState<CategoriaLiga | null>(null);
    const [delConteo, setDelConteo] = useState<Conteo | null>(null);
    const [delTexto, setDelTexto]   = useState('');
    const [deleting, setDeleting]   = useState(false);

    const showToast = (msg: string, color = '#10b981') => {
        setToast({ msg, color });
        setTimeout(() => setToast(null), 2600);
    };

    const recargar = async () => {
        setLoading(true);
        // pedir TODAS (incluidas las ocultas) para el panel
        const lista = await cargarCategorias(false);
        setCats(lista);
        setLoading(false);
    };

    useEffect(() => {
        // La primera vez, sube la semilla de las 5 categorías fijas a
        // Firestore para que se vuelvan editables.
        (async () => {
            await sembrarCategoriasSiVacio();
            await recargar();
        })();
    }, []);

    // ── Guardar (crear o editar) ──
    const handleGuardar = async () => {
        const nombreLimpio = fNombre.trim();
        if (!nombreLimpio) return showToast('Escribe el nombre de la categoría', '#ef4444');

        // Al crear, el id se deriva del nombre. Al editar, el id no cambia.
        const id = editId || normalizarCategoria(nombreLimpio).replace(/\s+/g, '_');

        // Evitar id duplicado al crear
        if (!editId && cats.some(c => c.id === id)) {
            return showToast('Ya existe una categoría con ese nombre', '#ef4444');
        }

        setSaving(true);
        try {
            const orden = editId
                ? (cats.find(c => c.id === editId)?.orden ?? 999)
                : (cats.length + 1);
            await guardarCategoria({
                id,
                label: `${fEmoji} ${nombreLimpio.toUpperCase()}`,
                orden,
                activa: editId ? (cats.find(c => c.id === editId)?.activa !== false) : true,
            });
            showToast(editId ? '✅ Categoría actualizada' : '✅ Categoría creada');
            limpiarForm();
            await recargar();
        } catch (e: any) {
            showToast(`Error al guardar: ${e?.code || 'desconocido'}`, '#ef4444');
        } finally {
            setSaving(false);
        }
    };

    const limpiarForm = () => {
        setEditId(null); setFId(''); setFEmoji('🏀'); setFNombre('');
    };

    const empezarEditar = (c: CategoriaLiga) => {
        setEditId(c.id);
        setFId(c.id);
        // separar emoji del texto si el label los trae juntos
        const partes = (c.label || '').trim().split(' ');
        if (partes.length > 1 && partes[0].length <= 2) {
            setFEmoji(partes[0]);
            setFNombre(partes.slice(1).join(' '));
        } else {
            setFEmoji('🏀');
            setFNombre(c.label || c.id);
        }
    };

    // ── Ocultar / mostrar ──
    const toggleActiva = async (c: CategoriaLiga) => {
        try {
            await guardarCategoria({ ...c, activa: !(c.activa !== false) });
            showToast(c.activa !== false ? '👁️ Categoría oculta' : '✅ Categoría visible', '#3b82f6');
            await recargar();
        } catch (e: any) {
            showToast(`Error: ${e?.code || 'desconocido'}`, '#ef4444');
        }
    };

    // ── Preparar borrado: contar qué se va a eliminar ──
    const prepararBorrado = async (c: CategoriaLiga) => {
        setDelTarget(c);
        setDelConteo(null);
        setDelTexto('');
        try {
            const colEq  = getColName('equipos', c.id);
            const colCal = getColName('calendario', c.id);
            const [eqSnap, calSnap] = await Promise.all([
                getDocs(collection(db, colEq)),
                getDocs(collection(db, colCal)),
            ]);
            setDelConteo({ equipos: eqSnap.size, partidos: calSnap.size });
        } catch {
            setDelConteo({ equipos: 0, partidos: 0 });
        }
    };

    // ── Ejecutar borrado en cascada ──
    const ejecutarBorrado = async () => {
        if (!delTarget) return;
        setDeleting(true);
        try {
            const cat    = delTarget.id;
            const colCal = getColName('calendario', cat);
            const colEq  = getColName('equipos', cat);
            const colJug = getColName('jugadores', cat);

            // 1) IDs de partidos (para borrar stats/jugadas relacionadas)
            const calSnap = await getDocs(collection(db, colCal));
            const partidoIds = calSnap.docs.map(d => d.id);

            // 2) Borrar partidos
            await borrarEnLotes(calSnap.docs.map(d => d.ref));

            // 3) Borrar stats y jugadas por partidoId (en trozos de 30 por 'in')
            for (const base of ['stats_partido', 'jugadas_partido']) {
                for (let i = 0; i < partidoIds.length; i += 30) {
                    const chunk = partidoIds.slice(i, i + 30);
                    if (chunk.length === 0) continue;
                    const snap = await getDocs(query(collection(db, base), where('partidoId', 'in', chunk)));
                    await borrarEnLotes(snap.docs.map(d => d.ref));
                }
            }

            // 4) Borrar jugadores y equipos
            const [jugSnap, eqSnap] = await Promise.all([
                getDocs(collection(db, colJug)),
                getDocs(collection(db, colEq)),
            ]);
            await borrarEnLotes(jugSnap.docs.map(d => d.ref));
            await borrarEnLotes(eqSnap.docs.map(d => d.ref));

            // 5) Borrar config del torneo de esa categoría
            try { await deleteDoc(doc(db, 'config_torneo', cat)); } catch {}

            // 6) Finalmente, borrar el doc de la categoría
            await borrarCategoriaDoc(cat);

            showToast('🗑️ Categoría y todos sus datos eliminados', '#f59e0b');
            setDelTarget(null);
            await recargar();
        } catch (e: any) {
            showToast(`Error al borrar: ${e?.code || 'desconocido'}`, '#ef4444');
            console.error('[AdminCategorias] borrar:', e);
        } finally {
            setDeleting(false);
        }
    };

    const borrarEnLotes = async (refs: any[]) => {
        for (let i = 0; i < refs.length; i += 450) {
            const batch = writeBatch(db);
            refs.slice(i, i + 450).forEach(r => batch.delete(r));
            await batch.commit();
        }
    };

    const nombreConfirmacion = delTarget ? (delTarget.label || delTarget.id) : '';
    const puedeBorrar = delTexto.trim().toUpperCase() === (delTarget?.id || '').toUpperCase();

    return (
        <div style={{ maxWidth: 640, margin: '0 auto', background: '#fff', borderRadius: 15, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontFamily: 'sans-serif' }}>
            {toast && (
                <div style={{ position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)', background: toast.color, color: 'white', padding: '12px 28px', borderRadius: 30, fontWeight: 900, fontSize: '0.85rem', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 9999 }}>
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 20, background: '#1e3a8a', color: 'white' }}>
                <h2 style={{ fontSize: '1rem', margin: 0, fontWeight: 900 }}>🗂️ CATEGORÍAS DE LA LIGA</h2>
                <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '5px 15px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>Cerrar</button>
            </div>

            <div style={{ padding: 20 }}>
                {/* Formulario crear/editar */}
                <div style={{ background: '#f8fafc', padding: 18, borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 24 }}>
                    <h3 style={{ margin: '0 0 14px', color: '#1e3a8a', fontSize: '0.8rem', fontWeight: 900 }}>
                        {editId ? `✏️ EDITAR: ${editId}` : '➕ NUEVA CATEGORÍA'}
                    </h3>

                    <label style={lbl}>ÍCONO</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                        {EMOJIS.filter(Boolean).map(e => (
                            <button key={e} onClick={() => setFEmoji(e)} style={{
                                fontSize: '1.3rem', padding: '4px 8px', borderRadius: 8, cursor: 'pointer',
                                border: fEmoji === e ? '2px solid #1e3a8a' : '1px solid #cbd5e1',
                                background: fEmoji === e ? '#dbeafe' : '#fff',
                            }}>{e}</button>
                        ))}
                    </div>

                    <label style={lbl}>NOMBRE</label>
                    <input
                        value={fNombre}
                        onChange={e => setFNombre(e.target.value)}
                        placeholder="Ej: U18 MASCULINO"
                        style={inp}
                    />
                    {!editId && fNombre.trim() && (
                        <p style={{ fontSize: '0.65rem', color: '#64748b', margin: '6px 0 0' }}>
                            Se guardará como: <b>{normalizarCategoria(fNombre).replace(/\s+/g, '_')}</b> · se verá: {fEmoji} {fNombre.toUpperCase()}
                        </p>
                    )}

                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                        {editId && (
                            <button onClick={limpiarForm} style={{ ...btn, background: '#e2e8f0', color: '#475569' }}>Cancelar</button>
                        )}
                        <button onClick={handleGuardar} disabled={saving} style={{ ...btn, background: '#10b981', color: '#fff', flex: 1 }}>
                            {saving ? 'Guardando...' : (editId ? 'Guardar cambios' : 'Crear categoría')}
                        </button>
                    </div>
                </div>

                {/* Lista */}
                <h3 style={{ color: '#1e3a8a', fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: 10 }}>Categorías existentes</h3>
                {loading ? (
                    <p style={{ color: '#94a3b8', textAlign: 'center', padding: 20 }}>Cargando...</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {cats.map(c => {
                            const oculta = c.activa === false;
                            return (
                                <div key={c.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 12,
                                    background: oculta ? '#f1f5f9' : '#fff', opacity: oculta ? 0.65 : 1,
                                }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.9rem' }}>{c.label}</div>
                                        <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>
                                            id: {c.id}{oculta ? ' · OCULTA' : ''}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                        <button onClick={() => toggleActiva(c)} title={oculta ? 'Mostrar' : 'Ocultar'}
                                            style={{ ...iconBtn, color: oculta ? '#3b82f6' : '#64748b' }}>
                                            {oculta ? '👁️' : '🙈'}
                                        </button>
                                        <button onClick={() => empezarEditar(c)} title="Editar"
                                            style={{ ...iconBtn, color: '#1e3a8a' }}>✏️</button>
                                        <button onClick={() => prepararBorrado(c)} title="Borrar"
                                            style={{ ...iconBtn, color: '#ef4444' }}>🗑️</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <p style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: 16, lineHeight: 1.5 }}>
                    💡 <b>Ocultar</b> (🙈) quita la categoría del menú pero conserva sus datos —
                    útil para temporadas viejas. <b>Borrar</b> (🗑️) elimina la categoría y todos
                    sus equipos, jugadores y partidos para siempre.
                </p>
            </div>

            {/* Modal de borrado blindado */}
            {delTarget && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
                    <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 380, width: '100%' }}>
                        <h3 style={{ margin: '0 0 8px', color: '#ef4444', fontWeight: 900, fontSize: '1rem' }}>⚠️ Borrar {delTarget.label}</h3>
                        <p style={{ fontSize: '0.8rem', color: '#334155', lineHeight: 1.5, margin: '0 0 14px' }}>
                            Esto elimina la categoría y <b>todos sus datos de forma permanente</b>:
                        </p>
                        {delConteo === null ? (
                            <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Contando datos...</p>
                        ) : (
                            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: '0.8rem', color: '#991b1b' }}>
                                • {delConteo.equipos} equipo(s) (con sus jugadores)<br />
                                • {delConteo.partidos} partido(s) (con sus estadísticas)<br />
                                • La configuración del torneo de esta categoría
                            </div>
                        )}
                        <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0 0 6px' }}>
                            Para confirmar, escribe <b style={{ color: '#111' }}>{delTarget.id}</b>:
                        </p>
                        <input
                            value={delTexto}
                            onChange={e => setDelTexto(e.target.value)}
                            placeholder={delTarget.id}
                            style={{ ...inp, marginBottom: 16, borderColor: puedeBorrar ? '#10b981' : '#cbd5e1' }}
                        />
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => setDelTarget(null)} style={{ ...btn, background: '#e2e8f0', color: '#475569', flex: 1 }}>Cancelar</button>
                            <button
                                onClick={ejecutarBorrado}
                                disabled={!puedeBorrar || deleting || delConteo === null}
                                style={{ ...btn, flex: 1, background: (puedeBorrar && !deleting) ? '#ef4444' : '#fca5a5', color: '#fff', cursor: (puedeBorrar && !deleting) ? 'pointer' : 'not-allowed' }}
                            >
                                {deleting ? 'Borrando...' : 'BORRAR TODO'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const lbl: React.CSSProperties = { display: 'block', fontSize: '0.68rem', fontWeight: 900, color: '#1e3a8a', marginBottom: 6 };
const inp: React.CSSProperties = { width: '100%', padding: 11, borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 700, boxSizing: 'border-box', fontSize: '0.9rem' };
const btn: React.CSSProperties = { padding: '11px 16px', border: 'none', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: '0.85rem' };
const iconBtn: React.CSSProperties = { background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 9px', cursor: 'pointer', fontSize: '0.95rem' };

export default AdminCategorias;
