import React, { useState, useEffect } from 'react';
import { db, storage } from './firebase'; 
import { collection, getDocs, doc, updateDoc, deleteDoc, addDoc, query, where, orderBy, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'; 

// Actualizamos la interfaz para incluir el número
interface Player { id?: string; nombre: string; numero?: number; }
interface Equipo { id: string; nombre: string; grupo: string; logoUrl?: string; victorias: number; derrotas: number; puntos: number; puntos_favor: number; puntos_contra: number; }

const AdminEquipos: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [view, setView] = useState<'list' | 'addTeam' | 'forma21'>('list');
    const [equipos, setEquipos] = useState<Equipo[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingPlayers, setLoadingPlayers] = useState(false);
    const [uploadingId, setUploadingId] = useState<string | null>(null); 
    
    const [teamName, setTeamName] = useState('');
    const [teamGroup, setTeamGroup] = useState('A'); 
    const [newLogoUrl, setNewLogoUrl] = useState('');

    const [selectedTeam, setSelectedTeam] = useState<Equipo | null>(null);
    const [players, setPlayers] = useState<Player[]>([]);
    const [newPlayerName, setNewPlayerName] = useState('');
    const [newPlayerNumber, setNewPlayerNumber] = useState('');

    // ESTADOS PARA EDICIÓN DE NÚMERO
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editNumberValue, setEditNumberValue] = useState('');

    const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/166/166344.png";

    const fetchEquipos = async () => {
        setLoading(true);
        const q = query(collection(db, 'equipos'), orderBy('nombre', 'asc'));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Equipo));
        setEquipos(list);
        setLoading(false);
    };

    useEffect(() => { fetchEquipos(); }, []);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, teamId?: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
        if (!allowedTypes.includes(file.type)) return alert("❌ Solo se permiten imágenes JPG o PNG.");

        const targetId = teamId || 'new';
        setUploadingId(targetId);

        try {
            const storageRef = ref(storage, `logos_equipos/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            if (teamId) {
                await updateDoc(doc(db, 'equipos', teamId), { logoUrl: downloadURL });
                alert("✅ Logo actualizado correctamente.");
                fetchEquipos();
            } else {
                setNewLogoUrl(downloadURL);
                alert("✅ Imagen cargada.");
            }
        } catch (error) {
            console.error(error);
            alert("Error al subir la imagen.");
        } finally {
            setUploadingId(null);
        }
    };

    const fetchPlayers = async (teamId: string) => {
        setLoadingPlayers(true);
        try {
            const q = query(collection(db, 'jugadores'), where('equipoId', '==', teamId));
            const snap = await getDocs(q);
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
            setPlayers(list.sort((a, b) => (a.numero || 0) - (b.numero || 0)));
        } catch (error) { console.error(error); }
        setLoadingPlayers(false);
    };

    // FUNCIÓN PARA GUARDAR LA EDICIÓN DEL NÚMERO
    const handleSaveNumber = async (playerId: string) => {
        if (!editNumberValue) return alert("Pon un número");
        try {
            await updateDoc(doc(db, 'jugadores', playerId), {
                numero: parseInt(editNumberValue)
            });
            setPlayers(players.map(p => p.id === playerId ? { ...p, numero: parseInt(editNumberValue) } : p).sort((a, b) => (a.numero || 0) - (b.numero || 0)));
            setEditingId(null);
            setEditNumberValue('');
        } catch (e) { alert("Error al actualizar número"); }
    };

    const handleDeleteTeam = async (teamId: string, nombre: string) => {
        if (!window.confirm(`⚠️ ¿ELIMINAR COMPLETAMENTE a "${nombre}"?`)) return;
        if (!window.confirm(`Esto borrará también a todos los jugadores. ¿Proceder?`)) return;

        setLoading(true);
        try {
            const batch = writeBatch(db);
            const qPlayers = query(collection(db, 'jugadores'), where('equipoId', '==', teamId));
            const snapPlayers = await getDocs(qPlayers);
            snapPlayers.docs.forEach(pDoc => batch.delete(pDoc.ref));
            batch.delete(doc(db, 'equipos', teamId));
            await batch.commit();
            alert(`🗑️ "${nombre}" eliminado.`);
            fetchEquipos();
        } catch (error) { alert("Error al eliminar."); }
        setLoading(false);
    };

    const handleOpenForma21 = (eq: Equipo) => {
        setSelectedTeam(eq);
        fetchPlayers(eq.id);
        setView('forma21');
    };

    const handleCreateTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!teamName) return alert("El nombre es obligatorio");
        try {
            await addDoc(collection(db, 'equipos'), {
                nombre: teamName.toUpperCase(), grupo: teamGroup,
                logoUrl: newLogoUrl || DEFAULT_LOGO,
                victorias: 0, derrotas: 0, puntos: 0, puntos_favor: 0, puntos_contra: 0
            });
            setTeamName(''); setNewLogoUrl(''); setView('list'); fetchEquipos();
        } catch (error) { alert("Error al crear equipo"); }
    };

    const handleAddPlayer = async () => {
        if (!newPlayerName.trim() || !newPlayerNumber || players.length >= 15 || !selectedTeam) {
            return alert("Falta nombre o número de uniforme.");
        }
        
        const numExistente = players.find(p => p.numero === parseInt(newPlayerNumber));
        if (numExistente) return alert(`El número ${newPlayerNumber} ya está asignado a ${numExistente.nombre}`);

        try {
            const playerDoc = {
                nombre: newPlayerName.toUpperCase(),
                numero: parseInt(newPlayerNumber),
                equipoId: selectedTeam.id,
                equipoNombre: selectedTeam.nombre,
                grupo: selectedTeam.grupo,
                puntos: 0, triples: 0, rebotes: 0, asistencias: 0, faltas: 0, robos: 0, bloqueos: 0
            };
            const docRef = await addDoc(collection(db, 'jugadores'), playerDoc);
            const newList = [...players, { id: docRef.id, nombre: playerDoc.nombre, numero: playerDoc.numero }];
            setPlayers(newList.sort((a, b) => (a.numero || 0) - (b.numero || 0)));
            setNewPlayerName('');
            setNewPlayerNumber('');
        } catch (error) { alert("Error al registrar"); }
    };

    const handleDeletePlayer = async (playerId: string, nombre: string) => {
        if (!window.confirm(`⚠️ ¿Eliminar a "${nombre}"?`)) return;
        try {
            await deleteDoc(doc(db, 'jugadores', playerId));
            setPlayers(players.filter(p => p.id !== playerId));
        } catch (error) { alert("Error al eliminar"); }
    };

    return (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.95)', zIndex:2000, display:'flex', justifyContent:'center', padding:'20px', overflowY:'auto' }}>
            <div style={{ background:'white', width:'100%', maxWidth:'650px', borderRadius:'12px', overflow:'hidden', height:'fit-content', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                
                <div style={{ padding:'15px', background:'#1e3a8a', color:'white', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <h3 style={{margin:0, fontSize:'1.1rem'}}>🛡️ Gestión de Equipos y F21</h3>
                    <button onClick={onClose} style={{ background:'none', border:'1px solid white', color:'white', padding:'4px 10px', borderRadius:'4px', cursor:'pointer' }}>Cerrar</button>
                </div>

                <div style={{ padding:'20px' }}>
                    {view === 'list' && (
                        <>
                            <button onClick={() => setView('addTeam')} style={{ width:'100%', padding:'12px', background:'#10b981', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold', marginBottom:'20px', cursor:'pointer' }}>+ REGISTRAR NUEVO EQUIPO</button>
                            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                                {loading ? <p style={{textAlign:'center'}}>Cargando equipos...</p> : equipos.map(eq => (
                                    <div key={eq.id} style={{ padding:'15px', border:'1px solid #eee', borderRadius:'10px', background:'#f8fafc' }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:'15px' }}>
                                            <div style={{ textAlign: 'center' }}>
                                                <img src={eq.logoUrl || DEFAULT_LOGO} style={{ width:'55px', height:'55px', borderRadius:'50%', objectFit:'cover', border:'1px solid #ddd', background:'#fff' }} />
                                                <label style={{ display: 'block', fontSize: '0.6rem', color: '#1e3a8a', cursor: 'pointer', fontWeight: 'bold', marginTop: '5px', textDecoration: 'underline' }}>
                                                    {uploadingId === eq.id ? '...' : 'CAMBIAR'}
                                                    <input type="file" accept="image/png, image/jpeg" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e, eq.id)} />
                                                </label>
                                            </div>
                                            <div style={{ flex:1 }}>
                                                <div style={{ fontWeight:'bold', fontSize:'1rem' }}>{eq.nombre}</div>
                                                <span style={{fontSize:'0.7rem', color:'#3b82f6', background:'#dbeafe', padding:'2px 6px', borderRadius:'4px'}}>Grupo {eq.grupo}</span>
                                            </div>
                                            <div style={{display:'flex', flexDirection:'column', gap:'5px'}}>
                                                <button onClick={() => handleOpenForma21(eq)} style={{ background:'#f59e0b', color:'white', border:'none', padding:'8px 12px', borderRadius:'6px', fontWeight:'bold', cursor:'pointer', fontSize:'0.75rem' }}>NÓMINA F21</button>
                                                <button onClick={() => handleDeleteTeam(eq.id, eq.nombre)} style={{ background:'#ef4444', color:'white', border:'none', padding:'8px', borderRadius:'6px', cursor:'pointer', fontSize:'0.8rem' }}>🗑️</button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {view === 'addTeam' && (
                        <div style={{ display:'flex', flexDirection:'column', gap:'15px' }}>
                            <h4 style={{margin:0}}>🆕 Nuevo Equipo</h4>
                            <input type="text" placeholder="NOMBRE DEL EQUIPO" value={teamName} onChange={e => setTeamName(e.target.value.toUpperCase())} style={{ padding:'12px', borderRadius:'6px', border:'1px solid #ccc' }} />
                            
                            <div style={{ background: '#f1f5f9', padding: '15px', borderRadius: '10px', textAlign: 'center', border: '2px dashed #cbd5e1' }}>
                                {newLogoUrl ? (
                                    <img src={newLogoUrl} style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', marginBottom: '10px' }} />
                                ) : <div style={{ fontSize: '2rem' }}>🖼️</div>}
                                <label style={{ display: 'block', background: '#334155', color: 'white', padding: '8px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    {uploadingId === 'new' ? 'SUBIENDO...' : 'SUBIR LOGO'}
                                    <input type="file" accept="image/png, image/jpeg" style={{ display: 'none' }} onChange={(e) => handleFileUpload(e)} />
                                </label>
                            </div>

                            <select value={teamGroup} onChange={e => setTeamGroup(e.target.value)} style={{ padding:'12px', borderRadius:'6px', border:'1px solid #ccc' }}>
                                <option value="A">GRUPO A</option>
                                <option value="B">GRUPO B</option>
                            </select>
                            
                            <button onClick={handleCreateTeam} disabled={uploadingId === 'new'} style={{ padding:'15px', background: uploadingId === 'new' ? '#94a3b8' : '#10b981', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold', cursor:'pointer' }}>GUARDAR EQUIPO</button>
                            <button onClick={() => setView('list')} style={{ background:'none', border:'none', color:'#666', cursor:'pointer' }}>Cancelar</button>
                        </div>
                    )}

                    {view === 'forma21' && selectedTeam && (
                        <div>
                            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
                                <h4 style={{ color:'#1e3a8a', margin:0 }}>📝 Nómina: {selectedTeam.nombre}</h4>
                                <span style={{fontSize:'0.8rem', fontWeight:'bold', color: players.length >= 15 ? 'red' : '#666'}}>
                                    {players.length} / 15 Jugadores
                                </span>
                            </div>

                            <div style={{ display:'flex', gap:'8px', marginBottom:'15px' }}>
                                <input 
                                    type="number" 
                                    placeholder="N°" 
                                    value={newPlayerNumber} 
                                    onChange={e => setNewPlayerNumber(e.target.value)} 
                                    style={{ width:'60px', padding:'12px', borderRadius:'6px', border:'1px solid #ccc', fontWeight:'bold', textAlign:'center' }} 
                                />
                                <input 
                                    type="text" 
                                    placeholder="NOMBRE Y APELLIDO" 
                                    value={newPlayerName} 
                                    onChange={e => setNewPlayerName(e.target.value)} 
                                    onKeyPress={e => e.key === 'Enter' && handleAddPlayer()} 
                                    style={{ flex:1, padding:'12px', borderRadius:'6px', border:'1px solid #ccc' }} 
                                />
                                <button onClick={handleAddPlayer} style={{ padding:'0 20px', background:'#1e3a8a', color:'white', border:'none', borderRadius:'6px', fontWeight:'bold', cursor:'pointer' }}>AÑADIR</button>
                            </div>

                            <div style={{ maxHeight:'350px', overflowY:'auto', border:'1px solid #eee', borderRadius:'8px', marginBottom:'20px' }}>
                                {loadingPlayers ? <p style={{padding:'20px', textAlign:'center'}}>Cargando nómina...</p> : (
                                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                                        <thead style={{ background:'#f1f5f9', position:'sticky', top:0 }}>
                                            <tr>
                                                <th style={{padding:'10px', textAlign:'center', fontSize:'0.75rem', width:'45px'}}>N°</th>
                                                <th style={{padding:'10px', textAlign:'left', fontSize:'0.75rem'}}>JUGADOR</th>
                                                <th style={{padding:'10px', textAlign:'center', fontSize:'0.75rem', width:'100px'}}>ACCIONES</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {players.map((p) => (
                                                <tr key={p.id} style={{ borderBottom:'1px solid #eee' }}>
                                                    <td style={{padding:'10px', textAlign:'center'}}>
                                                        {editingId === p.id ? (
                                                            <input 
                                                                type="number" 
                                                                value={editNumberValue} 
                                                                onChange={e => setEditNumberValue(e.target.value)}
                                                                style={{ width:'40px', textAlign:'center', border:'1px solid #3b82f6', borderRadius:'4px' }}
                                                                autoFocus
                                                            />
                                                        ) : (
                                                            <b style={{color:'#1e3a8a'}}>{p.numero || '--'}</b>
                                                        )}
                                                    </td>
                                                    <td style={{padding:'10px', fontSize:'0.9rem'}}>{p.nombre}</td>
                                                    <td style={{padding:'10px', textAlign:'center'}}>
                                                        <div style={{display:'flex', gap:'5px', justifyContent:'center'}}>
                                                            {editingId === p.id ? (
                                                                <button onClick={() => handleSaveNumber(p.id!)} style={{ background:'#10b981', color:'white', border:'none', borderRadius:'4px', padding:'5px', cursor:'pointer' }}>✅</button>
                                                            ) : (
                                                                <button onClick={() => { setEditingId(p.id!); setEditNumberValue(p.numero?.toString() || ''); }} style={{ background:'#3b82f6', color:'white', border:'none', borderRadius:'4px', padding:'5px', cursor:'pointer' }}>✏️</button>
                                                            )}
                                                            <button onClick={() => handleDeletePlayer(p.id!, p.nombre)} style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'1.1rem'}}>🗑️</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                            <button onClick={() => { setView('list'); setPlayers([]); }} style={{ width:'100%', padding:'15px', background:'#6b7280', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold', cursor:'pointer' }}>VOLVER A EQUIPOS</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminEquipos;