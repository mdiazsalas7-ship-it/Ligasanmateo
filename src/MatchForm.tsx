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
        cancha: matchToEdit?.cancha || '',
        fase: matchToEdit?.fase || 'REGULAR' 
    });
    
    const [grupoSeleccionado, setGrupoSeleccionado] = useState<string | null>(matchToEdit?.grupo || null);
    const [loading, setLoading] = useState(false);

    // Determinar nombre de colección según categoría
    const getCollectionName = (base: string) => {
        const cat = categoriaActiva.trim().toUpperCase();
        if (cat === 'MASTER40') return base;
        return `${base}_${cat}`;
    };

    // 1. CARGA DE EQUIPOS
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

    // 2. RESETEAR VISITANTE SI CAMBIA LA FASE
    // Esto evita que quede seleccionado un equipo del mismo grupo si pasas a Playoff
    useEffect(() => {
        setForm(prev => ({ ...prev, visitId: '' }));
    }, [form.fase]);

    // 3. CAMBIO DE EQUIPO LOCAL
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

            if (!local || !visit) throw new Error("Equipos inválidos.");
            
            const matchData = {
                equipoLocalId: local.id,
                equipoLocalNombre: local.nombre,
                equipoVisitanteId: visit.id,
                equipoVisitanteNombre: visit.nombre,
                grupo: grupoSeleccionado, // Se mantiene el grupo del local como referencia
                categoria: categoriaActiva,
                fechaAsignada: form.fecha,
                hora: form.hora,
                cancha: form.cancha.toUpperCase(),
                fase: form.fase,
                estatus: matchToEdit ? matchToEdit.estatus : 'programado',
                marcadorLocal: matchToEdit ? matchToEdit.marcadorLocal : 0,
                marcadorVisitante: matchToEdit ? matchToEdit.marcadorVisitante : 0,
                registradoPorId: auth.currentUser?.uid
            };

            const nombreColCalendario = getCollectionName('calendario');

            if (matchToEdit) {
                await updateDoc(doc(db, nombreColCalendario, matchToEdit.id), matchData);
                alert("✏️ Juego actualizado.");
            } else {
                await addDoc(collection(db, nombreColCalendario), matchData);
                alert(`📅 Juego de ${form.fase} creado.`);
            }

            onSuccess();
        } catch (err: any) {
            alert("Error: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto', background: 'white', padding: '25px', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'20px', alignItems: 'center'}}>
                <h2 style={{color: '#1e3a8a', margin: 0, fontSize:'1.2rem'}}>
                    {matchToEdit ? '✏️ Editar Juego' : `📅 Nuevo Juego ${categoriaActiva}`}
                </h2>
                {onClose && <button onClick={onClose} style={{background: '#ef4444', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '6px', cursor: 'pointer', fontWeight:'bold'}}>Cerrar</button>}
            </div>

            <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
                
                {/* SELECTOR DE FASE */}
                <div style={{background:'#eff6ff', padding:'10px', borderRadius:'8px', border:'1px solid #1e3a8a'}}>
                    <label style={{fontSize: '0.7rem', fontWeight: 'bold', color: '#1e3a8a'}}>TIPO DE JUEGO (FASE)</label>
                    <select 
                        value={form.fase} 
                        onChange={e => setForm({...form, fase: e.target.value})} 
                        style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '8px', border: '1px solid #1e3a8a', fontWeight:'bold', color:'#1e3a8a', cursor:'pointer'}}
                    >
                        <option value="REGULAR">📅 TEMPORADA REGULAR</option>
                        <option value="OCTAVOS">🔥 OCTAVOS DE FINAL</option>
                        <option value="CUARTOS">⚔️ CUARTOS DE FINAL</option>
                        <option value="SEMIS">🏆 SEMIFINAL</option>
                        <option value="FINAL">👑 GRAN FINAL</option>
                    </select>
                </div>

                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                    {/* LOCAL */}
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
                                    {e.nombre} (G-{e.grupo})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* VISITANTE CON LÓGICA DE FILTRADO PARA CRUCES */}
                    <div>
                        <label style={{fontSize: '0.7rem', fontWeight: 'bold', color: '#64748b'}}>VISITANTE</label>
                        <select 
                            value={form.visitId} 
                            onChange={e => setForm({...form, visitId: e.target.value})} 
                            required
                            disabled={!grupoSeleccionado}
                            style={{width: '100%', padding: '10px', marginTop: '5px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight:'bold', background: !grupoSeleccionado ? '#f1f5f9' : 'white'}}
                        >
                            <option value="">
                                {!grupoSeleccionado 
                                    ? "---" 
                                    : form.fase === 'REGULAR' 
                                        ? `Rivales Grupo ${grupoSeleccionado}...` 
                                        : `Rivales del Grupo Contrario...`}
                            </option>
                            {equipos
                                .filter(e => {
                                    if (e.id === form.localId) return false;
                                    
                                    if (form.fase === 'REGULAR') {
                                        // Mismo grupo en temporada regular
                                        return e.grupo === grupoSeleccionado;
                                    } else {
                                        // Grupo contrario en Playoffs (Cruces A vs B)
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