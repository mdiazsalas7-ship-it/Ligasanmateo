// ─────────────────────────────────────────────────────────────
// PANEL DE PATROCINADORES (solo admin)
//
// - Alta con logo (se comprime a 400px antes de subir a Storage)
// - Paquetes: oro / plata / bronce
// - Semáforo de vigencia: Activo / Vence pronto (≤30 días) /
//   Vencido / Pausado
// - Activar-pausar y eliminar desde la lista
// La app pública (valla + franjas en imágenes) solo muestra los
// vigentes: activo === true y vencimiento >= hoy.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { db } from './firebase';
import {
    collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { hoyISO, NIVEL_ORDEN, type NivelPatrocinio, type Patrocinador } from './sponsors';

const storage = getStorage();

// Comprime el logo a máx 400px por lado (evita chocar con el límite
// de 5MB de las reglas y hace la valla liviana)
const comprimirLogo = (file: File): Promise<Blob> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const MAX = 400;
            const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * ratio);
            canvas.height = Math.round(img.height * ratio);
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
                b => b ? resolve(b) : reject(new Error('compresión falló')),
                'image/png'
            );
        };
        img.onerror = () => reject(new Error('imagen inválida'));
        img.src = URL.createObjectURL(file);
    });

const NIVELES: { id: NivelPatrocinio; label: string; color: string }[] = [
    { id: 'oro',    label: '🥇 ORO',    color: '#fbbf24' },
    { id: 'plata',  label: '🥈 PLATA',  color: '#cbd5e1' },
    { id: 'bronce', label: '🥉 BRONCE', color: '#d97706' },
];

const AdminPatrocinadores: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [lista, setLista] = useState<Patrocinador[]>([]);
    const [saving, setSaving] = useState(false);

    // Formulario
    const [nombre, setNombre] = useState('');
    const [nivel, setNivel] = useState<NivelPatrocinio>('bronce');
    const [vencimiento, setVencimiento] = useState('');
    const [enlace, setEnlace] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);

    useEffect(() => {
        return onSnapshot(collection(db, 'patrocinadores'), snap => {
            const arr = snap.docs.map(d => ({ id: d.id, ...d.data() } as Patrocinador));
            arr.sort((a, b) =>
                (NIVEL_ORDEN[a.nivel] - NIVEL_ORDEN[b.nivel]) ||
                a.nombre.localeCompare(b.nombre)
            );
            setLista(arr);
        });
    }, []);

    const limpiar = () => {
        setNombre(''); setNivel('bronce'); setVencimiento('');
        setEnlace(''); setDescripcion(''); setLogoFile(null);
    };

    const handleGuardar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nombre.trim()) return alert('Falta el nombre del negocio');
        if (!vencimiento) return alert('Falta la fecha de vencimiento del contrato');
        if (!logoFile) return alert('Falta el logo');
        setSaving(true);

        // ── Etapa 1: comprimir (con respaldo si el formato no se deja) ──
        let blob: Blob;
        let contentType = 'image/png';
        try {
            blob = await comprimirLogo(logoFile);
        } catch (err) {
            console.error('[patrocinadores] compresión falló:', err);
            if (logoFile.type.startsWith('image/') && logoFile.size < 4 * 1024 * 1024) {
                // El navegador no pudo decodificarla (p. ej. HEIC): subir original
                blob = logoFile;
                contentType = logoFile.type;
            } else {
                setSaving(false);
                return alert(
                    'No se pudo procesar esa imagen ⚠️\n' +
                    'Usa un logo en JPG o PNG de menos de 4MB.\n' +
                    `(Formato recibido: ${logoFile.type || 'desconocido'})`
                );
            }
        }

        // ── Etapa 2: subir a Storage ──
        let logoUrl = '';
        try {
            const path = `patrocinadores_logos/${Date.now()}_${nombre.trim().replace(/\s+/g, '_')}.png`;
            const storageRef = ref(storage, path);
            await uploadBytes(storageRef, blob, { contentType });
            logoUrl = await getDownloadURL(storageRef);
        } catch (err: any) {
            console.error('[patrocinadores] subida a Storage falló:', err);
            setSaving(false);
            const code = err?.code || '';
            if (code.includes('unauthorized') || code.includes('unauthenticated')) {
                return alert(
                    'Storage rechazó la subida del logo ⚠️\n' +
                    'Revisa que las reglas de Storage estén publicadas y que tu cuenta sea admin.\n' +
                    `(Código: ${code})`
                );
            }
            return alert(`Error subiendo el logo a Storage ⚠️\n(${code || err?.message || 'desconocido'})`);
        }

        // ── Etapa 3: guardar en Firestore ──
        try {
            await addDoc(collection(db, 'patrocinadores'), {
                nombre: nombre.trim(),
                nivel,
                vencimiento,
                enlace: enlace.trim(),
                descripcion: descripcion.trim(),
                logoUrl,
                activo: true,
                orden: 99,
                createdAt: Date.now(),
            });
            limpiar();
            alert('✅ Patrocinador agregado');
        } catch (err: any) {
            console.error('[patrocinadores] Firestore falló:', err);
            const code = err?.code || '';
            if (code.includes('permission')) {
                alert(
                    'Firestore rechazó el guardado ⚠️\n' +
                    'El logo sí subió, pero las reglas no dejaron crear el documento.\n' +
                    'Revisa que tu cuenta sea admin en las reglas publicadas.\n' +
                    `(Código: ${code})`
                );
            } else {
                alert(`Error guardando en la base de datos ⚠️\n(${code || err?.message || 'desconocido'})`);
            }
        }
        setSaving(false);
    };

    const togglePausa = async (p: Patrocinador) => {
        try { await updateDoc(doc(db, 'patrocinadores', p.id), { activo: !p.activo }); }
        catch { alert('Error al actualizar'); }
    };

    // ── Renovar contrato ──
    // Extiende el vencimiento sin volver a cargar logo/datos. El nuevo
    // vencimiento cuenta desde HOY (o desde la fecha de vencimiento si
    // aún no ha pasado, para no "perder" días si renuevas antes). Deja
    // el patrocinador activo automáticamente.
    const [renovando, setRenovando] = useState<string | null>(null); // id abierto

    const renovar = async (p: Patrocinador, meses: number) => {
        try {
            const hoy = new Date();
            const desde = (p.vencimiento && new Date(p.vencimiento) > hoy)
                ? new Date(p.vencimiento)   // aún vigente → sumar al final
                : hoy;                       // vencido → contar desde hoy
            const nueva = new Date(desde);
            nueva.setMonth(nueva.getMonth() + meses);
            const nuevaISO = nueva.toISOString().slice(0, 10);

            await updateDoc(doc(db, 'patrocinadores', p.id), {
                vencimiento: nuevaISO,
                activo: true,               // reactivar si estaba pausado/vencido
                renovadoEn: Date.now(),
            });
            setRenovando(null);
        } catch {
            alert('Error al renovar');
        }
    };

    const eliminar = async (p: Patrocinador) => {
        if (!window.confirm(`¿Eliminar a ${p.nombre}? Esta acción no se deshace.`)) return;
        try { await deleteDoc(doc(db, 'patrocinadores', p.id)); }
        catch { alert('Error al eliminar'); }
    };

    // Semáforo de estado
    const estado = (p: Patrocinador): { label: string; bg: string; fg: string } => {
        if (!p.activo) return { label: 'PAUSADO', bg: '#334155', fg: '#cbd5e1' };
        const hoy = hoyISO();
        if (!p.vencimiento || p.vencimiento < hoy)
            return { label: 'VENCIDO', bg: '#7f1d1d', fg: '#fecaca' };
        const dias = Math.round(
            (new Date(p.vencimiento).getTime() - new Date(hoy).getTime()) / 86400000
        );
        if (dias <= 30) return { label: `VENCE EN ${dias}D`, bg: '#78350f', fg: '#fde68a' };
        return { label: 'ACTIVO', bg: '#14532d', fg: '#bbf7d0' };
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '10px 12px', background: '#0f172a',
        border: '1px solid #334155', borderRadius: 8, color: 'white',
        fontSize: '0.8rem', boxSizing: 'border-box',
    };

    const renovBtn: React.CSSProperties = {
        flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
        fontSize: '0.65rem', fontWeight: 900, background: '#1e293b',
        color: '#e2e8f0', border: '1px solid #334155',
    };

    return (
        <div className="fade-in" style={{ color: 'white' }}>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', fontWeight: 'bold', cursor: 'pointer', fontSize: '0.7rem', marginBottom: 12 }}>
                ← VOLVER
            </button>

            <h2 style={{ fontSize: '1rem', fontWeight: 900, margin: '0 0 4px' }}>💼 PATROCINADORES</h2>
            <p style={{ fontSize: '0.65rem', color: '#64748b', margin: '0 0 16px' }}>
                Los vigentes aparecen solos en la valla y en las imágenes compartidas.
                Al vencer o pausar, desaparecen automáticamente.
            </p>

            {/* ── Formulario de alta ── */}
            <form onSubmit={handleGuardar} style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input style={inputStyle} placeholder="Nombre del negocio" value={nombre} onChange={e => setNombre(e.target.value)} />

                <div style={{ display: 'flex', gap: 8 }}>
                    {NIVELES.map(n => (
                        <button key={n.id} type="button" onClick={() => setNivel(n.id)} style={{
                            flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                            fontSize: '0.65rem', fontWeight: 900,
                            background: nivel === n.id ? n.color : '#0f172a',
                            color: nivel === n.id ? '#1c1917' : '#94a3b8',
                            border: nivel === n.id ? 'none' : '1px solid #334155',
                        }}>
                            {n.label}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                        <label style={{ fontSize: '0.55rem', color: '#64748b', fontWeight: 700 }}>VENCE</label>
                        <input type="date" style={inputStyle} value={vencimiento} onChange={e => setVencimiento(e.target.value)} />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.55rem', color: '#64748b', fontWeight: 700 }}>LOGO</label>
                        <input type="file" accept="image/*" style={{ ...inputStyle, padding: '8px' }}
                            onChange={e => setLogoFile(e.target.files?.[0] ?? null)} />
                    </div>
                </div>

                <input style={inputStyle} placeholder="Tagline corto (ej: Todo para tu equipo · C.C. El Este)" value={descripcion} onChange={e => setDescripcion(e.target.value)} />
                <input style={inputStyle} placeholder="Enlace al tocar (WhatsApp, Instagram o web) — opcional" value={enlace} onChange={e => setEnlace(e.target.value)} />

                <button type="submit" disabled={saving} style={{
                    padding: 12, borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: '#f97316', color: 'white', fontWeight: 900, fontSize: '0.75rem',
                    opacity: saving ? 0.6 : 1,
                }}>
                    {saving ? 'GUARDANDO…' : '➕ AGREGAR PATROCINADOR'}
                </button>
            </form>

            {/* ── Lista ── */}
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lista.length === 0 && (
                    <p style={{ color: '#475569', fontSize: '0.7rem', textAlign: 'center', padding: 20 }}>
                        Aún no hay patrocinadores. Agrega el primero arriba.
                    </p>
                )}
                {lista.map(p => {
                    const st = estado(p);
                    // Resaltar renovación cuando está vencido o por vencer
                    const urge = st.label === 'VENCIDO' || st.label.startsWith('VENCE EN');
                    const abierto = renovando === p.id;
                    return (
                        <div key={p.id} style={{
                            background: '#1a1a1a', border: `1px solid ${urge ? '#f59e0b' : '#333'}`, borderRadius: 12,
                            padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <img src={p.logoUrl} alt={p.nombre} style={{
                                    width: 40, height: 40, borderRadius: 8, objectFit: 'contain',
                                    background: '#f8fafc', flexShrink: 0,
                                }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {p.nombre}
                                    </div>
                                    <div style={{ fontSize: '0.6rem', color: '#64748b' }}>
                                        {p.nivel.toUpperCase()} · vence {p.vencimiento || '—'}
                                    </div>
                                </div>
                                <span style={{
                                    background: st.bg, color: st.fg, fontSize: '0.52rem', fontWeight: 900,
                                    padding: '3px 8px', borderRadius: 8, flexShrink: 0,
                                }}>
                                    {st.label}
                                </span>
                            </div>

                            {/* Fila de acciones */}
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button onClick={() => setRenovando(abierto ? null : p.id)} title="Renovar contrato" style={{
                                    background: urge ? '#f59e0b' : 'none',
                                    border: `1px solid ${urge ? '#f59e0b' : '#334155'}`, borderRadius: 8,
                                    color: urge ? '#1c1917' : '#94a3b8', cursor: 'pointer',
                                    padding: '4px 10px', fontSize: '0.62rem', fontWeight: 900,
                                }}>
                                    🔄 RENOVAR
                                </button>
                                <button onClick={() => togglePausa(p)} title={p.activo ? 'Pausar' : 'Reactivar'} style={{
                                    background: 'none', border: '1px solid #334155', borderRadius: 8,
                                    color: '#94a3b8', cursor: 'pointer', padding: '4px 8px', fontSize: '0.7rem',
                                }}>
                                    {p.activo ? '⏸' : '▶️'}
                                </button>
                                <button onClick={() => eliminar(p)} title="Eliminar" style={{
                                    background: 'none', border: '1px solid #7f1d1d', borderRadius: 8,
                                    color: '#fca5a5', cursor: 'pointer', padding: '4px 8px', fontSize: '0.7rem',
                                }}>
                                    🗑
                                </button>
                            </div>

                            {/* Panel de renovación desplegable */}
                            {abierto && (
                                <div style={{
                                    background: '#0f172a', border: '1px solid #334155', borderRadius: 10,
                                    padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
                                }}>
                                    <div style={{ fontSize: '0.6rem', color: '#94a3b8', fontWeight: 700 }}>
                                        Extender el contrato a partir de {(p.vencimiento && new Date(p.vencimiento) > new Date()) ? `su vencimiento (${p.vencimiento})` : 'hoy'}:
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={() => renovar(p, 6)} style={renovBtn}>+6 meses</button>
                                        <button onClick={() => renovar(p, 12)} style={{ ...renovBtn, background: '#f59e0b', color: '#1c1917', border: 'none' }}>+1 año</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default AdminPatrocinadores;
