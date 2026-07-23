import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { collection, getDocs, addDoc, query, orderBy, doc, updateDoc } from 'firebase/firestore';

interface MatchFormProps {
    onSuccess: () => void;
    onClose?: () => void;
    categoriaActiva: string; 
    matchToEdit?: any;
}

const MatchForm: React.FC<MatchFormProps> = ({ onSuccess, onClose, categoriaActiva, matchToEdit }) => {
    const [equipos, setEquipos] = useState<any[]>([]);
    
    const [form, setForm] = useState({ 
        localId: matchToEdit?.equipoLocalId || '', 
        visitId: matchToEdit?.equipoVisitanteId || '', 
        fecha: matchToEdit?.fechaAsignada || '', 
        hora: matchToEdit?.hora || '', 
        cancha: matchToEdit?.cancha || '',
        // Forzamos que siempre haya una fase, por defecto REGULAR
        fase: matchToEdit?.fase || 'REGULAR' 
    });
    
    const [grupoSeleccionado, setGrupoSeleccionado] = useState<string | null>(matchToEdit?.grupo || null);
    const [loading, setLoading] = useState(false);

    const getCollectionName = (base: string) => {
        const cat = categoriaActiva.trim().toUpperCase();
        if (cat === 'MASTER40' || cat === 'MASTER') return base;
        return `${base}_${cat}`;
    };

    useEffect(() => {
        const fetchEquipos = async () => {
            try {
                const nombreColeccion = getCollectionName('equipos');
                const q = query(collection(db, nombreColeccion), orderBy('nombre', 'asc'));
                const s = await getDocs(q);
                
                const equiposData = s.docs.map(d => ({ 
                    id: d.id, 
                    nombre: d.data().nombre,
                    grupo: d.data().grupo,
                    categoria: d.data().categoria 
                }));

                setEquipos(equiposData);
            } catch (error) {
                console.error("Error cargando equipos:", error);
            }
        };
        fetchEquipos();
    }, [categoriaActiva]);

    // Al cambiar la fase, reseteamos el visitante para obligar a re-seleccionar según la lógica de cruces
    useEffect(() => {
        if (!matchToEdit) { // Solo si es un juego nuevo para no borrar datos editando
            setForm(prev => ({ ...prev, visitId: '' }));
        }
    }, [form.fase]);

    const handleLocalChange = (id: string) => {
        const eq = equipos.find(e => e.id === id);
        if (eq) {
            setForm({ ...form, localId: id, visitId: '' });
            setGrupoSeleccionado(eq.grupo);
        } else {
            setGrupoSeleccionado(null);
            setForm({ ...form, localId: '', visitId: '' });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        
        try {
            const local = equipos.find(e => e.id === form.localId);
            const visit = equipos.find(e => e.id === form.visitId);

            if (!local || !visit) throw new Error("Debes seleccionar ambos equipos.");
            
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
                fase: form.fase.toUpperCase(), // Aseguramos mayúsculas para el filtro
                estatus: matchToEdit ? matchToEdit.estatus : 'programado',
                marcadorLocal: matchToEdit ? (matchToEdit.marcadorLocal || 0) : 0,
                marcadorVisitante: matchToEdit ? (matchToEdit.marcadorVisitante || 0) : 0,
                registradoPorId: auth.currentUser?.uid,
                ultimaModificacion: new Date().toISOString()
            };

            const nombreColCalendario = getCollectionName('calendario');

            if (matchToEdit) {
                await updateDoc(doc(db, nombreColCalendario, matchToEdit.id), matchData);
                alert("✏️ Juego actualizado con éxito.");
            } else {
                await addDoc(collection(db, nombreColCalendario), matchData);
                alert(`📅 Juego de ${form.fase} creado correctamente.`);
            }

            onSuccess();
        } catch (err: any) {
            alert("Error al guardar: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto', background: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 25px rgba(0,0,0,0.15)' }}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'20px', alignItems: 'center', borderBottom: '2px solid #f1f5f9', paddingBottom: '15px'}}>
                <div>
                    <h2 style={{color: '#1e3a8a', margin: 0, fontSize:'1.3rem', fontWeight: 900}}>
                        {matchToEdit ? '✏️ EDITAR JUEGO' : `📅 NUEVO JUEGO`}
                    </h2>
                    <span style={{fontSize: '0.7rem', color: '#64748b', fontWeight: 'bold'}}>CATEGORÍA: {categoriaActiva}</span>
                </div>
                {onClose && <button onClick={onClose} style={{background: '#f1f5f9', color: '#475569', border: 'none', padding: '8px 15px', borderRadius: '8px', cursor: 'pointer', fontWeight:'bold', fontSize: '0.7rem'}}>CANCELAR</button>}
            </div>

            <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '18px'}}>
                
                {/* SELECTOR DE FASE - EL MÁS IMPORTANTE */}
                <div style={{background: form.fase === 'REGULAR' ? '#eff6ff' : '#fff7ed', padding:'15px', borderRadius:'10px', border: `2px solid ${form.fase === 'REGULAR' ? '#1e3a8a' : '#ea580c'}`, transition: '0.3s'}}>
                    <label style={{fontSize: '0.75rem', fontWeight: '900', color: form.fase === 'REGULAR' ? '#1e3a8a' : '#ea580c', display: 'block', marginBottom: '8px'}}>
                        TIPO DE ENCUENTRO (ESTABLECE SI CUENTA PARA ESTADÍSTICAS)
                    </label>
                    <select 
                        value={form.fase} 
                        onChange={e => setForm({...form, fase: e.target.value})} 
                        style={{width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight:'900', color: '#1e3a8a', cursor:'pointer', fontSize: '0.9rem'}}
                    >
                        <option value="REGULAR">📅 TEMPORADA REGULAR (Suma a tabla/líderes)</option>
                        <option value="OCTAVOS">🔥 OCTAVOS DE FINAL (No suma)</option>
                        <option value="CUARTOS">⚔️ CUARTOS DE FINAL (No suma)</option>
                        <option value="SEMIS">🏆 SEMIFINAL (No suma)</option>
                        <option value="FINAL">👑 GRAN FINAL (No suma)</option>
                    </select>
                </div>

                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                    {/* LOCAL */}
                    <div>
                        <label style={{fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b'}}>EQUIPO LOCAL</label>
                        <select 
                            value={form.localId} 
                            onChange={e => handleLocalChange(e.target.value)} 
                            required
                            style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight:'bold'}}
                        >
                            <option value="">Seleccionar...</option>
                            {equipos.map(e => (
                                <option key={e.id} value={e.id}>
                                    {e.nombre} (G-{e.grupo})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* VISITANTE */}
                    <div>
                        <label style={{fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b'}}>EQUIPO VISITANTE</label>
                        <select 
                            value={form.visitId} 
                            onChange={e => setForm({...form, visitId: e.target.value})} 
                            required
                            disabled={!grupoSeleccionado}
                            style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight:'bold', background: !grupoSeleccionado ? '#f1f5f9' : 'white'}}
                        >
                            <option value="">
                                {!grupoSeleccionado 
                                    ? "Esperando local..." 
                                    : form.fase === 'REGULAR' 
                                        ? `Rivales Grupo ${grupoSeleccionado}` 
                                        : `Cruces (Grupo contrario)`}
                            </option>
                            {equipos
                                .filter(e => {
                                    if (e.id === form.localId) return false;
                                    if (form.fase === 'REGULAR') {
                                        return e.grupo === grupoSeleccionado;
                                    } else {
                                        // Para Playoff permitimos cruces entre grupos
                                        return e.grupo !== grupoSeleccionado;
                                    }
                                })
                                .map(e => (
                                    <option key={e.id} value={e.id}>{e.nombre} (G-{e.grupo})</option>
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
                            style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontFamily: 'inherit'}}
                        />
                    </div>
                    <div>
                        <label style={{fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b'}}>HORA</label>
                        <input 
                            type="time" 
                            value={form.hora} 
                            onChange={e => setForm({...form, hora:e.target.value})} 
                            required 
                            style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontFamily: 'inherit'}}
                        />
                    </div>
                </div>

                <div>
                    <label style={{fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b'}}>SEDE / CANCHA</label>
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
                        padding: '16px', 
                        background: loading ? '#94a3b8' : '#1e3a8a', 
                        color: 'white', 
                        fontWeight: '900', 
                        border: 'none', 
                        borderRadius: '12px', 
                        cursor: loading ? 'not-allowed' : 'pointer',
                        marginTop: '10px',
                        fontSize: '1rem',
                        boxShadow: '0 4px 12px rgba(30,58,138,0.3)'
                    }}
                >
                    {loading ? 'GUARDANDO...' : (matchToEdit ? '💾 ACTUALIZAR ENCUENTRO' : '➕ PROGRAMAR JUEGO')}
                </button>
            </form>
        </div>
    );
};

export default MatchForm;