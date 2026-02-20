import React, { useState, useEffect } from 'react';
import { db } from './firebase';
// 1. Añadimos doc y updateDoc de firestore
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore'; 

// --- CONFIGURACIÓN DE ESTILO ---
const LEAGUE_LOGO_URL = "https://i.postimg.cc/qMsBxr6P/image.png";
const DEFAULT_TEAM_LOGO = "https://cdn-icons-png.flaticon.com/512/451/451716.png"; 

interface Team { id: string; nombre: string; logoUrl?: string; }
interface Player { id: string; nombre: string; }

const TeamsPublicViewer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [view, setView] = useState<'list' | 'roster'>('list');
    const [teams, setTeams] = useState<Team[]>([]);
    const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
    const [roster, setRoster] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);

    // --- NUEVOS ESTADOS PARA EDICIÓN ---
    const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
    const [editName, setEditName] = useState<string>('');
    const [savingEdit, setSavingEdit] = useState(false);

    useEffect(() => {
        const fetchTeams = async () => {
            try {
                const snapTeams = await getDocs(collection(db, 'equipos'));
                const list = snapTeams.docs.map(d => ({ id: d.id, ...d.data() } as Team));
                setTeams(list.sort((a,b) => (a.nombre || '').localeCompare(b.nombre || '')));
            } catch (e) { 
                console.error("Error equipos:", e); 
            } finally { 
                setLoading(false); 
            }
        };
        fetchTeams();
    }, []);

    const handleViewRoster = async (team: Team) => {
        setLoading(true);
        setSelectedTeam(team);
        // Reseteamos cualquier edición pendiente al cambiar de equipo
        setEditingPlayerId(null); 
        try {
            const q = query(collection(db, 'jugadores'), where('equipoId', '==', team.id));
            const snap = await getDocs(q);
            
            const playersData = snap.docs.map(d => ({ 
                id: d.id, 
                nombre: d.data().nombre || 'Jugador sin nombre' 
            } as Player));

            playersData.sort((a, b) => a.nombre.localeCompare(b.nombre));
            
            setRoster(playersData);
            setView('roster');
        } catch (e) { 
            console.error("Error nomina:", e);
            setRoster([]);
            setView('roster');
        } finally { 
            setLoading(false); 
        }
    };

    // --- FUNCIONES DE EDICIÓN ---
    const startEditing = (player: Player) => {
        setEditingPlayerId(player.id);
        setEditName(player.nombre);
    };

    const cancelEditing = () => {
        setEditingPlayerId(null);
        setEditName('');
    };

    const saveEdit = async (playerId: string) => {
        if (!editName.trim()) return; // Evitar guardar nombres vacíos
        setSavingEdit(true);
        try {
            // 2. Actualizamos en Firebase
            const playerRef = doc(db, 'jugadores', playerId);
            await updateDoc(playerRef, { nombre: editName.trim() });

            // 3. Actualizamos el estado local (para no tener que recargar todo de Firebase)
            setRoster(prevRoster => 
                prevRoster.map(p => p.id === playerId ? { ...p, nombre: editName.trim() } : p)
                // Opcional: podrías volver a ordenar la lista aquí si cambió el orden alfabético
            );
            
            setEditingPlayerId(null);
        } catch (error) {
            console.error("Error al actualizar jugador:", error);
            alert("Hubo un error al guardar el cambio.");
        } finally {
            setSavingEdit(false);
        }
    };

    return (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'#f3f4f6', zIndex:1000, display:'flex', flexDirection:'column' }}>
            
            {/* HEADER */}
            <div style={{ height:'50px', background:'#111', borderBottom:'2px solid #333', display:'flex', alignItems:'center', padding:'0 15px', justifyContent:'space-between', color:'white' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                    <button onClick={view === 'roster' ? () => setView('list') : onClose} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'white', borderRadius:'50%', width:'32px', height:'32px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem' }}>
                        {view === 'roster' ? '←' : '✕'}
                    </button>
                    <span style={{ fontWeight:'900', fontSize:'0.9rem', textTransform:'uppercase', letterSpacing:'0.5px' }}>
                        {view === 'list' ? 'Equipos Oficiales' : selectedTeam?.nombre}
                    </span>
                </div>
                <img src={LEAGUE_LOGO_URL} style={{ height:'30px' }} alt="logo" />
            </div>

            {/* CONTENIDO */}
            <div style={{ flex:1, overflowY:'auto', padding:'15px' }}>
                {loading ? (
                    <div style={{ textAlign:'center', marginTop:'50px', color:'#1e3a8a', fontWeight:'bold' }}>Cargando información...</div>
                ) : view === 'list' ? (
                    /* CUADRÍCULA DE EQUIPOS */
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px, 1fr))', gap:'12px' }}>
                        {teams.map(team => (
                            <div key={team.id} onClick={() => handleViewRoster(team)} style={{ background:'white', padding:'15px', borderRadius:'15px', textAlign:'center', boxShadow:'0 4px 6px rgba(0,0,0,0.05)', cursor:'pointer', border:'1px solid #e5e7eb' }}>
                                <img src={team.logoUrl || DEFAULT_TEAM_LOGO} style={{ width:'60px', height:'60px', objectFit:'contain', marginBottom:'10px' }} alt="logo" />
                                <div style={{ fontWeight:'800', color:'#1e3a8a', fontSize:'0.8rem', textTransform:'uppercase' }}>{team.nombre}</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    /* LISTA DE NOMBRES CON EDICIÓN */
                    <div style={{ maxWidth:'500px', margin:'0 auto' }}>
                        <div style={{ background:'#fff', padding:'15px', borderRadius:'12px', marginBottom:'15px', display:'flex', alignItems:'center', gap:'15px', border:'1px solid #e2e8f0', boxShadow:'0 2px 4px rgba(0,0,0,0.05)' }}>
                            <img src={selectedTeam?.logoUrl || DEFAULT_TEAM_LOGO} style={{ width:'45px', height:'45px', objectFit:'contain' }} alt="logo" />
                            <div>
                                <h3 style={{ margin:0, color:'#1e3a8a', textTransform:'uppercase', fontSize:'1rem' }}>{selectedTeam?.nombre}</h3>
                                <span style={{ fontSize:'0.7rem', color:'#64748b', fontWeight:'bold' }}>NÓMINA REGISTRADA • {roster.length} JUGADORES</span>
                            </div>
                        </div>

                        <div style={{ background:'white', borderRadius:'12px', border:'1px solid #e2e8f0', overflow:'hidden', boxShadow:'0 4px 10px rgba(0,0,0,0.05)' }}>
                            {roster.length === 0 ? (
                                <div style={{ padding:'40px', textAlign:'center', color:'#94a3b8' }}>
                                    <p style={{ margin:0 }}>No se encontraron jugadores registrados.</p>
                                </div>
                            ) : (
                                roster.map((p, index) => (
                                    <div key={p.id} style={{ 
                                        padding:'14px 20px', 
                                        borderBottom: index !== roster.length - 1 ? '1px solid #f1f5f9' : 'none',
                                        fontSize:'1rem',
                                        color:'#334155',
                                        fontWeight:'600',
                                        display:'flex',
                                        alignItems:'center',
                                        justifyContent: 'space-between' // Para separar nombre y botón
                                    }}>
                                        
                                        {/* MODO EDICIÓN VS MODO VISTA */}
                                        {editingPlayerId === p.id ? (
                                            <div style={{ display: 'flex', gap: '10px', width: '100%', alignItems: 'center' }}>
                                                <input 
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    disabled={savingEdit}
                                                    style={{ flex: 1, padding: '5px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '1rem', textTransform: 'uppercase' }}
                                                    autoFocus
                                                />
                                                <button onClick={() => saveEdit(p.id)} disabled={savingEdit} style={{ background: '#10b981', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: savingEdit ? 'not-allowed' : 'pointer' }}>
                                                    {savingEdit ? '...' : '✔'}
                                                </button>
                                                <button onClick={cancelEditing} disabled={savingEdit} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: savingEdit ? 'not-allowed' : 'pointer' }}>
                                                    ✕
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                    <span style={{ color:'#cbd5e1', marginRight:'15px', fontSize:'0.8rem', width:'20px' }}>{index + 1}.</span>
                                                    {p.nombre.toUpperCase()}
                                                </div>
                                                {/* BOTÓN PARA EDITAR (Solo debería verlo el delegado/admin) */}
                                                <button onClick={() => startEditing(p)} style={{ background: 'transparent', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                                                    Editar
                                                </button>
                                            </>
                                        )}

                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeamsPublicViewer;