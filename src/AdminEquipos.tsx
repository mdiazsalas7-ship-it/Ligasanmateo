import React, { useState, useEffect } from 'react';
import { db, storage } from './firebase'; 
import { collection, getDocs, doc, updateDoc, deleteDoc, addDoc, query, where, orderBy, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'; 

interface Player { id?: string; nombre: string; cedula?: string; }
interface Equipo { 
    id: string; 
    nombre: string; 
    grupo: string; 
    logoUrl?: string; 
    victorias: number; 
    derrotas: number; 
    puntos: number; 
    puntos_favor: number; 
    puntos_contra: number;
    entrenador?: string;
    asistente?: string;
}

const AdminEquipos: React.FC<{ onClose: () => void, categoria: string }> = ({ onClose, categoria }) => {
    const [view, setView] = useState<'list' | 'addTeam' | 'forma21'>('list');
    const [equipos, setEquipos] = useState<Equipo[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingPlayers, setLoadingPlayers] = useState(false);
    const [uploadingId, setUploadingId] = useState<string | null>(null); 
    
    // Estados para crear equipo
    const [teamName, setTeamName] = useState('');
    const [teamGroup, setTeamGroup] = useState('A'); 
    const [newLogoUrl, setNewLogoUrl] = useState('');

    // Estados para nómina (Forma 21)
    const [selectedTeam, setSelectedTeam] = useState<Equipo | null>(null);
    const [players, setPlayers] = useState<Player[]>([]);
    
    // ESTADOS CUERPO TÉCNICO
    const [staff, setStaff] = useState({ entrenador: '', asistente: '' });

    // Inputs Jugador
    const [newPlayerName, setNewPlayerName] = useState('');
    const [newPlayerCedula, setNewPlayerCedula] = useState('');

    const DEFAULT_LOGO = "https://cdn-icons-png.flaticon.com/512/166/166344.png";
    const LOGO_LIGA = "https://i.postimg.cc/hhF5fTPn/image.png"; 

    // --- LÓGICA MULTICOLECCIÓN ---
    const colEquipos = categoria === 'MASTER40' ? 'equipos' : `equipos_${categoria}`;
    const colJugadores = categoria === 'MASTER40' ? 'jugadores' : `jugadores_${categoria}`;

    const fetchEquipos = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, colEquipos), orderBy('nombre', 'asc'));
            const snap = await getDocs(q);
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Equipo));
            setEquipos(list);
        } catch (error) { console.error("Error cargando equipos:", error); }
        setLoading(false);
    };

    useEffect(() => { fetchEquipos(); }, [categoria]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, teamId?: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
        if (!allowedTypes.includes(file.type)) return alert("❌ Solo se permiten imágenes JPG o PNG.");

        const targetId = teamId || 'new';
        setUploadingId(targetId);

        try {
            const storageRef = ref(storage, `logos_${categoria}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            if (teamId) {
                await updateDoc(doc(db, colEquipos, teamId), { logoUrl: downloadURL });
                alert("✅ Logo actualizado.");
                fetchEquipos(); // Refresca la lista general
                
                // ACTUALIZACIÓN EN CALIENTE: Si estamos editando este equipo, actualizamos la vista actual
                if (selectedTeam && selectedTeam.id === teamId) {
                    setSelectedTeam({ ...selectedTeam, logoUrl: downloadURL });
                }
            } else {
                setNewLogoUrl(downloadURL);
                alert("✅ Imagen cargada.");
            }
        } catch (error) { console.error(error); alert("Error al subir."); } 
        finally { setUploadingId(null); }
    };

    const fetchPlayers = async (teamId: string) => {
        setLoadingPlayers(true);
        try {
            const q = query(collection(db, colJugadores), where('equipoId', '==', teamId));
            const snap = await getDocs(q);
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
            setPlayers(list.sort((a, b) => a.nombre.localeCompare(b.nombre)));
        } catch (error) { console.error(error); }
        setLoadingPlayers(false);
    };

    const handleDeleteTeam = async (teamId: string, nombre: string) => {
        if (!window.confirm(`⚠️ ¿ELIMINAR "${nombre}" y toda su nómina?`)) return;
        setLoading(true);
        try {
            const batch = writeBatch(db);
            const qPlayers = query(collection(db, colJugadores), where('equipoId', '==', teamId));
            const snapPlayers = await getDocs(qPlayers);
            snapPlayers.docs.forEach(pDoc => batch.delete(pDoc.ref));
            batch.delete(doc(db, colEquipos, teamId));
            await batch.commit();
            alert(`🗑️ Eliminado.`);
            fetchEquipos();
        } catch (error) { alert("Error al eliminar."); }
        setLoading(false);
    };

    const handleOpenForma21 = (eq: Equipo) => {
        setSelectedTeam(eq);
        setStaff({
            entrenador: eq.entrenador || '',
            asistente: eq.asistente || ''
        });
        fetchPlayers(eq.id);
        setView('forma21');
    };

    const handleSaveStaff = async () => {
        if (!selectedTeam) return;
        try {
            await updateDoc(doc(db, colEquipos, selectedTeam.id), {
                entrenador: staff.entrenador.toUpperCase(),
                asistente: staff.asistente.toUpperCase()
            });
            setSelectedTeam({ ...selectedTeam, entrenador: staff.entrenador.toUpperCase(), asistente: staff.asistente.toUpperCase() });
            alert("✅ Cuerpo técnico guardado.");
        } catch (e) { alert("Error al guardar staff."); }
    };

    const handleCreateTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!teamName) return alert("Falta nombre");
        try {
            await addDoc(collection(db, colEquipos), {
                nombre: teamName.toUpperCase(), 
                grupo: teamGroup,
                logoUrl: newLogoUrl || DEFAULT_LOGO,
                victorias: 0, derrotas: 0, puntos: 0, puntos_favor: 0, puntos_contra: 0,
                categoria: categoria 
            });
            setTeamName(''); setNewLogoUrl(''); setView('list'); fetchEquipos();
        } catch (error) { alert("Error al crear"); }
    };

    const handleAddPlayer = async () => {
        if (!newPlayerName.trim() || !newPlayerCedula.trim()) return alert("Falta Nombre o Cédula");
        if (players.length >= 15) return alert("Nómina llena (Máx 15)");
        if (players.some(p => p.cedula === newPlayerCedula)) return alert("Cédula repetida en este equipo.");

        try {
            const playerDoc = {
                nombre: newPlayerName.toUpperCase(),
                cedula: newPlayerCedula,
                equipoId: selectedTeam!.id,
                equipoNombre: selectedTeam!.nombre,
                categoria: categoria,
                puntos: 0, triples: 0, rebotes: 0, asistencias: 0, faltas: 0
            };
            const docRef = await addDoc(collection(db, colJugadores), playerDoc);
            
            const newList = [...players, { id: docRef.id, ...playerDoc }];
            setPlayers(newList.sort((a, b) => a.nombre.localeCompare(b.nombre)));
            setNewPlayerName(''); setNewPlayerCedula('');
        } catch (error) { alert("Error al registrar"); }
    };

    const handleDeletePlayer = async (playerId: string) => {
        if (!window.confirm(`¿Eliminar jugador?`)) return;
        try {
            await deleteDoc(doc(db, colJugadores, playerId));
            setPlayers(players.filter(p => p.id !== playerId));
        } catch (error) { alert("Error"); }
    };

    const handlePrint = () => { window.print(); };

    return (
        <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, background:'#f8fafc', zIndex:2000, display:'flex', justifyContent:'center', overflowY:'auto' }}>
            <div style={{ width:'100%', maxWidth:'850px', background:'white', minHeight:'100vh', boxShadow: '0 0 20px rgba(0,0,0,0.1)' }}>
                
                {/* --- HEADER (NO PRINT) --- */}
                <div className="no-print" style={{ padding:'15px 20px', background:'#1e3a8a', color:'white', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <h3 style={{margin:0, fontSize:'1.1rem'}}>🛡️ GESTIÓN {categoria}</h3>
                    <button onClick={onClose} style={{ background:'white', border:'none', color:'#1e3a8a', padding:'6px 12px', borderRadius:'6px', cursor:'pointer', fontWeight:'bold' }}>CERRAR</button>
                </div>

                <div style={{ padding:'20px' }}>
                    {view === 'list' && (
                        <div className="no-print">
                            <button onClick={() => setView('addTeam')} style={{ width:'100%', padding:'15px', background:'#10b981', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold', marginBottom:'20px', cursor:'pointer' }}>+ NUEVO EQUIPO</button>
                            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:'15px' }}>
                                {loading ? <p>Cargando...</p> : equipos.map(eq => (
                                    <div key={eq.id} style={{ padding:'15px', border:'1px solid #e2e8f0', borderRadius:'12px', background:'white', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', display:'flex', alignItems:'center', gap:'15px' }}>
                                        <img src={eq.logoUrl || DEFAULT_LOGO} style={{ width:'50px', height:'50px', borderRadius:'50%', objectFit:'contain', border:'1px solid #eee' }} />
                                        <div style={{flex:1}}>
                                            <div style={{fontWeight:'900', color:'#1e293b'}}>{eq.nombre}</div>
                                            <span style={{fontSize:'0.7rem', background:'#eff6ff', color:'#1e3a8a', padding:'2px 8px', borderRadius:'4px'}}>GRUPO {eq.grupo}</span>
                                        </div>
                                        <div style={{display:'flex', flexDirection:'column', gap:'5px'}}>
                                            <button onClick={() => handleOpenForma21(eq)} style={{ background:'#f59e0b', color:'white', border:'none', padding:'6px 10px', borderRadius:'6px', fontWeight:'bold', cursor:'pointer', fontSize:'0.7rem' }}>📋 NÓMINA</button>
                                            <button onClick={() => handleDeleteTeam(eq.id, eq.nombre)} style={{ background:'#fee2e2', color:'#ef4444', border:'none', padding:'6px', borderRadius:'6px', cursor:'pointer' }}>🗑️</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {view === 'addTeam' && (
                        <div className="no-print" style={{ maxWidth:'400px', margin:'0 auto' }}>
                            <h3 style={{color:'#1e3a8a'}}>Nuevo Equipo</h3>
                            <input type="text" placeholder="Nombre" value={teamName} onChange={e => setTeamName(e.target.value.toUpperCase())} style={{ width:'100%', padding:'12px', marginBottom:'10px', borderRadius:'8px', border:'1px solid #ccc' }} />
                            <select value={teamGroup} onChange={e => setTeamGroup(e.target.value)} style={{ width:'100%', padding:'12px', marginBottom:'10px', borderRadius:'8px', border:'1px solid #ccc' }}>
                                <option value="A">Grupo A</option>
                                <option value="B">Grupo B</option>
                            </select>
                            <button onClick={handleCreateTeam} disabled={uploadingId === 'new'} style={{ width:'100%', padding:'15px', background:'#1e3a8a', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold', cursor:'pointer' }}>GUARDAR</button>
                            <button onClick={() => setView('list')} style={{ width:'100%', padding:'10px', marginTop:'10px', background:'none', color:'#666', border:'none', cursor:'pointer' }}>Cancelar</button>
                        </div>
                    )}

                    {/* --- VISTA DE NÓMINA (EDITABLE) --- */}
                    {view === 'forma21' && selectedTeam && (
                        <div>
                            {/* CONTROLES (NO SE IMPRIMEN) */}
                            <div className="no-print" style={{ marginBottom:'20px', padding:'15px', background:'#f0f9ff', borderRadius:'10px', border:'1px solid #bae6fd' }}>
                                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px'}}>
                                    <h4 style={{margin:0, color:'#0369a1'}}>📝 Editar Forma 21</h4>
                                    <button onClick={handlePrint} style={{background:'#10b981', color:'white', border:'none', padding:'8px 15px', borderRadius:'6px', fontWeight:'bold', cursor:'pointer'}}>🖨 IMPRIMIR</button>
                                </div>

                                {/* --- NUEVO: GESTIÓN DE LOGO DENTRO DE LA FORMA 21 --- */}
                                <div style={{display:'flex', alignItems:'center', gap:'15px', marginBottom:'20px', background:'white', padding:'10px', borderRadius:'8px', border:'1px solid #e2e8f0'}}>
                                    <div style={{width:'60px', height:'60px', borderRadius:'50%', border:'1px solid #cbd5e1', overflow:'hidden', display:'flex', justifyContent:'center', alignItems:'center'}}>
                                        <img src={selectedTeam.logoUrl || DEFAULT_LOGO} style={{width:'100%', height:'100%', objectFit:'contain'}} alt="Logo" />
                                    </div>
                                    <div style={{flex:1}}>
                                        <label style={{background:'#e2e8f0', color:'#1e293b', padding:'6px 12px', borderRadius:'6px', fontSize:'0.75rem', fontWeight:'bold', cursor:'pointer', display:'inline-block'}}>
                                            {uploadingId === selectedTeam.id ? 'SUBIENDO...' : '📸 CAMBIAR LOGO'}
                                            <input type="file" accept="image/*" style={{display:'none'}} onChange={(e) => handleFileUpload(e, selectedTeam.id)} />
                                        </label>
                                        <p style={{fontSize:'0.65rem', color:'#64748b', margin:'5px 0 0 0'}}>Actualiza el logo y se reflejará en la impresión.</p>
                                    </div>
                                </div>

                                {/* STAFF TÉCNICO */}
                                <div style={{display:'flex', gap:'10px', marginBottom:'15px', background:'white', padding:'10px', borderRadius:'8px'}}>
                                    <div style={{flex:1}}>
                                        <label style={{fontSize:'0.7rem', fontWeight:'bold', color:'#64748b'}}>ENTRENADOR</label>
                                        <input type="text" value={staff.entrenador} onChange={e => setStaff({...staff, entrenador:e.target.value})} style={{width:'100%', padding:'8px', border:'1px solid #ccc', borderRadius:'4px'}} />
                                    </div>
                                    <div style={{flex:1}}>
                                        <label style={{fontSize:'0.7rem', fontWeight:'bold', color:'#64748b'}}>ASISTENTE</label>
                                        <input type="text" value={staff.asistente} onChange={e => setStaff({...staff, asistente:e.target.value})} style={{width:'100%', padding:'8px', border:'1px solid #ccc', borderRadius:'4px'}} />
                                    </div>
                                    <button onClick={handleSaveStaff} style={{marginTop:'auto', padding:'8px 15px', background:'#3b82f6', color:'white', border:'none', borderRadius:'4px', cursor:'pointer', height:'35px', fontWeight:'bold'}}>💾</button>
                                </div>

                                {/* AGREGAR JUGADOR */}
                                <div style={{display:'flex', gap:'10px'}}>
                                    <input type="text" placeholder="Nombre y Apellido" value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} style={{flex:2, padding:'10px', borderRadius:'6px', border:'1px solid #ccc'}} />
                                    <input type="number" placeholder="Cédula" value={newPlayerCedula} onChange={e => setNewPlayerCedula(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleAddPlayer()} style={{flex:1, padding:'10px', borderRadius:'6px', border:'1px solid #ccc'}} />
                                    <button onClick={handleAddPlayer} style={{background:'#0369a1', color:'white', border:'none', padding:'0 20px', borderRadius:'6px', fontWeight:'bold', cursor:'pointer'}}>AGREGAR</button>
                                </div>
                                <button onClick={() => setView('list')} style={{marginTop:'10px', background:'none', border:'none', color:'#64748b', fontSize:'0.8rem', cursor:'pointer'}}>← Volver</button>
                            </div>

                            {/* --- HOJA OFICIAL (IMPRESIÓN) --- */}
                            <div id="printable-area" style={{ background:'white', padding:'20px' }}>
                                
                                {/* 1. ENCABEZADO */}
                                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'3px solid #1e3a8a', paddingBottom:'10px', marginBottom:'15px' }}>
                                    <img src={LOGO_LIGA} alt="Logo" style={{ height:'75px', objectFit:'contain' }} />
                                    <div style={{ textAlign:'center' }}>
                                        <h1 style={{ margin:0, fontSize:'1.4rem', color:'#1e3a8a', textTransform:'uppercase', fontWeight:'900' }}>Liga Metropolitana Eje Este</h1>
                                        <div style={{ background:'#1e3a8a', color:'white', padding:'4px 15px', borderRadius:'4px', fontSize:'0.9rem', fontWeight:'bold', marginTop:'5px', display:'inline-block' }}>FORMA 21 - NÓMINA OFICIAL</div>
                                        <p style={{ margin:'5px 0 0 0', fontSize:'0.8rem', fontWeight:'bold', color:'#64748b' }}>CATEGORÍA: {categoria}</p>
                                    </div>
                                    <div style={{ textAlign:'right', fontSize:'0.75rem', fontWeight:'bold', color:'#334155' }}>
                                        <p style={{margin:0}}>TEMPORADA 2026</p>
                                        <p style={{margin:0}}>ARAGUA, VENEZUELA</p>
                                    </div>
                                </div>

                                {/* 2. DATOS DEL EQUIPO (CON LOGO REINTEGRADO Y ARREGLADO) */}
                                <div style={{ display:'flex', alignItems:'center', gap:'20px', background:'#f8fafc', padding:'15px', borderRadius:'8px', border:'1px solid #e2e8f0', marginBottom:'15px' }}>
                                    
                                    {/* LOGO DEL EQUIPO (Con overflow:hidden para que no se salgan las puntas) */}
                                    <div style={{ width:'80px', height:'80px', borderRadius:'50%', background:'white', border:'1px solid #cbd5e1', display:'flex', alignItems:'center', justifyContent:'center', padding:'5px', flexShrink:0, overflow:'hidden' }}>
                                        <img src={selectedTeam.logoUrl || DEFAULT_LOGO} style={{ width:'100%', height:'100%', objectFit:'contain' }} alt="Logo Equipo" />
                                    </div>

                                    {/* DATOS TÉCNICOS */}
                                    <div style={{ flex:1 }}>
                                        <div style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid #cbd5e1', paddingBottom:'8px', marginBottom:'8px' }}>
                                            <div style={{flex:1}}>
                                                <span style={{fontSize:'0.7rem', color:'#64748b', fontWeight:'bold'}}>EQUIPO:</span>
                                                <span style={{fontSize:'1.3rem', fontWeight:'900', color:'#1e293b', marginLeft:'8px', textTransform:'uppercase'}}>{selectedTeam.nombre}</span>
                                            </div>
                                            <div>
                                                <span style={{fontSize:'0.7rem', color:'#64748b', fontWeight:'bold'}}>GRUPO:</span>
                                                <span style={{fontSize:'1.3rem', fontWeight:'900', color:'#1e293b', marginLeft:'8px'}}>{selectedTeam.grupo}</span>
                                            </div>
                                        </div>
                                        <div style={{ display:'flex', gap:'20px' }}>
                                            <div style={{flex:1}}>
                                                <span style={{fontSize:'0.65rem', color:'#64748b', fontWeight:'bold', display:'block'}}>ENTRENADOR:</span>
                                                <span style={{fontSize:'0.85rem', fontWeight:'bold', color:'#1e3a8a', textTransform:'uppercase'}}>{selectedTeam.entrenador || '_________________________'}</span>
                                            </div>
                                            <div style={{flex:1}}>
                                                <span style={{fontSize:'0.65rem', color:'#64748b', fontWeight:'bold', display:'block'}}>ASISTENTE:</span>
                                                <span style={{fontSize:'0.85rem', fontWeight:'bold', color:'#1e3a8a', textTransform:'uppercase'}}>{selectedTeam.asistente || '_________________________'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 3. TABLA DE JUGADORES */}
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.85rem' }}>
                                    <thead>
                                        <tr style={{ background:'#1e3a8a', color:'white' }}>
                                            <th style={{ padding:'8px', border:'1px solid #1e3a8a', width:'40px' }}>N°</th>
                                            <th style={{ padding:'8px', border:'1px solid #1e3a8a', textAlign:'left' }}>APELLIDOS Y NOMBRES</th>
                                            <th style={{ padding:'8px', border:'1px solid #1e3a8a', width:'100px' }}>CÉDULA</th>
                                            <th style={{ padding:'8px', border:'1px solid #1e3a8a', width:'150px' }}>FIRMA JUGADOR</th>
                                            <th className="no-print" style={{ width:'40px' }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {players.map((p, i) => (
                                            <tr key={p.id} style={{ borderBottom:'1px solid #cbd5e1' }}>
                                                <td style={{ padding:'10px', textAlign:'center', borderRight:'1px solid #cbd5e1', fontWeight:'bold' }}>{i + 1}</td>
                                                <td style={{ padding:'10px', borderRight:'1px solid #cbd5e1', fontWeight:'600' }}>{p.nombre}</td>
                                                <td style={{ padding:'10px', textAlign:'center', borderRight:'1px solid #cbd5e1' }}>{p.cedula}</td>
                                                <td style={{ padding:'10px', borderRight:'1px solid #cbd5e1' }}></td>
                                                <td className="no-print" style={{ textAlign:'center' }}>
                                                    <button onClick={() => handleDeletePlayer(p.id!)} style={{color:'#ef4444', background:'none', border:'none', cursor:'pointer', fontWeight:'bold'}}>X</button>
                                                </td>
                                            </tr>
                                        ))}
                                        {/* RELLENO HASTA 15 */}
                                        {Array.from({ length: Math.max(0, 15 - players.length) }).map((_, i) => (
                                            <tr key={`empty-${i}`} style={{ borderBottom:'1px solid #cbd5e1', height:'40px' }}>
                                                <td style={{ borderRight:'1px solid #cbd5e1', textAlign:'center', color:'#cbd5e1' }}>{players.length + i + 1}</td>
                                                <td style={{ borderRight:'1px solid #cbd5e1' }}></td>
                                                <td style={{ borderRight:'1px solid #cbd5e1' }}></td>
                                                <td style={{ borderRight:'1px solid #cbd5e1' }}></td>
                                                <td className="no-print"></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* 4. PIE DE PÁGINA (SOLO 2 FIRMAS) */}
                                <div style={{ marginTop:'60px', display:'flex', justifyContent:'space-around', textAlign:'center', pageBreakInside:'avoid' }}>
                                    <div style={{ width:'250px' }}>
                                        <div style={{ borderTop:'2px solid black', paddingTop:'5px', fontWeight:'bold', fontSize:'0.8rem' }}>DELEGADO DE EQUIPO</div>
                                        <div style={{ fontSize:'0.6rem' }}>FIRMA Y CÉDULA</div>
                                    </div>
                                    <div style={{ width:'250px' }}>
                                        <div style={{ borderTop:'2px solid black', paddingTop:'5px', fontWeight:'bold', fontSize:'0.8rem' }}>DIRECTIVO DE LA LIGA</div>
                                        <div style={{ fontSize:'0.6rem' }}>AUTORIZACIÓN OFICIAL</div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #printable-area, #printable-area * { visibility: visible; }
                    #printable-area { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 20px; }
                    .no-print { display: none !important; }
                    @page { margin: 10mm; size: auto; }
                }
            `}</style>
        </div>
    );
};

export default AdminEquipos;