import React, { useState, useEffect, useRef } from 'react';
import { db, storage } from './firebase';
import {
    collection, getDocs, doc, updateDoc, deleteDoc,
    addDoc, query, where, orderBy, writeBatch
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { removeBackground } from '@imgly/background-removal';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
interface Player {
    id?: string;
    nombre: string;
    cedula?: string;
    numero?: number;
    fotoUrl?: string;   // ← NUEVO
}

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

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────
const DEFAULT_LOGO    = 'https://cdn-icons-png.flaticon.com/512/166/166344.png';
const DEFAULT_AVATAR  = 'https://cdn-icons-png.flaticon.com/512/149/149071.png';
const LOGO_LIGA       = 'https://i.postimg.cc/hhF5fTPn/image.png';

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
const AdminEquipos: React.FC<{ onClose: () => void; categoria: string }> = ({
    onClose, categoria,
}) => {
    const [view, setView]               = useState<'list' | 'addTeam' | 'forma21'>('list');
    const [equipos, setEquipos]         = useState<Equipo[]>([]);
    const [loading, setLoading]         = useState(true);
    const [loadingPlayers, setLoadingPlayers] = useState(false);

    // Uploads en curso: clave = teamId | `player_${playerId}`
    const [uploadingId, setUploadingId] = useState<string | null>(null);

    const [teamName, setTeamName]   = useState('');
    const [teamGroup, setTeamGroup] = useState('A');
    const [newLogoUrl, setNewLogoUrl] = useState('');

    const [selectedTeam, setSelectedTeam] = useState<Equipo | null>(null);
    const [players, setPlayers]           = useState<Player[]>([]);
    const [staff, setStaff]               = useState({ entrenador: '', asistente: '' });

    const [newPlayerName,   setNewPlayerName]   = useState('');
    const [newPlayerCedula, setNewPlayerCedula] = useState('');
    const [newPlayerNumber, setNewPlayerNumber] = useState('');

    // Edición inline
    const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
    const [editName,   setEditName]   = useState('');
    const [editCedula, setEditCedula] = useState('');
    const [editNumber, setEditNumber] = useState('');

    // Ref oculto para disparo del input de foto
    const photoInputRef = useRef<HTMLInputElement>(null);
    const photoTargetId = useRef<string>('');

    const colEquipos   = categoria === 'MASTER40' ? 'equipos'   : `equipos_${categoria}`;
    const colJugadores = categoria === 'MASTER40' ? 'jugadores' : `jugadores_${categoria}`;

    // ── Carga de equipos ──
    const fetchEquipos = async () => {
        setLoading(true);
        try {
            const q = query(collection(db, colEquipos), orderBy('nombre', 'asc'));
            const snap = await getDocs(q);
            setEquipos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Equipo)));
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    useEffect(() => { fetchEquipos(); }, [categoria]);

    // ── Carga de jugadores ──
    const fetchPlayers = async (teamId: string) => {
        setLoadingPlayers(true);
        try {
            const q = query(collection(db, colJugadores), where('equipoId', '==', teamId));
            const snap = await getDocs(q);
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as Player));
            setPlayers(list.sort((a, b) => (a.numero || 0) - (b.numero || 0)));
        } catch (e) { console.error(e); }
        setLoadingPlayers(false);
    };

    // ── Subida de logo del equipo ──
    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, teamId?: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type))
            return alert('❌ Solo JPG o PNG.');

        const targetId = teamId || 'new';
        setUploadingId(targetId);
        try {
            const storageRef = ref(storage, `logos_${categoria}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);

            if (teamId) {
                await updateDoc(doc(db, colEquipos, teamId), { logoUrl: url });
                fetchEquipos();
                if (selectedTeam?.id === teamId)
                    setSelectedTeam({ ...selectedTeam, logoUrl: url });
            } else {
                setNewLogoUrl(url);
            }
        } catch (e) { console.error(e); alert('Error al subir logo.'); }
        finally { setUploadingId(null); }
    };

    // ── Subida de foto del jugador ──
    // Se dispara al presionar 📷 en una fila; usamos un input oculto compartido
    const triggerPlayerPhoto = (playerId: string) => {
        photoTargetId.current = playerId;
        photoInputRef.current?.click();
    };

    const handlePlayerPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Resetear input para permitir subir el mismo archivo de nuevo
        e.target.value = '';
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(file.type))
            return alert('❌ Solo JPG, PNG o WEBP.');

        const playerId = photoTargetId.current;
        if (!playerId) return;

        setUploadingId(`player_${playerId}`);
        try {
            // ── Quitar fondo automáticamente en el navegador ──
            let uploadFile: Blob = file;
            try {
                const blob = await removeBackground(file);
                uploadFile = blob;
            } catch (bgErr) {
                // Si falla el proceso de fondo, subir la foto original
                console.warn('[BG] removeBackground falló, subiendo original:', bgErr);
            }

            // Siempre guardar como PNG para preservar la transparencia del fondo removido
            const storageRef = ref(storage, `jugadores_fotos/${playerId}.png`);
            await uploadBytes(storageRef, uploadFile, { contentType: 'image/png' });
            const url = await getDownloadURL(storageRef);

            // Guardar en Firestore
            await updateDoc(doc(db, colJugadores, playerId), { fotoUrl: url });

            // Actualizar estado local sin recargar toda la lista
            setPlayers(prev =>
                prev.map(p => p.id === playerId ? { ...p, fotoUrl: url } : p)
            );
        } catch (err) {
            console.error(err);
            alert('Error al subir la foto del jugador.');
        } finally {
            setUploadingId(null);
        }
    };

    // ── Equipo ──
    const handleDeleteTeam = async (teamId: string, nombre: string) => {
        if (!window.confirm(`⚠️ ¿ELIMINAR "${nombre}" y toda su nómina?`)) return;
        setLoading(true);
        try {
            const batch = writeBatch(db);
            const snap = await getDocs(
                query(collection(db, colJugadores), where('equipoId', '==', teamId))
            );
            snap.docs.forEach(d => batch.delete(d.ref));
            batch.delete(doc(db, colEquipos, teamId));
            await batch.commit();
            fetchEquipos();
        } catch { alert('Error al eliminar.'); }
        setLoading(false);
    };

    const handleOpenForma21 = (eq: Equipo) => {
        setSelectedTeam(eq);
        setStaff({ entrenador: eq.entrenador || '', asistente: eq.asistente || '' });
        fetchPlayers(eq.id);
        setView('forma21');
    };

    const handleSaveStaff = async () => {
        if (!selectedTeam) return;
        try {
            await updateDoc(doc(db, colEquipos, selectedTeam.id), {
                entrenador: staff.entrenador.toUpperCase(),
                asistente:  staff.asistente.toUpperCase(),
            });
            setSelectedTeam({
                ...selectedTeam,
                entrenador: staff.entrenador.toUpperCase(),
                asistente:  staff.asistente.toUpperCase(),
            });
            alert('✅ Cuerpo técnico guardado.');
        } catch { alert('Error al guardar staff.'); }
    };

    const handleCreateTeam = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!teamName) return alert('Falta nombre');
        try {
            await addDoc(collection(db, colEquipos), {
                nombre: teamName.toUpperCase(),
                grupo: teamGroup,
                logoUrl: newLogoUrl || DEFAULT_LOGO,
                victorias: 0, derrotas: 0, puntos: 0,
                puntos_favor: 0, puntos_contra: 0,
                categoria,
            });
            setTeamName(''); setNewLogoUrl(''); setView('list'); fetchEquipos();
        } catch { alert('Error al crear'); }
    };

    // ── Jugadores ──
    const handleAddPlayer = async () => {
        if (!newPlayerName.trim() || !newPlayerCedula.trim() || !newPlayerNumber.trim())
            return alert('Faltan datos (Nombre, Cédula o Número)');
        if (players.length >= 15) return alert('Nómina llena (Máx 15)');
        if (players.some(p => p.cedula === newPlayerCedula))
            return alert('Cédula repetida en este equipo.');
        if (players.some(p => p.numero === parseInt(newPlayerNumber)))
            return alert(`El número ${newPlayerNumber} ya está en uso.`);

        try {
            const playerDoc = {
                nombre:       newPlayerName.toUpperCase(),
                cedula:       newPlayerCedula,
                numero:       parseInt(newPlayerNumber),
                equipoId:     selectedTeam!.id,
                equipoNombre: selectedTeam!.nombre,
                categoria,
                grupo:        selectedTeam!.grupo,
                puntos: 0, triples: 0, dobles: 0, tirosLibres: 0,
                rebotes: 0, robos: 0, bloqueos: 0,
                asistencias: 0, faltas: 0, partidosJugados: 0,
                fotoUrl: '',
            };
            const docRef = await addDoc(collection(db, colJugadores), playerDoc);
            const newList = [...players, { id: docRef.id, ...playerDoc }];
            setPlayers(newList.sort((a, b) => (a.numero || 0) - (b.numero || 0)));
            setNewPlayerName(''); setNewPlayerCedula(''); setNewPlayerNumber('');
        } catch { alert('Error al registrar'); }
    };

    const handleDeletePlayer = async (playerId: string) => {
        if (!window.confirm('¿Eliminar jugador?')) return;
        try {
            await deleteDoc(doc(db, colJugadores, playerId));
            setPlayers(players.filter(p => p.id !== playerId));
        } catch { alert('Error'); }
    };

    const startEditing = (p: Player) => {
        setEditingPlayerId(p.id!);
        setEditName(p.nombre);
        setEditCedula(p.cedula || '');
        setEditNumber(p.numero?.toString() || '');
    };

    const handleUpdatePlayer = async (playerId: string) => {
        if (!editName.trim() || !editCedula.trim() || !editNumber.trim())
            return alert('Faltan datos');
        try {
            const updated = {
                nombre: editName.toUpperCase(),
                cedula: editCedula,
                numero: parseInt(editNumber),
            };
            await updateDoc(doc(db, colJugadores, playerId), updated);
            setPlayers(prev =>
                prev
                    .map(p => p.id === playerId ? { ...p, ...updated } : p)
                    .sort((a, b) => (a.numero || 0) - (b.numero || 0))
            );
            setEditingPlayerId(null);
        } catch { alert('Error al actualizar'); }
    };

    // ─────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────
    return (
        <div style={{
            position: 'fixed', inset: 0, background: '#f8fafc',
            zIndex: 2000, display: 'flex', justifyContent: 'center', overflowY: 'auto',
        }}>
            {/* Input oculto compartido para fotos de jugador */}
            <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/jpg,image/webp"
                style={{ display: 'none' }}
                onChange={handlePlayerPhotoUpload}
            />

            <div style={{
                width: '100%', maxWidth: 850, background: 'white',
                minHeight: '100vh', boxShadow: '0 0 20px rgba(0,0,0,0.1)',
            }}>
                {/* Header */}
                <div className="no-print" style={{
                    padding: '15px 20px', background: '#1e3a8a', color: 'white',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>🛡️ GESTIÓN {categoria}</h3>
                    <button onClick={onClose} style={{
                        background: 'white', border: 'none', color: '#1e3a8a',
                        padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold',
                    }}>
                        CERRAR
                    </button>
                </div>

                <div style={{ padding: 20 }}>

                    {/* ── LISTA DE EQUIPOS ── */}
                    {view === 'list' && (
                        <div className="no-print">
                            <button
                                onClick={() => setView('addTeam')}
                                style={{
                                    width: '100%', padding: 15, background: '#10b981',
                                    color: 'white', border: 'none', borderRadius: 10,
                                    fontWeight: 'bold', marginBottom: 20, cursor: 'pointer',
                                }}
                            >
                                + NUEVO EQUIPO
                            </button>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 15 }}>
                                {loading ? <p>Cargando...</p> : equipos.map(eq => (
                                    <div key={eq.id} style={{
                                        padding: 15, border: '1px solid #e2e8f0', borderRadius: 12,
                                        background: 'white', boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                                        display: 'flex', alignItems: 'center', gap: 15,
                                    }}>
                                        <img
                                            src={eq.logoUrl || DEFAULT_LOGO}
                                            style={{ width: 50, height: 50, borderRadius: '50%', objectFit: 'contain', border: '1px solid #eee' }}
                                            alt={eq.nombre}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 900, color: '#1e293b' }}>{eq.nombre}</div>
                                            <span style={{ fontSize: '0.7rem', background: '#eff6ff', color: '#1e3a8a', padding: '2px 8px', borderRadius: 4 }}>
                                                GRUPO {eq.grupo}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                            <button
                                                onClick={() => handleOpenForma21(eq)}
                                                style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer', fontSize: '0.7rem' }}
                                            >
                                                📋 NÓMINA
                                            </button>
                                            <button
                                                onClick={() => handleDeleteTeam(eq.id, eq.nombre)}
                                                style={{ background: '#fee2e2', color: '#ef4444', border: 'none', padding: 6, borderRadius: 6, cursor: 'pointer' }}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── CREAR EQUIPO ── */}
                    {view === 'addTeam' && (
                        <div className="no-print" style={{ maxWidth: 400, margin: '0 auto' }}>
                            <h3 style={{ color: '#1e3a8a' }}>Nuevo Equipo</h3>
                            <input
                                type="text" placeholder="Nombre" value={teamName}
                                onChange={e => setTeamName(e.target.value.toUpperCase())}
                                style={{ width: '100%', padding: 12, marginBottom: 10, borderRadius: 8, border: '1px solid #ccc' }}
                            />
                            <select
                                value={teamGroup} onChange={e => setTeamGroup(e.target.value)}
                                style={{ width: '100%', padding: 12, marginBottom: 10, borderRadius: 8, border: '1px solid #ccc' }}
                            >
                                <option value="A">Grupo A</option>
                                <option value="B">Grupo B</option>
                            </select>
                            <button
                                onClick={handleCreateTeam}
                                style={{ width: '100%', padding: 15, background: '#1e3a8a', color: 'white', border: 'none', borderRadius: 8, fontWeight: 'bold', cursor: 'pointer' }}
                            >
                                GUARDAR
                            </button>
                            <button
                                onClick={() => setView('list')}
                                style={{ width: '100%', padding: 10, marginTop: 10, background: 'none', color: '#666', border: 'none', cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                        </div>
                    )}

                    {/* ── FORMA 21 ── */}
                    {view === 'forma21' && selectedTeam && (
                        <div>
                            {/* Panel de edición (no imprimible) */}
                            <div className="no-print" style={{
                                marginBottom: 20, padding: 15,
                                background: '#f0f9ff', borderRadius: 10, border: '1px solid #bae6fd',
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                                    <h4 style={{ margin: 0, color: '#0369a1' }}>📝 Editar Forma 21</h4>
                                    <button
                                        onClick={() => window.print()}
                                        style={{ background: '#10b981', color: 'white', border: 'none', padding: '8px 15px', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer' }}
                                    >
                                        🖨 IMPRIMIR
                                    </button>
                                </div>

                                {/* Logo del equipo */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 15, marginBottom: 20, background: 'white', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                    <div style={{ width: 60, height: 60, borderRadius: '50%', border: '1px solid #cbd5e1', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                        <img src={selectedTeam.logoUrl || DEFAULT_LOGO} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="Logo" />
                                    </div>
                                    <label style={{ background: '#e2e8f0', color: '#1e293b', padding: '6px 12px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>
                                        {uploadingId === selectedTeam.id ? 'SUBIENDO...' : '📸 CAMBIAR LOGO'}
                                        <input type="file" accept="image/*" style={{ display: 'none' }}
                                            onChange={e => handleLogoUpload(e, selectedTeam.id)} />
                                    </label>
                                </div>

                                {/* Staff */}
                                <div style={{ display: 'flex', gap: 10, marginBottom: 15, background: 'white', padding: 10, borderRadius: 8 }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b' }}>ENTRENADOR</label>
                                        <input type="text" value={staff.entrenador}
                                            onChange={e => setStaff({ ...staff, entrenador: e.target.value })}
                                            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b' }}>ASISTENTE</label>
                                        <input type="text" value={staff.asistente}
                                            onChange={e => setStaff({ ...staff, asistente: e.target.value })}
                                            style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 4 }} />
                                    </div>
                                    <button onClick={handleSaveStaff}
                                        style={{ marginTop: 'auto', padding: '8px 15px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', height: 35, fontWeight: 'bold' }}>
                                        💾
                                    </button>
                                </div>

                                {/* Agregar jugador */}
                                <div style={{ display: 'flex', gap: 10 }}>
                                    <input type="number" placeholder="N°" value={newPlayerNumber}
                                        onChange={e => setNewPlayerNumber(e.target.value)}
                                        style={{ width: 60, padding: 10, borderRadius: 6, border: '1px solid #ccc', textAlign: 'center', fontWeight: 'bold' }} />
                                    <input type="text" placeholder="Nombre y Apellido" value={newPlayerName}
                                        onChange={e => setNewPlayerName(e.target.value)}
                                        style={{ flex: 2, padding: 10, borderRadius: 6, border: '1px solid #ccc' }} />
                                    <input type="number" placeholder="Cédula" value={newPlayerCedula}
                                        onChange={e => setNewPlayerCedula(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddPlayer()}
                                        style={{ flex: 1, padding: 10, borderRadius: 6, border: '1px solid #ccc' }} />
                                    <button onClick={handleAddPlayer}
                                        style={{ background: '#0369a1', color: 'white', border: 'none', padding: '0 20px', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer' }}>
                                        AGREGAR
                                    </button>
                                </div>

                                <button onClick={() => setView('list')}
                                    style={{ marginTop: 10, background: 'none', border: 'none', color: '#64748b', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    ← Volver
                                </button>
                            </div>

                            {/* ── Área imprimible ── */}
                            <div id="printable-area" style={{ background: 'white', padding: 20 }}>

                                {/* Encabezado */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '3px solid #1e3a8a', paddingBottom: 10, marginBottom: 15 }}>
                                    <img src={LOGO_LIGA} alt="Logo" style={{ height: 75, objectFit: 'contain' }} />
                                    <div style={{ textAlign: 'center' }}>
                                        <h1 style={{ margin: 0, fontSize: '1.4rem', color: '#1e3a8a', textTransform: 'uppercase', fontWeight: 900 }}>
                                            Liga Metropolitana Eje Este
                                        </h1>
                                        <div style={{ background: '#1e3a8a', color: 'white', padding: '4px 15px', borderRadius: 4, fontSize: '0.9rem', fontWeight: 'bold', marginTop: 5, display: 'inline-block' }}>
                                            FORMA 21 - NÓMINA OFICIAL
                                        </div>
                                        <p style={{ margin: '5px 0 0', fontSize: '0.8rem', fontWeight: 'bold', color: '#64748b' }}>
                                            CATEGORÍA: {categoria}
                                        </p>
                                    </div>
                                    <div style={{ textAlign: 'right', fontSize: '0.75rem', fontWeight: 'bold', color: '#334155' }}>
                                        <p style={{ margin: 0 }}>TEMPORADA 2026</p>
                                        <p style={{ margin: 0 }}>ARAGUA, VENEZUELA</p>
                                    </div>
                                </div>

                                {/* Info del equipo */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: '#f8fafc', padding: 15, borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 15 }}>
                                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'white', border: '1px solid #cbd5e1', overflow: 'hidden', flexShrink: 0 }}>
                                        <img src={selectedTeam.logoUrl || DEFAULT_LOGO} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="Logo" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #cbd5e1', paddingBottom: 8, marginBottom: 8 }}>
                                            <div>
                                                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 'bold' }}>EQUIPO: </span>
                                                <span style={{ fontSize: '1.3rem', fontWeight: 900, color: '#1e293b', marginLeft: 8, textTransform: 'uppercase' }}>{selectedTeam.nombre}</span>
                                            </div>
                                            <div>
                                                <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 'bold' }}>GRUPO: </span>
                                                <span style={{ fontSize: '1.3rem', fontWeight: 900, color: '#1e293b', marginLeft: 8 }}>{selectedTeam.grupo}</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 20 }}>
                                            <div style={{ flex: 1 }}>
                                                <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 'bold', display: 'block' }}>ENTRENADOR:</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#1e3a8a', textTransform: 'uppercase' }}>
                                                    {selectedTeam.entrenador || '_________________________'}
                                                </span>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 'bold', display: 'block' }}>ASISTENTE:</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#1e3a8a', textTransform: 'uppercase' }}>
                                                    {selectedTeam.asistente || '_________________________'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Tabla de jugadores */}
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#1e3a8a', color: 'white' }}>
                                            <th style={thStyle}>#</th>
                                            {/* Columna foto — solo visible en app, oculta al imprimir */}
                                            <th className="no-print" style={{ ...thStyle, width: 52 }}>FOTO</th>
                                            <th style={{ ...thStyle, width: 50, textAlign: 'center' }}>No.</th>
                                            <th style={{ ...thStyle, textAlign: 'left' }}>APELLIDOS Y NOMBRES</th>
                                            <th style={{ ...thStyle, width: 100 }}>CÉDULA</th>
                                            <th style={{ ...thStyle, width: 150 }}>FIRMA</th>
                                            <th className="no-print" style={{ ...thStyle, width: 80 }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingPlayers ? (
                                            <tr>
                                                <td colSpan={7} style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>
                                                    Cargando jugadores...
                                                </td>
                                            </tr>
                                        ) : players.map((p, i) => {
                                            const isUploading = uploadingId === `player_${p.id}`;
                                            const isEditing   = editingPlayerId === p.id;

                                            return (
                                                <tr key={p.id} style={{ borderBottom: '1px solid #cbd5e1' }}>
                                                    {/* Posición */}
                                                    <td style={{ ...tdStyle, fontSize: '0.7rem', color: '#64748b', textAlign: 'center' }}>
                                                        {i + 1}
                                                    </td>

                                                    {/* ── FOTO DEL JUGADOR (solo app) ── */}
                                                    <td className="no-print" style={{ ...tdStyle, textAlign: 'center', padding: '6px 4px' }}>
                                                        <div style={{ position: 'relative', width: 40, height: 40, margin: '0 auto' }}>
                                                            {/* Avatar / foto */}
                                                            <img
                                                                src={p.fotoUrl || DEFAULT_AVATAR}
                                                                alt={p.nombre}
                                                                style={{
                                                                    width: 40, height: 40, borderRadius: '50%',
                                                                    objectFit: 'cover', border: '2px solid #e2e8f0',
                                                                    background: '#f8fafc',
                                                                    opacity: isUploading ? 0.4 : 1,
                                                                    transition: 'opacity 0.2s',
                                                                }}
                                                                onError={e => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                            />
                                                            {/* Botón cámara — aparece sobre el avatar */}
                                                            {!isEditing && (
                                                                <button
                                                                    onClick={() => p.id && triggerPlayerPhoto(p.id)}
                                                                    disabled={isUploading}
                                                                    title={isUploading ? "Quitando fondo..." : "Subir foto"}
                                                                    style={{
                                                                        position: 'absolute', bottom: -2, right: -2,
                                                                        width: 18, height: 18, borderRadius: '50%',
                                                                        background: isUploading ? '#94a3b8' : '#1e3a8a',
                                                                        color: 'white', border: '2px solid white',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                        fontSize: '0.55rem', cursor: isUploading ? 'default' : 'pointer',
                                                                        padding: 0, lineHeight: 1,
                                                                    }}
                                                                >
                                                                    {isUploading ? '⏳' : '📷'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Modo edición vs modo vista */}
                                                    {isEditing ? (
                                                        <>
                                                            <td style={tdStyle}>
                                                                <input type="number" value={editNumber}
                                                                    onChange={e => setEditNumber(e.target.value)}
                                                                    style={{ width: 40, textAlign: 'center', fontWeight: 'bold', border: '1px solid #cbd5e1', borderRadius: 4, padding: '4px 2px' }} />
                                                            </td>
                                                            <td style={tdStyle}>
                                                                <input type="text" value={editName}
                                                                    onChange={e => setEditName(e.target.value)}
                                                                    style={{ width: '90%', textTransform: 'uppercase', border: '1px solid #cbd5e1', borderRadius: 4, padding: '4px 6px' }} />
                                                            </td>
                                                            <td style={tdStyle}>
                                                                <input type="number" value={editCedula}
                                                                    onChange={e => setEditCedula(e.target.value)}
                                                                    style={{ width: 80, border: '1px solid #cbd5e1', borderRadius: 4, padding: '4px 6px' }} />
                                                            </td>
                                                            <td style={tdStyle} />
                                                            <td className="no-print" style={{ ...tdStyle, textAlign: 'center' }}>
                                                                <button onClick={() => handleUpdatePlayer(p.id!)}
                                                                    style={actionBtn('#10b981')}>✔</button>
                                                                <button onClick={() => setEditingPlayerId(null)}
                                                                    style={actionBtn('#94a3b8')}>✕</button>
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 900, fontSize: '1rem' }}>
                                                                {p.numero}
                                                            </td>
                                                            <td style={{ ...tdStyle, fontWeight: 600 }}>{p.nombre}</td>
                                                            <td style={{ ...tdStyle, textAlign: 'center' }}>{p.cedula}</td>
                                                            <td style={tdStyle} />
                                                            <td className="no-print" style={{ ...tdStyle, textAlign: 'center' }}>
                                                                <button onClick={() => startEditing(p)}
                                                                    style={actionBtn('#3b82f6')}>✎</button>
                                                                <button onClick={() => handleDeletePlayer(p.id!)}
                                                                    style={actionBtn('#ef4444')}>✕</button>
                                                            </td>
                                                        </>
                                                    )}
                                                </tr>
                                            );
                                        })}

                                        {/* Filas vacías hasta completar 15 */}
                                        {Array.from({ length: Math.max(0, 15 - players.length) }).map((_, i) => (
                                            <tr key={`empty-${i}`} style={{ borderBottom: '1px solid #cbd5e1', height: 40 }}>
                                                <td style={{ ...tdStyle, textAlign: 'center', color: '#cbd5e1', fontSize: '0.7rem' }}>
                                                    {players.length + i + 1}
                                                </td>
                                                <td className="no-print" style={tdStyle} />
                                                <td style={tdStyle} /><td style={tdStyle} />
                                                <td style={tdStyle} /><td style={tdStyle} />
                                                <td className="no-print" style={tdStyle} />
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {/* Firmas */}
                                <div style={{ marginTop: 60, display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                                    <div style={{ width: 250 }}>
                                        <div style={{ borderTop: '2px solid black', paddingTop: 5, fontWeight: 'bold', fontSize: '0.8rem' }}>
                                            DELEGADO DE EQUIPO
                                        </div>
                                        <div style={{ fontSize: '0.6rem' }}>FIRMA Y CÉDULA</div>
                                    </div>
                                    <div style={{ width: 250 }}>
                                        <div style={{ borderTop: '2px solid black', paddingTop: 5, fontWeight: 'bold', fontSize: '0.8rem' }}>
                                            DIRECTIVO DE LA LIGA
                                        </div>
                                        <div style={{ fontSize: '0.6rem' }}>AUTORIZACIÓN OFICIAL</div>
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
                    #printable-area { position:absolute; left:0; top:0; width:100%; margin:0; padding:20px; }
                    .no-print { display: none !important; }
                    @page { margin: 10mm; size: auto; }
                }
            `}</style>
        </div>
    );
};

// ── Helpers de estilo ──
const thStyle: React.CSSProperties = {
    padding: 8, border: '1px solid #1e3a8a',
};
const tdStyle: React.CSSProperties = {
    padding: 10, borderRight: '1px solid #cbd5e1',
};
const actionBtn = (color: string): React.CSSProperties => ({
    color, background: 'none', border: 'none', cursor: 'pointer',
    fontWeight: 'bold', marginRight: 6, fontSize: '0.9rem',
});

export default AdminEquipos;