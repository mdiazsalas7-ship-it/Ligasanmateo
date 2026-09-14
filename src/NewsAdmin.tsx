import React, { useState, useEffect } from 'react';
import { db, storage } from './firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// ─────────────────────────────────────────────────────────────
// PANEL DE PRENSA — redacción 100% manual.
//
// Se eliminó toda la generación de noticias con IA (OpenRouter):
//   - La API key estaba escrita en el propio código del cliente,
//     visible para cualquiera que abriera la app → riesgo de que
//     un tercero la usara y gastara el crédito.
//   - La función no estaba en uso.
// El admin redacta título y cuerpo a mano.
// ─────────────────────────────────────────────────────────────

interface NewsItem {
    id: string; titulo: string; cuerpo: string;
    tipo: 'general' | 'sancion' | 'destacado'; fecha: any; imageUrl?: string;
}

// ── Toast ──
const Toast: React.FC<{ msg: string; color: string }> = ({ msg, color }) => (
    <div style={{
        position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
        background: color, color: 'white', padding: '12px 28px',
        borderRadius: 30, fontWeight: 900, fontSize: '0.85rem',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 9999,
        whiteSpace: 'nowrap', animation: 'toastIn 0.2s ease',
    }}>
        {msg}
    </div>
);

// ── Modal de confirmación ──
const ConfirmModal: React.FC<{ mensaje: string; onConfirm: () => void; onCancel: () => void }> = ({ mensaje, onConfirm, onCancel }) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ background: '#1e293b', borderRadius: 16, padding: 28, maxWidth: 320, width: '100%', border: '1px solid #334155' }}>
            <p style={{ color: 'white', fontWeight: 700, fontSize: '0.95rem', textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>{mensaje}</p>
            <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={onCancel} style={{ flex: 1, padding: '12px 0', background: '#334155', color: '#94a3b8', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>CANCELAR</button>
                <button onClick={onConfirm} style={{ flex: 1, padding: '12px 0', background: '#ef4444', color: 'white', border: 'none', borderRadius: 10, fontWeight: 900, cursor: 'pointer' }}>ELIMINAR</button>
            </div>
        </div>
    </div>
);

const NewsAdmin: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [news, setNews]           = useState<NewsItem[]>([]);
    const [titulo, setTitulo]       = useState('');
    const [cuerpo, setCuerpo]       = useState('');
    const [tipo, setTipo]           = useState<'general'|'sancion'|'destacado'>('general');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [loading, setLoading]     = useState(false);
    const [toast, setToast]         = useState<{ msg: string; color: string } | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const showToast = (msg: string, color = '#10b981') => {
        setToast({ msg, color });
        setTimeout(() => setToast(null), 2500);
    };

    const handlePublicar = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            let imageUrl = '';
            if (imageFile) {
                const storageRef = ref(storage, `noticias/${Date.now()}_${imageFile.name}`);
                await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(storageRef);
            }
            await addDoc(collection(db, 'noticias'), {
                titulo: titulo.toUpperCase(), cuerpo, tipo,
                fecha: Timestamp.now(), imageUrl: imageUrl || null
            });
            setTitulo(''); setCuerpo(''); setImageFile(null); setTipo('general');
            fetchNews();
            showToast('✅ Noticia publicada y notificada');
        } catch (err: any) {
            showToast(`Error al publicar: ${err?.code || 'desconocido'}`, '#ef4444');
            console.error('[NewsAdmin] publicar:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchNews = async () => {
        const q = query(collection(db, 'noticias'), orderBy('fecha', 'desc'));
        const snap = await getDocs(q);
        setNews(snap.docs.map(d => ({ id: d.id, ...d.data() } as NewsItem)));
    };

    useEffect(() => { fetchNews(); }, []);

    const handleDelete = async (id: string) => {
        await deleteDoc(doc(db, 'noticias', id));
        setNews(prev => prev.filter(n => n.id !== id));
        showToast('🗑️ Noticia eliminada', '#f59e0b');
    };

    return (
        <div style={{ maxWidth: 800, margin: '0 auto', background: '#fff', borderRadius: 15, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontFamily: 'sans-serif' }}>
            <style>{`@keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(-8px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }`}</style>
            {toast && <Toast msg={toast.msg} color={toast.color} />}
            {confirmId && (
                <ConfirmModal
                    mensaje="¿Eliminar esta noticia permanentemente?"
                    onConfirm={() => { handleDelete(confirmId); setConfirmId(null); }}
                    onCancel={() => setConfirmId(null)}
                />
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 20, background: '#1e3a8a', color: 'white' }}>
                <h2 style={{ fontSize: '1rem', margin: 0, fontWeight: 900 }}>📰 PANEL DE PRENSA — TODAS LAS CATEGORÍAS</h2>
                <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '5px 15px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold' }}>Cerrar</button>
            </div>

            <div style={{ padding: 20 }}>
                <form onSubmit={handlePublicar} style={{ background: '#f8fafc', padding: 20, borderRadius: 15, border: '1px solid #e2e8f0', marginBottom: 30 }}>
                    <div style={{ marginBottom: 15 }}>
                        <label style={{ fontWeight: 900, color: '#1e3a8a', display: 'block', marginBottom: 8, fontSize: '0.75rem' }}>TÍTULO</label>
                        <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} required placeholder="Ej: GRAN VICTORIA EN LA JORNADA" style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 'bold', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: 15 }}>
                        <label style={{ fontWeight: 900, color: '#1e3a8a', display: 'block', marginBottom: 8, fontSize: '0.75rem' }}>IMAGEN DE PORTADA</label>
                        <input type="file" accept="image/*" onChange={e => { if (e.target.files) setImageFile(e.target.files[0]); }} style={{ width: '100%', background: '#fff', padding: 10, border: '1px dashed #cbd5e1', borderRadius: 8, boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: 15 }}>
                        <label style={{ fontWeight: 900, color: '#1e3a8a', display: 'block', marginBottom: 8, fontSize: '0.75rem' }}>CUERPO DE LA NOTICIA</label>
                        <textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)} required style={{ width: '100%', padding: 15, borderRadius: 8, border: '1px solid #cbd5e1', minHeight: 180, fontFamily: 'inherit', lineHeight: 1.5, fontSize: '0.85rem', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: 15 }}>
                        <label style={{ fontWeight: 900, color: '#1e3a8a', display: 'block', marginBottom: 8, fontSize: '0.75rem' }}>TIPO</label>
                        <select value={tipo} onChange={e => setTipo(e.target.value as any)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #cbd5e1' }}>
                            <option value="general">General</option>
                            <option value="destacado">Destacado</option>
                            <option value="sancion">Sanción</option>
                        </select>
                    </div>
                    <button disabled={loading} style={{ width: '100%', padding: 16, background: '#10b981', color: 'white', border: 'none', borderRadius: 12, fontWeight: 900, fontSize: '0.9rem', cursor: 'pointer', borderBottom: '4px solid #059669' }}>
                        {loading ? 'PROCESANDO...' : 'PUBLICAR Y NOTIFICAR'}
                    </button>
                </form>

                <h3 style={{ color: '#1e3a8a', fontSize: '0.8rem', marginBottom: 10, fontWeight: 900, textTransform: 'uppercase' }}>Boletines Recientes</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {news.map(n => (
                        <div key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 15px', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                                {n.imageUrl && <img src={n.imageUrl} alt="n" style={{ width: 35, height: 35, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} />}
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.titulo}</div>
                            </div>
                            <button onClick={() => setConfirmId(n.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}>🗑️</button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default NewsAdmin;
