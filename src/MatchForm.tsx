import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { collection, getDocs, addDoc, query, orderBy } from 'firebase/firestore';

const MatchForm: React.FC<{ onSuccess: () => void; onClose?: () => void }> = ({ onSuccess, onClose }) => {
    const [equipos, setEquipos] = useState<any[]>([]);
    const [form, setForm] = useState({ 
        localId: '', 
        visitId: '', 
        fecha: '', 
        hora: '', 
        cancha: '' 
    });
    const [grupoSeleccionado, setGrupoSeleccionado] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // 1. CARGAMOS LOS EQUIPOS CON SU INFORMACIÓN DE GRUPO
    useEffect(() => {
        const q = query(collection(db, 'equipos'), orderBy('nombre', 'asc'));
        getDocs(q).then(s => setEquipos(s.docs.map(d => ({ 
            id: d.id, 
            nombre: d.data().nombre,
            grupo: d.data().grupo // Importante para la validación
        }))));
    }, []);

    // 2. LOGICA AL SELECCIONAR LOCAL: Bloquea el grupo para el visitante
    const handleLocalChange = (id: string) => {
        const eq = equipos.find(e => e.id === id);
        if (eq) {
            setForm({ ...form, localId: id, visitId: '' }); // Resetea visitante si cambia el local
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

            if (!local || !visit || local.id === visit.id) {
                throw new Error("Selecciona dos equipos diferentes.");
            }

            // 3. GUARDAMOS EN 'CALENDARIO' INCLUYENDO EL GRUPO DEL ENCUENTRO
            await addDoc(collection(db, 'calendario'), {
                equipoLocalId: local.id,
                equipoLocalNombre: local.nombre,
                equipoVisitanteId: visit.id,
                equipoVisitanteNombre: visit.nombre,
                grupo: grupoSeleccionado, // Guardamos A o B
                fechaAsignada: form.fecha,
                hora: form.hora,
                cancha: form.cancha.toUpperCase(),
                estatus: 'programado',
                marcadorLocal: 0,
                marcadorVisitante: 0,
                cuarto: 1,
                registradoPorId: auth.currentUser?.uid
            });

            alert(`📅 Juego del Grupo ${grupoSeleccionado} agendado correctamente.`);
            onSuccess();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto', background: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'20px', alignItems: 'center'}}>
                <h2 style={{color: '#1e3a8a', margin: 0}}>📅 Programar Juego</h2>
                {onClose && <button onClick={onClose} style={{background: '#64748b', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer'}}>Volver</button>}
            </div>

            <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                
                {/* SELECCIÓN DE EQUIPOS */}
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                    <div>
                        <label style={{fontSize: '0.8rem', fontWeight: 'bold', color: '#475569'}}>EQUIPO LOCAL</label>
                        <select 
                            value={form.localId} 
                            onChange={e => handleLocalChange(e.target.value)} 
                            required
                            style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1'}}
                        >
                            <option value="">Seleccionar...</option>
                            {equipos.map(e => (
                                <option key={e.id} value={e.id}>{e.nombre} (GRUPO {e.grupo})</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{fontSize: '0.8rem', fontWeight: 'bold', color: '#475569'}}>EQUIPO VISITANTE</label>
                        <select 
                            value={form.visitId} 
                            onChange={e => setForm({...form, visitId: e.target.value})} 
                            required
                            disabled={!grupoSeleccionado} // Deshabilitado hasta elegir local
                            style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1', background: !grupoSeleccionado ? '#f1f5f9' : 'white'}}
                        >
                            <option value="">{grupoSeleccionado ? `Rivales Grupo ${grupoSeleccionado}...` : "Elija local primero"}</option>
                            {equipos
                                .filter(e => e.grupo === grupoSeleccionado && e.id !== form.localId)
                                .map(e => (
                                    <option key={e.id} value={e.id}>{e.nombre}</option>
                                ))
                            }
                        </select>
                    </div>
                </div>

                {/* FECHA Y HORA */}
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                    <div>
                        <label style={{fontSize: '0.8rem', fontWeight: 'bold', color: '#475569'}}>FECHA</label>
                        <input 
                            type="date" 
                            value={form.fecha} 
                            onChange={e => setForm({...form, fecha:e.target.value})} 
                            required 
                            style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1'}}
                        />
                    </div>
                    <div>
                        <label style={{fontSize: '0.8rem', fontWeight: 'bold', color: '#475569'}}>HORA</label>
                        <input 
                            type="time" 
                            value={form.hora} 
                            onChange={e => setForm({...form, hora:e.target.value})} 
                            required 
                            style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1'}}
                        />
                    </div>
                </div>

                {/* CANCHA */}
                <div>
                    <label style={{fontSize: '0.8rem', fontWeight: 'bold', color: '#475569'}}>CANCHA / SEDE</label>
                    <input 
                        type="text" 
                        placeholder="Ejem: Gimnasio San Mateo"
                        value={form.cancha} 
                        onChange={e => setForm({...form, cancha:e.target.value})} 
                        required 
                        style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #cbd5e1'}}
                    />
                </div>

                <button 
                    type="submit" 
                    disabled={loading} 
                    style={{
                        width:'100%', 
                        padding: '12px', 
                        background: '#1e3a8a', 
                        color: 'white', 
                        fontWeight: 'bold', 
                        border: 'none', 
                        borderRadius: '8px', 
                        cursor: loading ? 'not-allowed' : 'pointer',
                        marginTop: '10px'
                    }}
                >
                    {loading ? 'PROCESANDO...' : '➕ AGREGAR AL CALENDARIO'}
                </button>
            </form>
        </div>
    );
};

export default MatchForm;