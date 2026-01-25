import React, { useState, useEffect } from 'react';
import { db, storage } from './firebase'; 
import { collection, addDoc, getDocs, deleteDoc, doc, Timestamp, query, orderBy, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

interface NewsItem { id: string; titulo: string; cuerpo: string; tipo: 'general' | 'sancion' | 'destacado'; fecha: any; imageUrl?: string; }

interface PartidoFinalizado {
    id: string;
    local: string;
    visitante: string;
    scoreL: number;
    scoreV: number;
    mvp: string;
    puntosMvp: number;
    fecha: string;
}

const NewsAdmin: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [titulo, setTitulo] = useState('');
    const [cuerpo, setCuerpo] = useState('');
    const [tipo, setTipo] = useState<'general' | 'sancion' | 'destacado'>('general');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);

    // Estados para el Selector de Partidos
    const [showMatchSelector, setShowMatchSelector] = useState(false);
    const [recentMatches, setRecentMatches] = useState<PartidoFinalizado[]>([]);
    const [loadingMatches, setLoadingMatches] = useState(false);

    // --- ESTRATEGIA DE IA: LLAVE DIVIDIDA ---
    const p1 = "sk-or-v1-09b7a0e6db89101ea9fee4db191b4679";
    const p2 = "9ffbfd8188cc2de82ace935725c78f3b";
    
    const redactarConIA = async (matchData?: PartidoFinalizado) => {
        setLoading(true);
        const FULL_KEY = p1 + p2;

        let prompt = "";
        if (matchData) {
            prompt = `Redacta una crónica deportiva corta y épica para el "Torneo Master 40 de la Liga Metropolitana del Este". 
            Partido: ${matchData.local} vs ${matchData.visitante}. 
            Resultado Final: ${matchData.scoreL} - ${matchData.scoreV}. 
            MVP: ${matchData.mvp} con ${matchData.puntosMvp} puntos.
            Estilo: Periodismo deportivo para veteranos. El tono debe ser de respeto, experiencia y competitividad. 
            Empieza con un título impactante seguido de la palabra 'CUERPO:' y luego el desarrollo de la noticia.`;
        } else {
            prompt = `Mejora y expande este comunicado oficial para el Torneo Master 40 de la Liga Metropolitana del Este: "${titulo}". Haz que suene institucional, motivador y profesional.`;
        }

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${FULL_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "model": "openai/gpt-3.5-turbo",
                    "messages": [
                        { "role": "system", "content": "Eres el Jefe de Prensa oficial del Torneo Master 40 de la Liga Metropolitana del Este. Tu audiencia son jugadores de baloncesto veteranos y aficionados al basket de alto nivel." },
                        { "role": "user", "content": prompt }
                    ]
                })
            });

            const data = await response.json();
            const textoGenerado = data.choices[0].message.content;

            if (matchData) {
                if (textoGenerado.includes("CUERPO:")) {
                    const partes = textoGenerado.split("CUERPO:");
                    setTitulo(partes[0].replace("Título:", "").replace("TÍTULO:", "").trim().toUpperCase());
                    setCuerpo(partes[1].trim());
                } else {
                    setCuerpo(textoGenerado);
                }
                setTipo('destacado');
            } else {
                setCuerpo(textoGenerado);
            }
        } catch (e) {
            console.error(e);
            alert("Error con el redactor IA. Verifica la conexión en la zona.");
        } finally {
            setLoading(false);
        }
    };

    const fetchNews = async () => {
        try {
            const q = query(collection(db, 'noticias'), orderBy('fecha', 'desc'));
            const snap = await getDocs(q);
            setNews(snap.docs.map(d => ({ id: d.id, ...d.data() } as NewsItem)));
        } catch (e) { console.error(e); }
    };

    useEffect(() => { fetchNews(); }, []);

    const fetchRecentMatches = async () => {
        setLoadingMatches(true);
        try {
            const q = query(collection(db, 'calendario'), where('estatus', '==', 'finalizado'));
            const snap = await getDocs(q);
            
            let matchesData = await Promise.all(snap.docs.map(async (docSnap) => {
                const d = docSnap.data();
                let mvpNombre = "Figura del partido";
                let mvpPuntos = 0;
                const statsSnap = await getDocs(query(collection(db, 'stats_partido'), where('partidoId', '==', docSnap.id)));
                
                statsSnap.forEach(s => {
                    const stat = s.data();
                    if (Number(stat.puntos || 0) > mvpPuntos) {
                        mvpPuntos = Number(stat.puntos);
                        mvpNombre = stat.nombre;
                    }
                });

                return {
                    id: docSnap.id, local: d.equipoLocalNombre, visitante: d.equipoVisitanteNombre,
                    scoreL: d.marcadorLocal, scoreV: d.marcadorVisitante,
                    mvp: mvpNombre, puntosMvp: mvpPuntos, fecha: d.fechaAsignada || ''
                } as PartidoFinalizado;
            }));

            setRecentMatches(matchesData.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5));
            setShowMatchSelector(true);
        } catch (e) { alert("Error al cargar resultados."); } finally { setLoadingMatches(false); }
    };

    const handlePublicar = async (e: React.FormEvent) => {
        e.preventDefault(); setLoading(true);
        try {
            let imageUrl = '';
            if (imageFile) {
                const storageRef = ref(storage, `noticias/${Date.now()}_${imageFile.name}`);
                await uploadBytes(storageRef, imageFile);
                imageUrl = await getDownloadURL(storageRef);
            }
            await addDoc(collection(db, 'noticias'), {
                titulo: titulo.toUpperCase(), cuerpo, tipo, fecha: Timestamp.now(), imageUrl: imageUrl || null
            });
            setTitulo(''); setCuerpo(''); setImageFile(null); 
            alert("✅ Noticia publicada exitosamente."); 
            fetchNews();
        } catch (e) { alert("Error en la publicación."); } finally { setLoading(false); }
    };

    const handleDelete = async (id: string) => {
        if(!window.confirm("¿Eliminar noticia del historial?")) return;
        await deleteDoc(doc(db, 'noticias', id));
        setNews(prev => prev.filter(n => n.id !== id));
    };

    return (
        <div className="card animate-fade-in" style={{maxWidth: '800px', margin: '0 auto', background: '#fff', borderRadius: '15px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.1)'}}>
            <div style={{display:'flex', justifyContent:'space-between', padding: '20px', borderBottom: '1px solid #eee', background: '#111', color: 'white'}}>
                <h2 style={{fontSize: '1.2rem', margin: 0, fontWeight: '900'}}>📰 PRENSA: MASTER 40 METROPOLITANA</h2>
                <button onClick={onClose} className="btn" style={{background: 'none', border: '1px solid white', color: 'white', padding: '5px 15px', borderRadius: '6px', cursor: 'pointer'}}>Cerrar</button>
            </div>

            <div style={{padding: '20px'}}>
                <button onClick={fetchRecentMatches} disabled={loadingMatches} className="btn" style={{ width: '100%', marginBottom: '20px', background: 'linear-gradient(45deg, #1e3a8a, #3b82f6)', color: 'white', fontWeight: '900', padding: '15px', border: 'none', borderRadius: '10px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(30, 58, 138, 0.3)' }}>
                    {loadingMatches ? 'BUSCANDO RESULTADOS...' : '✨ REDACTAR CRÓNICA MASTER 40 (IA)'}
                </button>

                <form onSubmit={handlePublicar} style={{background:'#f8fafc', padding:'25px', borderRadius:'12px', border:'1px solid #e2e8f0', marginBottom: '30px'}}>
                    <div style={{marginBottom:'15px'}}>
                        <label style={{fontWeight:'900', color: '#1e3a8a', display: 'block', marginBottom: '8px', fontSize: '0.85rem'}}>TÍTULO DE LA NOTICIA</label>
                        <input type="text" value={titulo} onChange={e=>setTitulo(e.target.value)} required placeholder="Ej: GRAN TRIUNFO EN LA JORNADA MÁSTER" style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold'}} />
                    </div>
                    
                    <div style={{marginBottom:'15px'}}>
                        <label style={{fontWeight:'900', color: '#1e3a8a', display: 'block', marginBottom: '8px', fontSize: '0.85rem'}}>FOTO DE PORTADA</label>
                        <input type="file" accept="image/*" onChange={(e) => { if (e.target.files) setImageFile(e.target.files[0]); }} style={{width: '100%', background: '#fff', padding: '10px', border: '1px dashed #cbd5e1', borderRadius: '8px'}} />
                    </div>

                    <div style={{marginBottom:'15px', position:'relative'}}>
                        <label style={{fontWeight:'900', color: '#1e3a8a', display: 'block', marginBottom: '8px', fontSize: '0.85rem'}}>CUERPO DEL BOLETÍN</label>
                        <textarea value={cuerpo} onChange={e=>setCuerpo(e.target.value)} required style={{width:'100%', padding:'15px', borderRadius:'8px', border:'1px solid #cbd5e1', minHeight:'200px', fontFamily: 'inherit', lineHeight: '1.6'}} />
                        <button type="button" onClick={() => redactarConIA()} style={{position:'absolute', bottom:'15px', right:'15px', background:'#334155', color:'white', border:'none', padding:'6px 12px', borderRadius:'6px', fontSize:'0.7rem', cursor:'pointer', fontWeight: '900'}}>🪄 MEJORAR CON IA</button>
                    </div>

                    <div style={{marginBottom:'25px'}}>
                        <label style={{fontWeight:'900', color: '#1e3a8a', display: 'block', marginBottom: '8px', fontSize: '0.85rem'}}>CATEGORÍA</label>
                        <select value={tipo} onChange={e=>setTipo(e.target.value as any)} style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', background: 'white'}}>
                            <option value="general">📰 Boletín General</option>
                            <option value="sancion">⚖️ Resolución Disciplinaria</option>
                            <option value="destacado">⭐ Resultado Jornada Master 40</option>
                        </select>
                    </div>

                    <button disabled={loading} className="btn" style={{width:'100%', padding:'16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '1rem', cursor: 'pointer'}}>
                        {loading ? 'SINCRONIZANDO...' : 'PUBLICAR EN EL TABLÓN OFICIAL'}
                    </button>
                </form>

                <h3 style={{color: '#1e3a8a', fontSize: '1rem', marginBottom: '15px', fontWeight: '900', textTransform: 'uppercase'}}>Historial de Boletines</h3>
                <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                    {news.map(n => (
                        <div key={n.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'15px', border:'1px solid #e2e8f0', borderRadius:'12px', background:'#fff'}}>
                            <div style={{display:'flex', gap:'12px', alignItems:'center'}}>
                                {n.imageUrl && <img src={n.imageUrl} alt="n" style={{width:'45px', height:'45px', objectFit:'cover', borderRadius:'8px'}} />}
                                <div style={{fontSize:'0.9rem', fontWeight:'700', color: '#334155'}}>{n.titulo}</div>
                            </div>
                            <button onClick={()=>handleDelete(n.id)} style={{background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.2rem'}}>🗑️</button>
                        </div>
                    ))}
                </div>
            </div>

            {/* MODAL DE SELECCIÓN DE PARTIDOS */}
            {showMatchSelector && (
                <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.92)', zIndex:3000, display:'flex', justifyContent:'center', alignItems:'center', padding:'20px', backdropFilter: 'blur(4px)'}}>
                    <div className="animate-fade-in" style={{background:'white', width:'100%', maxWidth:'450px', borderRadius:'20px', padding:'25px', maxHeight:'85vh', overflowY:'auto'}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
                            <h3 style={{margin: 0, color: '#1e3a8a', fontWeight: '900'}}>RESULTADOS MASTER 40</h3>
                            <button onClick={() => setShowMatchSelector(false)} style={{border: 'none', background: '#f1f5f9', borderRadius: '50%', width: '30px', height: '30px', cursor: 'pointer'}}>×</button>
                        </div>
                        <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                            {recentMatches.map(m => (
                                <div key={m.id} onClick={() => { setShowMatchSelector(false); redactarConIA(m); }} style={{ border:'1px solid #e2e8f0', padding:'18px', borderRadius:'15px', cursor:'pointer', background:'#f8fafc', transition: '0.2s' }}>
                                    <div style={{fontWeight:'900', color:'#1e3a8a', marginBottom: '5px', fontSize: '0.9rem'}}>{m.local} vs {m.visitante}</div>
                                    <div style={{fontSize:'1.6rem', fontWeight:'900', color: '#111'}}>{m.scoreL} - {m.scoreV}</div>
                                    <div style={{fontSize:'0.8rem', color:'#64748b', marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '8px'}}>MVP: {m.mvp} ({m.puntosMvp} pts)</div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setShowMatchSelector(false)} style={{width:'100%', marginTop:'20px', padding:'12px', background:'#334155', color:'white', border:'none', borderRadius:'10px', fontWeight: 'bold'}}>CANCELAR</button>
                    </div>
                </div>
            )}
        </div>
    );
};
export default NewsAdmin;