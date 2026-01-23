import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, addDoc, query, where, orderBy, writeBatch } from 'firebase/firestore';

interface Player { id?: string; nombre: string; }
interface Equipo { id: string; nombre: string; grupo: string; logoUrl?: string; victorias: number; derrotas: number; puntos: number; puntos_favor: number; puntos_contra: number; }

const AdminEquipos: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [view, setView] = useState<'list' | 'addTeam' | 'forma21'>('list');
    const [equipos, setEquipos] = useState<Equipo[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingPlayers, setLoadingPlayers] = useState(false);
    
    const [editLogos, setEditLogos] = useState<Record<string, string>>({});
    
    const [teamName, setTeamName] = useState('');
    const [teamGroup, setTeamGroup] = useState('A'); 
    const [newLogoUrl, setNewLogoUrl] = useState('');

    const [selectedTeam, setSelectedTeam] = useState<Equipo | null>(null);
    const [players, setPlayers] = useState<Player[]>([]);
    const [newPlayerName, setNewPlayerName] = useState('');

    const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/166/166344.png";

    const fetchEquipos = async () => {
        setLoading(true);
        const q = query(collection(db, 'equipos'), orderBy('nombre', 'asc'));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Equipo));
        setEquipos(list);
        
        const initialLogos: Record<string, string> = {};
        list.forEach(eq => { initialLogos[eq.id] = eq.logoUrl || ''; });
        setEditLogos(initialLogos);
        
        setLoading(false);
    };

    useEffect(() => { fetchEquipos(); }, []);

    const fetchPlayers = async (teamId: string) => {
        setLoadingPlayers(true);
        try {
            const q = query(collection(db, 'jugadores'), where('equipoId', '==', teamId));
            const snap = await getDocs(q);
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
            setPlayers(list);
        } catch (error) { console.error(error); }
        setLoadingPlayers(false);
    };

    // --- FUNCIÓN NUCLEAR: ELIMINAR EQUIPO Y NÓMINA ---
    const handleDeleteTeam = async (teamId: string, nombre: string) => {
        const confirm1 = window.confirm(`⚠️ ¿ELIMINAR COMPLETAMENTE a "${nombre}"?`);
        if (!confirm1) return;

        const confirm2 = window.confirm(`¡CUIDADO! Esto borrará también a todos los jugadores de este equipo. ¿Proceder?`);
        if (!confirm2) return;

        setLoading(true);
        try {
            const batch = writeBatch(db);

            // 1. Buscamos a los jugadores de este equipo para borrarlos en cadena
            const qPlayers = query(collection(db, 'jugadores'), where('equipoId', '==', teamId));
            const snapPlayers = await getDocs(qPlayers);
            snapPlayers.docs.forEach(pDoc => batch.delete(pDoc.ref));

            // 2. Borramos el documento del equipo
            batch.delete(doc(db, 'equipos', teamId));

            await batch.commit();
            alert(`🗑️ "${nombre}" y su nómina han sido eliminados correctamente.`);
            fetchEquipos();
        } catch (error) {
            alert("Error al intentar eliminar el equipo.");
        }
        setLoading(false);
    };

    const handleUpdateLogo = async (teamId: string) => {
        try {
            const newUrl = editLogos[teamId] || DEFAULT_LOGO;
            await updateDoc(doc(db, 'equipos', teamId), { logoUrl: newUrl });
            alert("✅ Logo actualizado");
            fetchEquipos();
        } catch (error) { alert("Error al actualizar logo"); }
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
            setTeamName(''); setView('list'); fetchEquipos();
        } catch (error) { alert("Error al crear equipo"); }
    };

    const handleAddPlayer = async () => {
        if (!newPlayerName.trim() || players.length >= 15 || !selectedTeam) return;
        try {
            const playerDoc = {
                nombre: newPlayerName.toUpperCase(),
                equipoId: selectedTeam.id,
                equipoNombre: selectedTeam.nombre,
                grupo: selectedTeam.grupo,
                puntos: 0, triples: 0, rebotes: 0, asistencias: 0, faltas: 0
            };
            const docRef = await addDoc(collection(db, 'jugadores'), playerDoc);
            setPlayers([...players, { id: docRef.id, nombre: newPlayerName.toUpperCase() }]);
            setNewPlayerName('');
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
                                    <div key={eq.id} style={{ padding:'15px', border:'1px solid #eee', borderRadius:'10px', background:'#f8fafc', position:'relative' }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:'15px', marginBottom:'10px' }}>
                                            <img src={eq.logoUrl || DEFAULT_LOGO} style={{ width:'50px', height:'50px', borderRadius:'50%', objectFit:'cover', border:'1px solid #ddd', background:'#fff' }} />
                                            <div style={{ flex:1 }}>
                                                <div style={{ fontWeight:'bold', fontSize:'1rem' }}>{eq.nombre} <span style={{fontSize:'0.7rem', color:'#3b82f6', background:'#dbeafe', padding:'2px 6px', borderRadius:'4px'}}>Grup {eq.grupo}</span></div>
                                                <div style={{ display:'flex', gap:'5px', marginTop:'8px' }}>
                                                    <input 
                                                        type="text" 
                                                        placeholder="URL logo..." 
                                                        value={editLogos[eq.id] || ''} 
                                                        onChange={(e) => setEditLogos({...editLogos, [eq.id]: e.target.value})}
                                                        style={{ flex:1, fontSize:'0.7rem', padding:'6px', borderRadius:'4px', border:'1px solid #ccc' }}
                                                    />
                                                    <button onClick={() => handleUpdateLogo(eq.id)} title="Guardar Logo" style={{ background:'#3b82f6', color:'white', border:'none', padding:'0 10px', borderRadius:'4px', cursor:'pointer' }}>💾</button>
                                                </div>
                                            </div>
                                            <div style={{display:'flex', flexDirection:'column', gap:'5px'}}>
                                                <button onClick={() => handleOpenForma21(eq)} style={{ background:'#f59e0b', color:'white', border:'none', padding:'8px 12px', borderRadius:'6px', fontWeight:'bold', cursor:'pointer', fontSize:'0.75rem' }}>NÓMINA F21</button>
                                                <button onClick={() => handleDeleteTeam(eq.id, eq.nombre)} title="Eliminar Equipo" style={{ background:'#ef4444', color:'white', border:'none', padding:'8px', borderRadius:'6px', cursor:'pointer', fontSize:'0.8rem' }}>🗑️ BORRAR</button>
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
                            <select value={teamGroup} onChange={e => setTeamGroup(e.target.value)} style={{ padding:'12px', borderRadius:'6px', border:'1px solid #ccc' }}>
                                <option value="A">GRUPO A</option>
                                <option value="B">GRUPO B</option>
                            </select>
                            <input type="text" placeholder="LINK DEL LOGO" value={newLogoUrl} onChange={e => setNewLogoUrl(e.target.value)} style={{ padding:'12px', borderRadius:'6px', border:'1px solid #ccc' }} />
                            <button onClick={handleCreateTeam} style={{ padding:'12px', background:'#10b981', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold', cursor:'pointer' }}>GUARDAR EQUIPO</button>
                            <button onClick={() => setView('list')} style={{ background:'none', border:'none', color:'#666', cursor:'pointer' }}>Volver</button>
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
                                <input type="text" placeholder="NOMBRE Y APELLIDO" value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleAddPlayer()} style={{ flex:1, padding:'12px', borderRadius:'6px', border:'1px solid #ccc' }} />
                                <button onClick={handleAddPlayer} style={{ padding:'0 20px', background:'#1e3a8a', color:'white', border:'none', borderRadius:'6px', fontWeight:'bold', cursor:'pointer' }}>AÑADIR</button>
                            </div>

                            <div style={{ maxHeight:'350px', overflowY:'auto', border:'1px solid #eee', borderRadius:'8px', marginBottom:'20px' }}>
                                {loadingPlayers ? <p style={{padding:'20px', textAlign:'center'}}>Cargando nómina...</p> : (
                                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                                        <thead style={{ background:'#f1f5f9', position:'sticky', top:0 }}>
                                            <tr><th style={{padding:'10px', textAlign:'left', fontSize:'0.75rem'}}>JUGADORES</th><th style={{padding:'10px', textAlign:'center', fontSize:'0.75rem'}}>ELIMINAR</th></tr>
                                        </thead>
                                        <tbody>
                                            {players.map((p, i) => (
                                                <tr key={p.id} style={{ borderBottom:'1px solid #eee' }}>
                                                    <td style={{padding:'10px', fontSize:'0.9rem'}}>{i + 1}. {p.nombre}</td>
                                                    <td style={{padding:'10px', textAlign:'center'}}><button onClick={() => handleDeletePlayer(p.id!, p.nombre)} style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'1.1rem'}}>🗑️</button></td>
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