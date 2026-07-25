// ─────────────────────────────────────────────────────────────
// VALLA LED DE PATROCINADORES
//
// Imita una valla LED de cancha: panel oscuro con textura de
// puntos, brillo de barrido, y el patrocinador ENTRANDO desde
// la derecha, quedándose unos segundos y saliendo por la izquierda.
//
// - El nivel (oro/plata/bronce) NO se muestra al público:
//   solo define el ORDEN y la FRECUENCIA de aparición.
// - Los ORO salen más veces en el ciclo que los demás.
// - Con un solo patrocinador, igual entra y sale (se mantiene vivo).
// - Sin patrocinadores vigentes, no se renderiza nada.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from './firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { estaVigente, NIVEL_ORDEN, type Patrocinador } from './sponsors';

// Duración de cada pase (entra + se queda + sale)
const CICLO_MS = 6200;

// Cuántas veces entra cada nivel en una vuelta completa
const REPETICIONES: Record<string, number> = { oro: 3, plata: 2, bronce: 1 };

const SponsorBanner: React.FC = () => {
    const [todos, setTodos] = useState<Patrocinador[]>([]);
    const [paso, setPaso] = useState(0);
    const timer = useRef<number | null>(null);

    useEffect(() => {
        return onSnapshot(collection(db, 'patrocinadores'), snap => {
            setTodos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Patrocinador)));
        }, err => console.error('[valla] Error:', err));
    }, []);

    // Lista de reproducción: los oro aparecen más veces, intercalados
    const playlist = useMemo(() => {
        const vigentes = todos
            .filter(estaVigente)
            .sort((a, b) =>
                (NIVEL_ORDEN[a.nivel] - NIVEL_ORDEN[b.nivel]) ||
                ((a.orden ?? 99) - (b.orden ?? 99))
            );
        if (vigentes.length === 0) return [];

        const maxRep = Math.max(...vigentes.map(p => REPETICIONES[p.nivel] ?? 1));
        const cola: Patrocinador[] = [];
        // Intercalado por rondas: evita que los oro salgan todos seguidos
        for (let ronda = 0; ronda < maxRep; ronda++) {
            for (const p of vigentes) {
                if ((REPETICIONES[p.nivel] ?? 1) > ronda) cola.push(p);
            }
        }
        return cola;
    }, [todos]);

    // Avance del ciclo
    useEffect(() => {
        if (playlist.length === 0) return;
        timer.current = window.setInterval(() => {
            setPaso(p => p + 1);
        }, CICLO_MS);
        return () => { if (timer.current) window.clearInterval(timer.current); };
    }, [playlist.length]);

    if (playlist.length === 0) return null;
    const p = playlist[paso % playlist.length];

    const abrir = () => {
        if (p.enlace) window.open(p.enlace, '_blank', 'noopener');
    };

    return (
        <div style={{ maxWidth: 500, margin: '0 auto', position: 'relative' }}>
            <style>{`
@keyframes ledPase {
  0%   { transform: translateX(115%); opacity: 0; }
  10%  { transform: translateX(0);    opacity: 1; }
  85%  { transform: translateX(0);    opacity: 1; }
  100% { transform: translateX(-115%); opacity: 0; }
}
@keyframes ledBarrido {
  0%   { transform: translateX(-60%); }
  100% { transform: translateX(260%); }
}
@keyframes ledPulso {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 1; }
}
.led-pase    { animation: ledPase ${CICLO_MS}ms cubic-bezier(.22,1,.36,1) both; }
.led-barrido { animation: ledBarrido 3.2s ease-in-out infinite; }
.led-punto   { animation: ledPulso 1.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .led-pase    { animation: none; transform: none; opacity: 1; }
  .led-barrido { animation: none; opacity: 0; }
  .led-punto   { animation: none; }
}
            `}</style>

            <div
                onClick={abrir}
                style={{
                    position: 'relative',
                    height: 58,
                    overflow: 'hidden',
                    cursor: p.enlace ? 'pointer' : 'default',
                    background: '#05070d',
                    backgroundImage:
                        'radial-gradient(rgba(148,163,184,0.16) 1px, transparent 1px)',
                    backgroundSize: '4px 4px',
                    borderTop: '1px solid rgba(249,115,22,0.35)',
                    borderBottom: '2px solid #f97316',
                }}
            >
                {/* Brillo de barrido, como el refresco de una pantalla LED */}
                <div className="led-barrido" style={{
                    position: 'absolute', top: 0, left: 0, width: '35%', height: '100%',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.055), transparent)',
                    pointerEvents: 'none', zIndex: 3,
                }} />

                {/* Punto rojo de "panel encendido" */}
                <div className="led-punto" style={{
                    position: 'absolute', top: 7, right: 9, width: 5, height: 5,
                    borderRadius: '50%', background: '#f97316', zIndex: 4,
                }} />

                {/* Contenido que entra y sale — key fuerza el reinicio de la animación */}
                <div
                    key={`${p.id}-${paso}`}
                    className="led-pase"
                    style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '0 18px', willChange: 'transform, opacity',
                    }}
                >
                    <img
                        src={p.logoUrl}
                        alt={p.nombre}
                        style={{
                            height: 40, maxWidth: 96, objectFit: 'contain',
                            borderRadius: 6, background: 'white', padding: 3,
                            flexShrink: 0, boxSizing: 'border-box',
                        }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                            color: 'white', fontSize: '0.86rem', fontWeight: 900,
                            letterSpacing: '0.02em', lineHeight: 1.15,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            textShadow: '0 0 14px rgba(249,115,22,0.45)',
                        }}>
                            {p.nombre}
                        </div>
                        {p.descripcion && (
                            <div style={{
                                color: '#fdba74', fontSize: '0.62rem', fontWeight: 700,
                                letterSpacing: '0.06em', marginTop: 2,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                                {p.descripcion.toUpperCase()}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SponsorBanner;
