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

    const [showMatchSelector, setShowMatchSelector] = useState(false);
    const [recentMatches, setRecentMatches] = useState<PartidoFinalizado[]>([]);
    const [loadingMatches, setLoadingMatches] = useState(false);

    const p1 = "sk-or-v1-09b7a0e6db89101ea9fee4db191b4679";
    const p2 = "9ffbfd8188cc2de82ace935725c78f3b";
    
    const redactarConIA = async (matchData?: PartidoFinalizado) => {
        setLoading(true);
        const FULL_KEY = p1 + p2;

        let prompt = "";
        if (matchData) {
            const dif = Math.abs(matchData.scoreL - matchData.scoreV);
            const contexto = dif >= 15 ? "fue una PELA o PALIZA contundente" : dif <= 5 ? "fue un JUEGO CERRADO de INFARTO" : "fue un duelo muy disputado";
            
            prompt = `Actúa como un cronista deportivo estrella de la Liga Metropolitana de Baloncesto. Redacta una noticia explosiva (máx 130 palabras).
            PARTIDO: ${matchData.local} vs ${matchData.visitante}. 
            SCORE: ${matchData.scoreL} - ${matchData.scoreV} (${contexto}).
            MVP: ${matchData.mvp} con ${matchData.puntosMvp} puntos.

            REQUISITOS:
            1. TÍTULO EN MAYÚSCULAS: Menciona quién ganó. Si la ventaja es >15 usa 'PELA'. Si es <5 usa 'INFARTO'.
            2. CUERPO: Describe el ambiente. Haz un pase por el Boxscore resaltando al MVP y su dominio.
            3. TABLA: Menciona si el ganador sube en la tabla o si el perdedor se complica.
            4. ESTILO: Baloncesto criollo, apasionado y profesional.
            
            IMPORTANTE: Separa el título del cuerpo con la palabra 'CUERPO:'.`;
        } else {
            prompt = `Mejora este comunicado para la Liga Metropolitana Master 40: "${titulo}". Hazlo institucional y profesional. Máximo 100 palabras.`;
        }

        try {
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${FULL_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    "model": "openai/gpt-3.5-turbo",
                    "messages": [
                        { "role": "system", "content": "Eres el Jefe de Prensa de la Liga Metropolitana. Tu redacción es técnica, épica y conocedora del basket." },
                        { "role": "user", "content": prompt }
                    ]
                })
            });

            const data = await response.json();
            const texto = data.choices[0].message.content;

            if (matchData) {
                if (texto.includes("CUERPO:")) {
                    const partes = texto.split("CUERPO:");
                    setTitulo(partes[0].replace("Título:", "").replace("TÍTULO:", "").trim().toUpperCase());
                    setCuerpo(partes[1].trim());
                } else {
                    setCuerpo(texto);
                }
                setTipo('destacado');
            } else {
                setCuerpo(texto);
            }
        } catch (e) {
            alert("Error con la IA. Revisa la conexión.");
        } finally {
            setLoading(false);
        }
    };

    const fetchRecentMatches = async () => {
        setLoadingMatches(true);
        try {
            // Buscamos juegos finalizados sin límite estricto para no perder resultados
            const q = query(collection(db, 'calendario'), where('estatus', '==', 'finalizado'));
            const snap = await getDocs(q);
            
            let matchesData = await Promise.all(snap.docs.map(async (docSnap) => {
                const d = docSnap.data();
                let mvpNombre = "Figura destacada";
                let mvpPuntos = 0;

                // Entramos al Boxscore para sacar al MVP real (el que más puntos hizo)
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

            // Ordenamos por los más recientes
            setRecentMatches(matchesData.sort((a, b) => b.fecha.localeCompare(a.fecha)));
            setShowMatchSelector(true);
        } catch (e) {
            alert("Error al cargar los últimos resultados.");
        } finally {
            setLoadingMatches(false);
        }
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
            fetchNews();
            alert("✅ Noticia publicada con éxito."); 
        } catch (e) { alert("Error al publicar."); } finally { setLoading(false); }
    };

    const fetchNews = async () => {
        const q = query(collection(db, 'noticias'), orderBy('fecha', 'desc'));
        const snap = await getDocs(q);
        setNews(snap.docs.map(d => ({ id: d.id, ...d.data() } as NewsItem)));
    };

    useEffect(() => { fetchNews(); }, []);

    const handleDelete = async (id: string) => {
        if(!window.confirm("¿Eliminar noticia?")) return;
        await deleteDoc(doc(db, 'noticias', id));
        setNews(prev => prev.filter(n => n.id !== id));
    };

    return (
        <div style={{maxWidth: '800px', margin: '0 auto', background: '#fff', borderRadius: '15px', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.1)'}}>
            <div style={{display:'flex', justifyContent:'space-between', padding: '20px', background: '#1e3a8a', color: 'white'}}>
                <h2 style={{fontSize: '1rem', margin: 0, fontWeight: '900'}}>📰 PRENSA OFICIAL MASTER 40</h2>
                <button onClick={onClose} style={{background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '5px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight:'bold'}}>Cerrar</button>
            </div>

            <div style={{padding: '20px'}}>
                <button onClick={fetchRecentMatches} disabled={loadingMatches} style={{ width: '100%', marginBottom: '20px', background: 'linear-gradient(45deg, #1e3a8a, #3b82f6)', color: 'white', fontWeight: '900', padding: '15px', border: 'none', borderRadius: '12px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(30, 58, 138, 0.2)' }}>
                    {loadingMatches ? 'BUSCANDO BOXSCORES...' : '✨ REDACTAR CRÓNICA DESDE RESULTADOS (IA)'}
                </button>

                <form onSubmit={handlePublicar} style={{background:'#f8fafc', padding:'20px', borderRadius:'15px', border:'1px solid #e2e8f0', marginBottom: '30px'}}>
                    <div style={{marginBottom:'15px'}}>
                        <label style={{fontWeight:'900', color: '#1e3a8a', display: 'block', marginBottom: '8px', fontSize: '0.75rem'}}>TÍTULO DE LA CRÓNICA</label>
                        <input type="text" value={titulo} onChange={e=>setTitulo(e.target.value)} required placeholder="Ej: PELA HISTÓRICA EN EL EJE ESTE" style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold'}} />
                    </div>
                    
                    <div style={{marginBottom:'15px'}}>
                        <label style={{fontWeight:'900', color: '#1e3a8a', display: 'block', marginBottom: '8px', fontSize: '0.75rem'}}>FOTO DEL ENCUENTRO</label>
                        <input type="file" accept="image/*" onChange={(e) => { if (e.target.files) setImageFile(e.target.files[0]); }} style={{width: '100%', background: '#fff', padding: '10px', border: '1px dashed #cbd5e1', borderRadius: '8px'}} />
                    </div>

                    <div style={{marginBottom:'15px', position:'relative'}}>
                        <label style={{fontWeight:'900', color: '#1e3a8a', display: 'block', marginBottom: '8px', fontSize: '0.75rem'}}>CUERPO DE LA NOTICIA</label>
                        <textarea value={cuerpo} onChange={e=>setCuerpo(e.target.value)} required style={{width:'100%', padding:'15px', borderRadius:'8px', border:'1px solid #cbd5e1', minHeight:'180px', fontFamily: 'inherit', lineHeight: '1.5', fontSize: '0.85rem'}} />
                        <button type="button" onClick={() => redactarConIA()} style={{position:'absolute', bottom:'15px', right:'15px', background:'#1e3a8a', color:'white', border:'none', padding:'6px 12px', borderRadius:'6px', fontSize:'0.6rem', cursor:'pointer', fontWeight: '900'}}>🪄 MEJORAR TEXTO</button>
                    </div>

                    <button disabled={loading} style={{width:'100%', padding:'16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '12px', fontWeight: '900', fontSize: '0.9rem', cursor: 'pointer', borderBottom: '4px solid #059669'}}>
                        {loading ? 'SINCRONIZANDO...' : 'PUBLICAR EN EL TABLÓN'}
                    </button>
                </form>

                <h3 style={{color: '#1e3a8a', fontSize: '0.8rem', marginBottom: '10px', fontWeight: '900', textTransform: 'uppercase'}}>Historial de Boletines</h3>
                <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                    {news.map(n => (
                        <div key={n.id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 15px', border:'1px solid #e2e8f0', borderRadius:'12px', background:'#fff'}}>
                            <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                                {n.imageUrl && <img src={n.imageUrl} alt="n" style={{width:'35px', height:'35px', objectFit:'cover', borderRadius:'6px'}} />}
                                <div style={{fontSize:'0.75rem', fontWeight:'700', color: '#334155'}}>{n.titulo}</div>
                            </div>
                            <button onClick={()=>handleDelete(n.id)} style={{background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem'}}>🗑️</button>
                        </div>
                    ))}
                </div>
            </div>

            {showMatchSelector && (
                <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.85)', zIndex:3000, display:'flex', justifyContent:'center', alignItems:'center', padding:'20px', backdropFilter: 'blur(3px)'}}>
                    <div style={{background:'white', width:'100%', maxWidth:'400px', borderRadius:'20px', padding:'20px', maxHeight:'80vh', overflowY:'auto'}}>
                        <h3 style={{margin: '0 0 15px 0', color: '#1e3a8a', fontWeight: '900', fontSize:'1rem', textAlign:'center'}}>SELECCIONA UN RESULTADO</h3>
                        <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                            {recentMatches.map(m => (
                                <div key={m.id} onClick={() => { setShowMatchSelector(false); redactarConIA(m); }} style={{ border:'2px solid #f1f5f9', padding:'15px', borderRadius:'12px', cursor:'pointer', background:'#f8fafc' }}>
                                    <div style={{fontWeight:'900', color:'#1e3a8a', marginBottom: '5px', fontSize: '0.8rem'}}>{m.local} vs {m.visitante}</div>
                                    <div style={{fontSize:'1.4rem', fontWeight:'900', color: '#111'}}>{m.scoreL} - {m.scoreV}</div>
                                    <div style={{fontSize:'0.65rem', color:'#64748b', marginTop: '5px'}}>MVP: {m.mvp} ({m.puntosMvp} pts)</div>
                                </div>
                            ))}
                        </div>
                        <button onClick={() => setShowMatchSelector(false)} style={{width:'100%', marginTop:'15px', padding:'12px', background:'#ef4444', color:'white', border:'none', borderRadius:'10px', fontWeight: 'bold', fontSize:'0.7rem'}}>CANCELAR</button>
                    </div>
                </div>
            )}
        </div>
    );
};
export default NewsAdmin;