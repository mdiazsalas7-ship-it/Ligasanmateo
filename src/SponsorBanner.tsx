// ─────────────────────────────────────────────────────────────
// VALLA LED DE PATROCINADORES
//
// Secuencia de cada pase (como una valla LED de cancha):
//   1. ENTRA   — el logo se desliza desde la izquierda y se posiciona
//   2. ESCRIBE — el nombre y el tagline caen letra por letra
//   3. ESPERA  — se queda fijo para que dé tiempo a leerlo
//   4. SALE    — todo se desliza hacia la izquierda y entra el siguiente
//
// El nivel (oro/plata/bronce) NO se muestra al público: solo define
// cuántas veces aparece cada patrocinador en la vuelta completa.
// Sin patrocinadores vigentes, no se renderiza nada.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { db } from './firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { estaVigente, NIVEL_ORDEN, type Patrocinador } from './sponsors';

// ── Tiempos de la secuencia (ms) ──
const T_ENTRADA = 700;    // el logo se desliza y se posiciona
const T_LETRA   = 45;     // cada letra de la máquina de escribir
const T_ESPERA  = 5000;   // cuánto se queda quieto ya escrito
const T_SALIDA  = 600;    // deslizamiento de salida

// Cuántas veces entra cada nivel en una vuelta completa
const REPETICIONES: Record<string, number> = { oro: 3, plata: 2, bronce: 1 };

type Fase = 'entrando' | 'escribiendo' | 'esperando' | 'saliendo';

const SponsorBanner: React.FC = () => {
    const [todos, setTodos] = useState<Patrocinador[]>([]);
    const [paso, setPaso] = useState(0);
    const [fase, setFase] = useState<Fase>('entrando');
    const [letras, setLetras] = useState(0);
    const timers = useRef<number[]>([]);

    useEffect(() => {
        return onSnapshot(collection(db, 'patrocinadores'), snap => {
            setTodos(snap.docs.map(d => ({ id: d.id, ...d.data() } as Patrocinador)));
        }, err => console.error('[valla] Error:', err));
    }, []);

    // Lista de reproducción: los oro salen más veces, intercalados
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
        for (let ronda = 0; ronda < maxRep; ronda++) {
            for (const p of vigentes) {
                if ((REPETICIONES[p.nivel] ?? 1) > ronda) cola.push(p);
            }
        }
        return cola;
    }, [todos]);

    const actual = playlist.length ? playlist[paso % playlist.length] : null;
    const nombre = actual?.nombre ?? '';
    const tagline = (actual?.descripcion ?? '').toUpperCase();
    const totalLetras = nombre.length + tagline.length;

    // ── Máquina de estados de la secuencia ──
    useEffect(() => {
        if (!actual) return;
        timers.current.forEach(clearTimeout);
        timers.current = [];
        setFase('entrando');
        setLetras(0);

        const push = (fn: () => void, ms: number) => {
            timers.current.push(window.setTimeout(fn, ms));
        };

        // 1. Entrada del logo → 2. Empieza a escribir
        push(() => setFase('escribiendo'), T_ENTRADA);

        // 2. Escritura letra por letra
        for (let i = 1; i <= totalLetras; i++) {
            push(() => setLetras(i), T_ENTRADA + i * T_LETRA);
        }

        const finEscritura = T_ENTRADA + totalLetras * T_LETRA;

        // 3. Espera con el texto completo
        push(() => setFase('esperando'), finEscritura);

        // 4. Salida y avance al siguiente
        push(() => setFase('saliendo'), finEscritura + T_ESPERA);
        push(() => setPaso(p => p + 1), finEscritura + T_ESPERA + T_SALIDA);

        return () => { timers.current.forEach(clearTimeout); timers.current = []; };
    }, [paso, actual?.id, totalLetras]);

    if (!actual) return null;

    const nombreVisible  = nombre.slice(0, Math.min(letras, nombre.length));
    const taglineVisible = tagline.slice(0, Math.max(0, letras - nombre.length));
    const escribiendo    = fase === 'escribiendo';
    const saliendo       = fase === 'saliendo';

    const abrir = () => {
        if (actual.enlace) window.open(actual.enlace, '_blank', 'noopener');
    };

    return (
        <div style={{ maxWidth: 500, margin: '0 auto' }}>
            <style>{`
@keyframes ledLogoEntra {
  0%   { transform: translateX(-140%); opacity: 0; }
  70%  { transform: translateX(6%);    opacity: 1; }
  100% { transform: translateX(0);     opacity: 1; }
}
@keyframes ledBarrido {
  0%   { transform: translateX(-60%); }
  100% { transform: translateX(280%); }
}
@keyframes ledCursor {
  0%, 45%   { opacity: 1; }
  55%, 100% { opacity: 0; }
}
@keyframes ledPunto {
  0%, 100% { opacity: 0.5; }
  50%      { opacity: 1; }
}
.led-logo    { animation: ledLogoEntra ${T_ENTRADA}ms cubic-bezier(.16,1,.3,1) both; }
.led-barrido { animation: ledBarrido 3.4s ease-in-out infinite; }
.led-cursor  { animation: ledCursor 0.7s step-end infinite; }
.led-punto   { animation: ledPunto 1.6s ease-in-out infinite; }
.led-panel   { transition: transform ${T_SALIDA}ms cubic-bezier(.6,0,.9,.3), opacity ${T_SALIDA}ms ease-in; }
@media (prefers-reduced-motion: reduce) {
  .led-logo, .led-barrido, .led-cursor, .led-punto { animation: none; }
  .led-panel { transition: none; }
}
            `}</style>

            <div
                onClick={abrir}
                style={{
                    position: 'relative',
                    height: 62,
                    overflow: 'hidden',
                    cursor: actual.enlace ? 'pointer' : 'default',
                    background: '#05070d',
                    backgroundImage: 'radial-gradient(rgba(148,163,184,0.16) 1px, transparent 1px)',
                    backgroundSize: '4px 4px',
                    borderTop: '1px solid rgba(249,115,22,0.35)',
                    borderBottom: '2px solid #f97316',
                }}
            >
                {/* Barrido de brillo — refresco del panel */}
                <div className="led-barrido" style={{
                    position: 'absolute', top: 0, left: 0, width: '35%', height: '100%',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)',
                    pointerEvents: 'none', zIndex: 3,
                }} />

                {/* Punto de panel encendido */}
                <div className="led-punto" style={{
                    position: 'absolute', top: 7, right: 9, width: 5, height: 5,
                    borderRadius: '50%', background: '#f97316', zIndex: 4,
                }} />

                <div
                    className="led-panel"
                    style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', gap: 13,
                        padding: '0 18px',
                        transform: saliendo ? 'translateX(-115%)' : 'translateX(0)',
                        opacity: saliendo ? 0 : 1,
                    }}
                >
                    <img
                        key={`logo-${actual.id}-${paso}`}
                        className="led-logo"
                        src={actual.logoUrl}
                        alt={actual.nombre}
                        style={{
                            height: 42, maxWidth: 98, objectFit: 'contain',
                            borderRadius: 6, background: 'white', padding: 3,
                            flexShrink: 0, boxSizing: 'border-box',
                        }}
                        onError={e => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                    />

                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                            color: 'white', fontSize: '0.88rem', fontWeight: 900,
                            letterSpacing: '0.02em', lineHeight: 1.15,
                            whiteSpace: 'nowrap', overflow: 'hidden',
                            textShadow: '0 0 14px rgba(249,115,22,0.5)',
                            minHeight: '1.15em',
                        }}>
                            {nombreVisible}
                            {escribiendo && letras <= nombre.length && (
                                <span className="led-cursor" style={{ color: '#f97316' }}>▌</span>
                            )}
                        </div>
                        {tagline && (
                            <div style={{
                                color: '#fdba74', fontSize: '0.63rem', fontWeight: 700,
                                letterSpacing: '0.07em', marginTop: 3,
                                whiteSpace: 'nowrap', overflow: 'hidden',
                                minHeight: '1em',
                            }}>
                                {taglineVisible}
                                {escribiendo && letras > nombre.length && (
                                    <span className="led-cursor">▌</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SponsorBanner;
