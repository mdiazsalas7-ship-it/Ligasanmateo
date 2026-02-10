import React, { useState, useEffect } from 'react';
import { db, storage } from './firebase'; 
import { collection, addDoc, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'; 

const AdminVideos = ({ onClose }) => {
    const [titulo, setTitulo] = useState('');
    const [fecha, setFecha] = useState('');
    const [videoFile, setVideoFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [videos, setVideos] = useState([]);

    const fetchVideos = async () => {
        try {
            const q = query(collection(db, "entrevistas"), orderBy("fecha", "desc"));
            const snap = await getDocs(q);
            setVideos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error("Error al cargar videos", e);
        }
    };

    useEffect(() => { fetchVideos(); }, []);

    const handleFileChange = (e) => {
        if (e.target.files[0]) {
            setVideoFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!titulo || !videoFile) return alert("Falta título o video");
        setUploading(true);
        
        const storageRef = ref(storage, `videos_entrevistas/${Date.now()}_${videoFile.name}`);
        const uploadTask = uploadBytesResumable(storageRef, videoFile);

        uploadTask.on('state_changed', 
            (snapshot) => {
                const prog = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                setProgress(prog);
            }, 
            (error) => {
                console.error(error);
                alert("Error al subir video");
                setUploading(false);
            }, 
            async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                await addDoc(collection(db, "entrevistas"), {
                    titulo: titulo.toUpperCase(),
                    videoUrl: downloadURL,
                    fecha: fecha || new Date().toLocaleDateString(),
                    thumbnailUrl: "" 
                });
                alert("✅ Video subido correctamente");
                setUploading(false);
                setProgress(0);
                setTitulo('');
                setVideoFile(null);
                fetchVideos();
            }
        );
    };

    const handleDelete = async (id) => {
        if(!window.confirm("¿Borrar esta entrevista?")) return;
        try {
            await deleteDoc(doc(db, "entrevistas", id));
            fetchVideos();
        } catch (e) { alert("Error al borrar"); }
    };

    return (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'#f8fafc', zIndex:2000, overflowY:'auto', padding:'20px' }}>
            <div style={{ maxWidth:'600px', margin:'0 auto', background:'white', padding:'20px', borderRadius:'20px', boxShadow:'0 10px 30px rgba(0,0,0,0.1)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px' }}>
                    <h2 style={{ margin:0, color:'#1e3a8a' }}>Gestión de Videos 🎥</h2>
                    <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.2rem', cursor:'pointer' }}>✖</button>
                </div>

                <div style={{ background:'#f1f5f9', padding:'15px', borderRadius:'15px', marginBottom:'20px' }}>
                    <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título del video" style={{ width:'100%', padding:'10px', marginBottom:'10px', borderRadius:'8px', border:'1px solid #ccc' }} />
                    <input type="text" value={fecha} onChange={e => setFecha(e.target.value)} placeholder="Fecha (Ej: 10 Feb)" style={{ width:'100%', padding:'10px', marginBottom:'10px', borderRadius:'8px', border:'1px solid #ccc' }} />
                    <input type="file" accept="video/*" onChange={handleFileChange} style={{ marginBottom:'15px' }} />
                    
                    {uploading ? (
                        <p style={{color:'#10b981', fontWeight:'bold'}}>Subiendo {progress}% ...</p>
                    ) : (
                        <button onClick={handleUpload} style={{ width:'100%', background:'#1e3a8a', color:'white', padding:'12px', borderRadius:'10px', fontWeight:'bold' }}>SUBIR</button>
                    )}
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                    {videos.map(v => (
                        <div key={v.id} style={{ display:'flex', justifyContent:'space-between', padding:'10px', border:'1px solid #eee', borderRadius:'10px' }}>
                            <span>{v.titulo}</span>
                            <button onClick={() => handleDelete(v.id)} style={{color:'red', border:'none', background:'none'}}>🗑</button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AdminVideos;