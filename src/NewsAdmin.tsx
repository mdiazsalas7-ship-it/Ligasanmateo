import React, { useState, useEffect } from 'react';
import { db, storage } from './firebase'; 
import { collection, addDoc, getDocs, deleteDoc, doc, Timestamp, query, orderBy, where, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface NewsItem { 
    id: string; titulo: string; cuerpo: string; 
    tipo: 'general' | 'sancion' | 'destacado'; fecha: any; imageUrl?: string; 
}

interface PartidoFinalizado {
    id: string; local: string; visitante: string;
    scoreL: number; scoreV: number; mvp: string;
    puntosMvp: number; fecha: string; categoria: string;
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

const CATEGORIAS = ['MASTER40', 'LIBRE', 'INTERINDUSTRIAL', 'U16_FEMENINO', 'U16M'];
const p1 = "sk-or-v1-09b7a0e6db89101ea9fee4db191b4679";
const p2 = "9ffbfd8188cc2de82ace935725c78f3b";

const NewsAdmin: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [news, setNews]           = useState<NewsItem[]>([]);
    const [titulo, setTitulo]       = useState('');
    const [cuerpo, setCuerpo]       = useState('');
    const [tipo, setTipo]           = useState<'general'|'sancion'|'destacado'>('general');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [loading, setLoading]     = useState(false);
    const [showMatchSelector, setShowMatchSelector] = useState(false);
    const [recentMatches, setRecentMatches] = useState<PartidoFinalizado[]>([]);
    const [loadingMatches, setLoadingMatches] = useState(false);
    const [toast, setToast]         = useState<{ msg: string; color: string } | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);

    const showToast = (msg: string, color = '#10b981') => {
        setToast({ msg, color });
        setTimeout(() => setToast(null), 2500);
    };

    const redactarConIA = async (matchData?: PartidoFinalizado) => {
        setLoading(true);
        const FULL_KEY = p1 + p2;
        let prompt = "";
        if (matchData) {
            const dif = Math.abs(matchData.scoreL - matchData.scoreV);
            const contexto = dif >= 15 ? "fue una PELA o PALIZA contundente" : dif <= 5 ? "fue un JUEGO CERRADO de INFARTO" : "fue un duelo muy disputado";
            prompt = `Actúa como cronista deportivo de la Liga Metropolitana de Baloncesto (Categoría ${matchData.categoria}). Redacta una noticia explosiva (máx 130 palabras).
PARTIDO: ${matchData.local} vs ${matchData.visitante}. SCORE: ${matchData.scoreL} - ${matchData.scoreV} (${contexto}). MVP: ${matchData.mvp} con ${matchData.puntosMvp} puntos.
REQUISITOS:
1. TÍTULO EN MAYÚSCULAS: Menciona quién ganó. Si ventaja >15 usa PELA. Si <5 usa INFARTO.
2. CUERPO: Describe el ambiente. Resalta al MVP.
3. ESTILO: Baloncesto criollo venezolano, apasionado y profesional.
IMPORTANTE: Separa el título del cuerpo con la palabra CUERPO:`;
        } else {
            prompt = `Mejora este comunicado para la Liga Metropolitana: "${titulo}". Hazlo institucional y profesional. Máximo 100 palabras.`;
        }
        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${FULL_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: "openai/gpt-3.5-turbo",
                    messages: [
                        { role: "system", content: "Eres el Jefe de Prensa de la Liga Metropolitana. Tu redacción es técnica, épica y conocedora del basket." },
                        { role: "user", content: prompt }
                    ]
                })
            });
            const data = await response.json();
            const texto = data.choices[0].message.content;
            if (matchData && texto.includes("CUERPO:")) {
                const partes = texto.split("CUERPO:");
                setTitulo(partes[0].replace(/T[ÍI]TULO:/i, '').trim().toUpperCase());
                setCuerpo(partes[1].trim());
                setTipo('destacado');
            } else {
                setCuerpo(texto);
            }
        } catch {
            showToast('Error con la IA. Revisa la conexión.', '#ef4444');
        } finally {
            setLoading(false);
        }
    };

    const fetchRecentMatches = async () => {
        setLoadingMatches(true);
        try {
            let allMatches: PartidoFinalizado[] = [];
            for (const cat of CATEGORIAS) {
                const colName = cat === 'MASTER40' ? 'calendario' : `calendario_${cat}`;
                try {
                    const q = query(collection(db, colName), where('estatus', '==', 'finalizado'), limit(5));
                    const snap = await getDocs(q);
                    const catMatches = await Promise.all(snap.docs.map(async (docSnap) => {
                        const d = docSnap.data();
                        let mvpNombre = "Figura destacada", mvpPuntos = 0;
                        const statsSnap = await getDocs(query(collection(db, 'stats_partido'), where('partidoId', '==', docSnap.id)));
                        statsSnap.forEach(s => {
                            const st = s.data();
                            const pts = (Number(st.tirosLibres)||0) + (Number(st.dobles)||0)*2 + (Number(st.triples)||0)*3;
                            if (pts > mvpPuntos) { mvpPuntos = pts; mvpNombre = st.nombre || "Jugador"; }
                        });
                        return { id: docSnap.id, local: d.equipoLocalNombre, visitante: d.equipoVisitanteNombre, scoreL: d.marcadorLocal, scoreV: d.marcadorVisitante, mvp: mvpNombre, puntosMvp: mvpPuntos, fecha: d.fechaAsignada || '', categoria: cat } as PartidoFinalizado;
                    }));
                    allMatches = [...allMatches, ...catMatches];
                } catch { /* categoría no existe aún */ }
            }
            setRecentMatches(allMatches.sort((a, b) => b.fecha.localeCompare(a.fecha)));
            setShowMatchSelector(true);
        } catch (e) {
            showToast('Error al cargar resultados.', '#ef4444');
        } finally {
            setLoadingMatches(false);
        }
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
            setTitulo(''); setCuerpo(''); setImageFile(null);
            fetchNews();
            showToast('✅ Noticia publicada y notificada');
        } catch {
            showToast('Error al publicar.', '#ef4444');
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
                <button onClick={fetchRecentMatches} disabled={loadingMatches} style={{ width: '100%', marginBottom: 20, background: 'linear-gradient(45deg, #1e3a8a, #3b82f6)', color: 'white', fontWeight: 900, padding: 15, border: 'none', borderRadius: 12, cursor: 'pointer', boxShadow: '0 4px 12px rgba(30,58,138,0.2)' }}>
                    {loadingMatches ? 'BUSCANDO BOXSCORES...' : '✨ REDACTAR DESDE RESULTADOS (IA)'}
                </button>

                <form onSubmit={handlePublicar} style={{ background: '#f8fafc', padding: 20, borderRadius: 15, border: '1px solid #e2e8f0', marginBottom: 30 }}>
                    <div style={{ marginBottom: 15 }}>
                        <label style={{ fontWeight: 900, color: '#1e3a8a', display: 'block', marginBottom: 8, fontSize: '0.75rem' }}>TÍTULO</label>
                        <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} required placeholder="Ej: PELA HISTÓRICA EN EL EJE ESTE" style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 'bold', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: 15 }}>
                        <label style={{ fontWeight: 900, color: '#1e3a8a', display: 'block', marginBottom: 8, fontSize: '0.75rem' }}>IMAGEN DE PORTADA</label>
                        <input type="file" accept="image/*" onChange={e => { if (e.target.files) setImageFile(e.target.files[0]); }} style={{ width: '100%', background: '#fff', padding: 10, border: '1px dashed #cbd5e1', borderRadius: 8, boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: 15, position: 'relative' }}>
                        <label style={{ fontWeight: 900, color: '#1e3a8a', display: 'block', marginBottom: 8, fontSize: '0.75rem' }}>CUERPO DE LA NOTICIA</label>
                        <textarea value={cuerpo} onChange={e => setCuerpo(e.target.value)} required style={{ width: '100%', padding: 15, borderRadius: 8, border: '1px solid #cbd5e1', minHeight: 180, fontFamily: 'inherit', lineHeight: 1.5, fontSize: '0.85rem', boxSizing: 'border-box' }} />
                        <button type="button" onClick={() => redactarConIA()} style={{ position: 'absolute', bottom: 15, right: 15, background: '#1e3a8a', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: '0.6rem', cursor: 'pointer', fontWeight: 900 }}>🪄 PULIR TEXTO</button>
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

            {showMatchSelector && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 20, backdropFilter: 'blur(3px)' }}>
                    <div style={{ background: 'white', width: '100%', maxWidth: 400, borderRadius: 20, padding: 20, maxHeight: '80vh', overflowY: 'auto' }}>
                        <h3 style={{ margin: '0 0 15px 0', color: '#1e3a8a', fontWeight: 900, fontSize: '1rem', textAlign: 'center' }}>SELECCIONA UN RESULTADO</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {recentMatches.map(m => (
                                <div key={m.id} onClick={() => { setShowMatchSelector(false); redactarConIA(m); }} style={{ border: '2px solid #f1f5f9', padding: 15, borderRadius: 12, cursor: 'pointer', background: '#f8fafc' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                        <span style={{ fontSize: '0.6rem', color: '#3b82f6', fontWeight: 900 }}>{m.categoria}</span>
                                        <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{m.fecha}</span>
                                    </div>
                                    <div style={{ fontWeight: 900, color: '#1e3a8a', marginBottom: 5, fontSize: '0.8rem' }}>{m.local} vs {m.visitante}</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#111' }}>{m.scoreL} - {m.scoreV}</div>
                                    <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: 5 }}>MVP: {m.mvp} ({m.puntosMvp} pts)</div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setShowMatchSelector(false)} style={{ width: '100%', marginTop: 15, padding: 12, background: '#ef4444', color: 'white', border: 'none', borderRadius: 10, fontWeight: 'bold', fontSize: '0.7rem' }}>CANCELAR</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NewsAdmin;