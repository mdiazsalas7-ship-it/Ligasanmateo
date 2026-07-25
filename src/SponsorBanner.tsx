// ─────────────────────────────────────────────────────────────
// VALLA DE PATROCINADORES — banda clara bajo el header
//
// Comportamiento (patrón ESPN: banner debajo de la navegación):
// - 0 patrocinadores vigentes  → no se renderiza nada
// - 1 a 3                      → rota igual, pero sin prisa (8s)
// - 4 o más                    → rotación cada 5s
// - Los ORO van primero en el ciclo (arrancan visibles)
// - Tocar la valla abre el enlace del negocio (WhatsApp/IG/web)
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState } from 'react';
import { db } from './firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { estaVigente, NIVEL_ORDEN, type Patrocinador } from './sponsors';

const SponsorBanner: React.FC = () => {
    const [todos, setTodos] = useState<Patrocinador[]>([]);
    const [idx, setIdx] = useState(0);
    const [fading, setFading] = useState(false);

    // Escucha en vivo: si desactivas uno en el panel, desaparece al instante
    useEffect(() => {
        return onSnapshot(collection(db, 'patrocinadores'), snap => {
            setTodos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Patrocinador)));
        }, err => console.error('[valla] Error:', err));
    }, []);

    const vigentes = useMemo(() =>
        todos
            .filter(estaVigente)
            .sort((a, b) =>
                (NIVEL_ORDEN[a.nivel] - NIVEL_ORDEN[b.nivel]) ||
                ((a.orden ?? 99) - (b.orden ?? 99))
            ),
        [todos]
    );

    // Rotación con pequeño fundido
    useEffect(() => {
        if (vigentes.length < 2) return;
        const ms = vigentes.length >= 4 ? 5000 : 8000;
        const t = setInterval(() => {
            setFading(true);
            setTimeout(() => {
                setIdx(i => (i + 1) % vigentes.length);
                setFading(false);
            }, 250);
        }, ms);
        return () => clearInterval(t);
    }, [vigentes.length]);

    if (vigentes.length === 0) return null;
    const p = vigentes[idx % vigentes.length];

    const abrir = () => {
        if (p.enlace) window.open(p.enlace, '_blank', 'noopener');
    };

    return (
        <div
            onClick={abrir}
            style={{
                background: '#f8fafc',
                borderBottom: '2px solid #f97316',
                padding: '7px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                cursor: p.enlace ? 'pointer' : 'default',
                opacity: fading ? 0 : 1,
                transition: 'opacity 0.25s',
                maxWidth: 500,
                margin: '0 auto',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <img
                    src={p.logoUrl}
                    alt={p.nombre}
                    style={{
                        width: 34, height: 34, borderRadius: 8,
                        objectFit: 'contain', background: 'white',
                        border: '1px solid #e2e8f0', flexShrink: 0,
                    }}
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <div style={{ minWidth: 0 }}>
                    <div style={{
                        color: '#0f172a', fontSize: '0.72rem', fontWeight: 800,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                        {p.nombre}
                        {p.nivel === 'oro' && (
                            <span style={{
                                marginLeft: 6, background: '#fbbf24', color: '#78350f',
                                fontSize: '0.5rem', fontWeight: 900,
                                padding: '1px 6px', borderRadius: 6, verticalAlign: 'middle',
                            }}>ORO</span>
                        )}
                    </div>
                    {p.descripcion && (
                        <div style={{
                            color: '#64748b', fontSize: '0.62rem',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                            {p.descripcion}
                        </div>
                    )}
                </div>
            </div>

            {vigentes.length > 1 && (
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                    {vigentes.slice(0, 6).map((_, i) => (
                        <span key={i} style={{
                            width: 5, height: 5, borderRadius: '50%',
                            background: i === (idx % vigentes.length) ? '#0f172a' : '#cbd5e1',
                            transition: 'background 0.2s',
                        }} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default SponsorBanner;
