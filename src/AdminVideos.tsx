import React, { useState, useEffect } from 'react';
import { db, storage } from './firebase';
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, where } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, listAll } from 'firebase/storage';

const AdminVideos = ({ onClose }: { onClose: () => void }) => {
    const [titulo, setTitulo]     = useState('');
    const [fecha, setFecha]       = useState('');
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress]   = useState(0);
    const [videos, setVideos]       = useState<any[]>([]);
    const [syncing, setSyncing]     = useState(false);
    const [syncLog, setSyncLog]     = useState('');

    const fetchVideos = async () => {
        try {
            const q = query(collection(db, 'entrevistas'));
            const snap = await getDocs(q);
            setVideos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error('Error al cargar videos', e);
        }
    };

    useEffect(() => { fetchVideos(); }, []);

    // Captura un frame del video y devuelve un blob JPEG
    const capturarThumbnail = (file: File): Promise<Blob | null> => {
        return new Promise(resolve => {
            const video   = document.createElement('video');
            const canvas  = document.createElement('canvas');
            video.preload = 'metadata';
            video.muted   = true;
            video.playsInline = true;
            video.src = URL.createObjectURL(file);
            video.onloadedmetadata = () => {
                // Saltar al 20% del video para una imagen representativa
                video.currentTime = Math.min(video.duration * 0.2, 5);
            };
            video.onseeked = () => {
                canvas.width  = video.videoWidth  || 320;
                canvas.height = video.videoHeight || 180;
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(null); return; }
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.75);
                URL.revokeObjectURL(video.src);
            };
            video.onerror = () => resolve(null);
        });
    };

    const handleUpload = async () => {
        if (!titulo || !videoFile) return alert('Falta título o video');
        setUploading(true);
        setProgress(0);

        try {
            const ts          = Date.now();
            const storageRef  = ref(storage, `videos_entrevistas/${ts}_${videoFile.name}`);
            const uploadTask  = uploadBytesResumable(storageRef, videoFile);

            uploadTask.on('state_changed',
                snap => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
                err  => { console.error(err); alert('Error al subir video'); setUploading(false); },
                async () => {
                    const videoUrl = await getDownloadURL(uploadTask.snapshot.ref);

                    // Generar y subir thumbnail
                    let thumbnailUrl = '';
                    try {
                        const blob = await capturarThumbnail(videoFile);
                        if (blob) {
                            const thumbRef = ref(storage, `videos_thumbnails/${ts}_thumb.jpg`);
                            await uploadBytesResumable(thumbRef, blob);
                            thumbnailUrl = await getDownloadURL(thumbRef);
                        }
                    } catch (e) { console.warn('Thumbnail falló, continuando sin ella', e); }

                    await addDoc(collection(db, 'entrevistas'), {
                        titulo:       titulo.toUpperCase(),
                        videoUrl,
                        thumbnailUrl,
                        fecha:        fecha || new Date().toLocaleDateString('es-VE'),
                        createdAt:    ts,
                        storagePath:  uploadTask.snapshot.ref.fullPath,
                    });

                    setUploading(false); setProgress(0); setTitulo(''); setFecha(''); setVideoFile(null);
                    fetchVideos();
                    alert('✅ Video subido y registrado');
                }
            );
        } catch (e) {
            console.error(e);
            alert('Error al subir');
            setUploading(false);
        }
    };

    // ── Escanear Storage y registrar en Firestore los que falten ──
    const handleSyncStorage = async () => {
        setSyncing(true);
        setSyncLog('🔍 Escaneando Storage...');
        try {
            // 1. Listar todos los archivos en videos_entrevistas/
            const folderRef = ref(storage, 'videos_entrevistas');
            const { items } = await listAll(folderRef);
            setSyncLog(`📦 ${items.length} archivos encontrados en Storage`);

            // 2. Obtener URLs ya registradas en Firestore
            const snap = await getDocs(collection(db, 'entrevistas'));
            const registeredPaths = new Set(
                snap.docs.map(d => d.data().storagePath || '').filter(Boolean)
            );
            const registeredUrls = new Set(
                snap.docs.map(d => d.data().videoUrl || '').filter(Boolean)
            );

            // 3. Registrar los que faltan
            let added = 0;
            for (const item of items) {
                // Skip if already registered by path
                if (registeredPaths.has(item.fullPath)) continue;

                let url = '';
                try { url = await getDownloadURL(item); } catch { continue; }

                // Skip if URL already registered
                if (registeredUrls.has(url)) continue;

                // Parse título from filename: remove timestamp prefix and extension
                const raw     = item.name.replace(/^\d+_/, '').replace(/\.mp4$/i, '');
                const titulo  = raw.length > 3 ? raw : item.name.replace(/\.mp4$/i, '');
                const fechaTs = new Date(parseInt(item.name.split('_')[0]) || Date.now())
                    .toLocaleDateString('es-VE');

                const tsNum = parseInt(item.name.split('_')[0]) || Date.now();
                await addDoc(collection(db, 'entrevistas'), {
                    titulo:       titulo.toUpperCase(),
                    videoUrl:     url,
                    fecha:        fechaTs,
                    thumbnailUrl: '',
                    storagePath:  item.fullPath,
                    createdAt:    tsNum,
                });
                added++;
                setSyncLog(`✅ Registrando (${added})... ${titulo.substring(0, 30)}`);
            }

            setSyncLog(`🎉 Listo — ${added} videos nuevos registrados. Total en Storage: ${items.length}`);
            fetchVideos();
        } catch (e: any) {
            setSyncLog(`❌ Error: ${e.message}`);
        }
        setSyncing(false);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('¿Borrar esta entrevista de la lista?')) return;
        try { await deleteDoc(doc(db, 'entrevistas', id)); fetchVideos(); }
        catch { alert('Error al borrar'); }
    };

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#f8fafc', zIndex: 2000, overflowY: 'auto', padding: 20 }}>
            <div style={{ maxWidth: 600, margin: '0 auto', background: 'white', padding: 20, borderRadius: 20, boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ margin: 0, color: '#1e3a8a' }}>Gestión de Videos 🎥</h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✖</button>
                </div>

                {/* ── Botón de sincronización ── */}
                <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 12, padding: 14, marginBottom: 20 }}>
                    <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 700, color: '#92400e' }}>
                        📂 Videos en Storage sin registrar
                    </p>
                    <p style={{ margin: '0 0 10px', fontSize: '0.65rem', color: '#78350f', lineHeight: 1.4 }}>
                        Si hay videos subidos en Firebase Storage que no aparecen en la app, usa este botón para registrarlos automáticamente.
                    </p>
                    <button
                        onClick={handleSyncStorage}
                        disabled={syncing}
                        style={{
                            background: syncing ? '#d97706' : '#f59e0b',
                            color: 'white', border: 'none', borderRadius: 8,
                            padding: '10px 18px', fontWeight: 900, fontSize: '0.75rem',
                            cursor: syncing ? 'default' : 'pointer', width: '100%',
                        }}
                    >
                        {syncing ? '⏳ Sincronizando...' : '🔄 SINCRONIZAR VIDEOS DE STORAGE'}
                    </button>
                    {syncLog && (
                        <p style={{ margin: '8px 0 0', fontSize: '0.62rem', color: '#78350f', fontWeight: 600 }}>
                            {syncLog}
                        </p>
                    )}
                </div>

                {/* ── Subir nuevo video ── */}
                <div style={{ background: '#f1f5f9', padding: 15, borderRadius: 15, marginBottom: 20 }}>
                    <p style={{ margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700, color: '#1e3a8a' }}>Subir nuevo video</p>
                    <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)}
                        placeholder="Título del video"
                        style={{ width: '100%', padding: 10, marginBottom: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                    <input type="text" value={fecha} onChange={e => setFecha(e.target.value)}
                        placeholder="Fecha (Ej: 10 Feb 2026)"
                        style={{ width: '100%', padding: 10, marginBottom: 10, borderRadius: 8, border: '1px solid #ccc', boxSizing: 'border-box' }} />
                    <input type="file" accept="video/*" onChange={e => setVideoFile(e.target.files?.[0] ?? null)}
                        style={{ marginBottom: 15 }} />
                    {uploading ? (
                        <div>
                            <div style={{ background: '#e2e8f0', borderRadius: 8, height: 8, overflow: 'hidden' }}>
                                <div style={{ width: `${progress}%`, height: '100%', background: '#1e3a8a', transition: 'width 0.3s' }} />
                            </div>
                            <p style={{ color: '#10b981', fontWeight: 700, fontSize: '0.75rem', marginTop: 6 }}>Subiendo {progress}%...</p>
                        </div>
                    ) : (
                        <button onClick={handleUpload}
                            style={{ width: '100%', background: '#1e3a8a', color: 'white', padding: 12, borderRadius: 10, fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
                            SUBIR VIDEO
                        </button>
                    )}
                </div>

                {/* ── Lista de videos registrados ── */}
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                    {videos.length} videos registrados en la app
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {videos.map(v => (
                        <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, gap: 10 }}>
                            <div style={{ minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {v.titulo}
                                </p>
                                <p style={{ margin: '2px 0 0', fontSize: '0.58rem', color: '#94a3b8' }}>{v.fecha}</p>
                            </div>
                            <button onClick={() => handleDelete(v.id)}
                                style={{ color: '#ef4444', border: 'none', background: 'none', fontSize: '1rem', cursor: 'pointer', flexShrink: 0 }}>
                                🗑
                            </button>
                        </div>
                    ))}
                    {videos.length === 0 && (
                        <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.7rem', padding: 20 }}>
                            No hay videos registrados. Usa el botón de sincronización arriba.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminVideos;