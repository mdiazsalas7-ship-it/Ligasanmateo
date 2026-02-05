import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { collection, getDocs, addDoc, query, orderBy, doc, updateDoc } from 'firebase/firestore';

interface MatchFormProps {
    onSuccess: () => void;
    onClose?: () => void;
    categoriaActiva: string; // Ej: "LIBRE", "MASTER40", "U19"
    matchToEdit?: any;
}

const MatchForm: React.FC<MatchFormProps> = ({ onSuccess, onClose, categoriaActiva, matchToEdit }) => {
    const [equipos, setEquipos] = useState<any[]>([]);
    
    const [form, setForm] = useState({ 
        localId: matchToEdit?.equipoLocalId || '', 
        visitId: matchToEdit?.equipoVisitanteId || '', 
        fecha: matchToEdit?.fechaAsignada || '', 
        hora: matchToEdit?.hora || '', 
        cancha: matchToEdit?.cancha || '' 
    });
    
    const [grupoSeleccionado, setGrupoSeleccionado] = useState<string | null>(matchToEdit?.grupo || null);
    const [loading, setLoading] = useState(false);

    // FUNCIÓN PARA DETECTAR LA COLECCIÓN CORRECTA (Mundos Separados)
    const getCollectionName = (base: string) => {
        const cat = categoriaActiva.trim().toUpperCase();
        if (cat === 'MASTER40') return base; // 'equipos', 'calendario'
        return `${base}_${cat}`; // 'equipos_LIBRE', 'calendario_LIBRE'
    };

    // 1. CARGA DE EQUIPOS DESDE LA COLECCIÓN ESPECÍFICA
    useEffect(() => {
        const fetchEquipos = async () => {
            try {
                // Ahora buscamos dinámicamente: equipos_LIBRE, equipos_U19, etc.
                const nombreColeccion = getCollectionName('equipos');
                console.log(`Cargando equipos desde: ${nombreColeccion}`); // Para depuración

                const q = query(collection(db, nombreColeccion), orderBy('nombre', 'asc'));
                const s = await getDocs(q);
                
                if (s.empty) {
                    console.warn(`No se encontraron equipos en ${nombreColeccion}`);
                }

                const equiposData = s.docs.map(d => ({ 
                    id: d.id, 
                    nombre: d.data().nombre,
                    grupo: d.data().grupo,
                    categoria: d.data().categoria 
                }));

                setEquipos(equiposData);
            } catch (error) {
                console.error("Error cargando equipos:", error);
                alert("Error cargando la lista de equipos. Revisa tu conexión.");
            }
        };
        fetchEquipos();
    }, [categoriaActiva]);

    // 2. LÓGICA DE SELECCIÓN
    const handleLocalChange = (id: string) => {
        const eq = equipos.find(e => e.id === id);
        if (eq) {
            setForm({ ...form, localId: id, visitId: '' });
            setGrupoSeleccionado(eq.grupo);
        } else {
            setGrupoSeleccionado(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            const local = equipos.find(e => e.id === form.localId);
            const visit = equipos.find(e => e.id === form.visitId);

            if (!local || !visit) throw new Error("Equipos inválidos.");
            if (local.id === visit.id) throw new Error("El rival debe ser diferente.");

            // Datos del juego
            const matchData = {
                equipoLocalId: local.id,
                equipoLocalNombre: local.nombre,
                equipoVisitanteId: visit.id,
                equipoVisitanteNombre: visit.nombre,
                grupo: grupoSeleccionado,
                categoria: categoriaActiva,
                fechaAsignada: form.fecha,
                hora: form.hora,
                cancha: form.cancha.toUpperCase(),
                estatus: matchToEdit ? matchToEdit.estatus : 'programado',
                marcadorLocal: matchToEdit ? matchToEdit.marcadorLocal : 0,
                marcadorVisitante: matchToEdit ? matchToEdit.marcadorVisitante : 0,
                registradoPorId: auth.currentUser?.uid
            };

            // Determinar colección de calendario (calendario o calendario_LIBRE)
            const nombreColCalendario = getCollectionName('calendario');

            if (matchToEdit) {
                // EDITAR
                await updateDoc(doc(db, nombreColCalendario, matchToEdit.id), matchData);
                alert("✏️ Juego actualizado.");
            } else {
                // CREAR
                await addDoc(collection(db, nombreColCalendario), matchData);
                alert(`📅 Juego creado en ${categoriaActiva} (Colección: ${nombreColCalendario}).`);
            }

            onSuccess();
        } catch (err: any) {
            console.error(err);
            alert("Error al guardar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto', background: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'20px', alignItems: 'center'}}>
                <h2 style={{color: '#1e3a8a', margin: 0, fontSize:'1.2rem'}}>
                    {matchToEdit ? '✏️ Editar Juego' : `📅 Nuevo Juego ${categoriaActiva}`}
                </h2>
                {onClose && <button onClick={onClose} style={{background: '#ef4444', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight:'bold'}}>Cerrar</button>}
            </div>

            <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                    <div>
                        <label style={{fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b'}}>LOCAL</label>
                        <select 
                            value={form.localId} 
                            onChange={e => handleLocalChange(e.target.value)} 
                            required
                            style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight:'bold'}}
                        >
                            <option value="">Seleccionar...</option>
                            {equipos.map(e => (
                                <option key={e.id} value={e.id}>
                                    {e.nombre} {(!e.categoria || e.categoria === '') ? '' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b'}}>VISITANTE</label>
                        <select 
                            value={form.visitId} 
                            onChange={e => setForm({...form, visitId: e.target.value})} 
                            required
                            disabled={!grupoSeleccionado}
                            style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight:'bold', background: !grupoSeleccionado ? '#f1f5f9' : 'white'}}
                        >
                            <option value="">{grupoSeleccionado ? `Rivales Grupo ${grupoSeleccionado}...` : "---"}</option>
                            {equipos
                                .filter(e => e.grupo === grupoSeleccionado && e.id !== form.localId)
                                .map(e => (
                                    <option key={e.id} value={e.id}>{e.nombre}</option>
                                ))
                            }
                        </select>
                    </div>
                </div>

                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                    <div>
                        <label style={{fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b'}}>FECHA</label>
                        <input 
                            type="date" 
                            value={form.fecha} 
                            onChange={e => setForm({...form, fecha:e.target.value})} 
                            required 
                            style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '8px', border: '1px solid #cbd5e1'}}
                        />
                    </div>
                    <div>
                        <label style={{fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b'}}>HORA</label>
                        <input 
                            type="time" 
                            value={form.hora} 
                            onChange={e => setForm({...form, hora:e.target.value})} 
                            required 
                            style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '8px', border: '1px solid #cbd5e1'}}
                        />
                    </div>
                </div>

                <div>
                    <label style={{fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b'}}>CANCHA / SEDE</label>
                    <input 
                        type="text" 
                        value={form.cancha} 
                        onChange={e => setForm({...form, cancha:e.target.value})} 
                        required 
                        placeholder="Ej. Gimnasio Vertical"
                        style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '8px', border: '1px solid #cbd5e1'}}
                    />
                </div>

                <button 
                    type="submit" 
                    disabled={loading} 
                    style={{
                        width:'100%', 
                        padding: '15px', 
                        background: '#1e3a8a', 
                        color: 'white', 
                        fontWeight: 'bold', 
                        border: 'none', 
                        borderRadius: '10px', 
                        cursor: loading ? 'not-allowed' : 'pointer',
                        marginTop: '10px',
                        fontSize: '0.9rem'
                    }}
                >
                    {loading ? 'PROCESANDO...' : (matchToEdit ? '💾 GUARDAR CAMBIOS' : '➕ CONFIRMAR JUEGO')}
                </button>
            </form>
        </div>
    );
};

export default MatchForm;