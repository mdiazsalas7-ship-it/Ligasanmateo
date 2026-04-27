// ─────────────────────────────────────────────────────────────
// src/InstallPrompt.tsx
// Banner para instalar la PWA.
//   - Android/Chrome/Edge: captura beforeinstallprompt y dispara prompt nativo
//   - iOS Safari: muestra instrucciones manuales (Compartir → Añadir a inicio)
//   - Si ya está instalada (display-mode: standalone), no muestra nada
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const LOGO = 'https://i.postimg.cc/FKgNmFpv/Whats_App_Image_2026_01_25_at_12_07_36_AM.jpg';

const InstallPrompt: React.FC = () => {
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
    const [show, setShow]         = useState(false);
    const [isIOS, setIsIOS]       = useState(false);
    const [showIOSHelp, setShowIOSHelp] = useState(false);

    useEffect(() => {
        // Si ya está instalada, no mostrar
        const standalone =
            window.matchMedia('(display-mode: standalone)').matches ||
            // @ts-ignore — propiedad iOS Safari
            window.navigator.standalone === true;
        if (standalone) return;

        // Detección de iOS Safari (no soporta beforeinstallprompt)
        const ua = window.navigator.userAgent.toLowerCase();
        const ios = /iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua);
        if (ios) {
            setIsIOS(true);
            setShow(true);
            return;
        }

        // Android / Chrome / Edge
        const onBeforeInstall = (e: Event) => {
            e.preventDefault();
            setDeferred(e as BeforeInstallPromptEvent);
            setShow(true);
        };
        window.addEventListener('beforeinstallprompt', onBeforeInstall);

        // Si la app se instala, ocultar
        const onInstalled = () => setShow(false);
        window.addEventListener('appinstalled', onInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', onBeforeInstall);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    const handleInstall = async () => {
        if (isIOS) { setShowIOSHelp(true); return; }
        if (!deferred) return;
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        if (outcome === 'accepted') setShow(false);
        setDeferred(null);
    };

    const handleDismiss = () => {
        setShow(false);
        try { sessionStorage.setItem('install_dismissed', '1'); } catch {}
    };

    // Recordar dismiss durante la sesión
    useEffect(() => {
        try {
            if (sessionStorage.getItem('install_dismissed') === '1') setShow(false);
        } catch {}
    }, []);

    if (!show) return null;

    // ── Modal iOS con instrucciones ──
    if (showIOSHelp) {
        return (
            <div style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
            }}>
                <div style={{
                    background: 'white', borderRadius: 18, padding: 24,
                    maxWidth: 360, width: '100%', textAlign: 'center',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
                }}>
                    <img src={LOGO} alt="Liga"
                        style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', marginBottom: 12 }} />
                    <h3 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: '1.1rem' }}>Instalar en iPhone</h3>
                    <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
                        Sigue estos pasos en Safari:
                    </p>
                    <div style={{ textAlign: 'left', fontSize: '0.85rem', color: '#1e293b', lineHeight: 1.7, marginBottom: 18 }}>
                        <div>1. Toca el botón <strong>Compartir</strong> <span style={{ fontSize: '1.1rem' }}>⬆️</span> abajo</div>
                        <div>2. Desliza y toca <strong>"Añadir a pantalla de inicio"</strong></div>
                        <div>3. Toca <strong>"Añadir"</strong> arriba a la derecha</div>
                    </div>
                    <button onClick={handleDismiss}
                        style={{
                            width: '100%', background: '#1e3a8a', color: 'white', border: 'none',
                            padding: '12px', borderRadius: 10, fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer',
                        }}>
                        ENTENDIDO
                    </button>
                </div>
            </div>
        );
    }

    // ── Banner ──
    return (
        <div style={{
            position: 'fixed', bottom: 16, left: 16, right: 16,
            background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)',
            color: 'white', borderRadius: 14, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
            zIndex: 4500, maxWidth: 480, margin: '0 auto',
            border: '1px solid rgba(249,115,22,0.4)',
        }}>
            <img src={LOGO} alt="Liga"
                style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '2px solid #f97316', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: '0.85rem', lineHeight: 1.2 }}>
                    Instalar LIMEBAL
                </div>
                <div style={{ fontSize: '0.7rem', color: '#cbd5e1', marginTop: 2 }}>
                    Acceso directo y notificaciones
                </div>
            </div>
            <button onClick={handleInstall}
                style={{
                    background: '#f97316', color: 'white', border: 'none',
                    padding: '8px 14px', borderRadius: 8, fontWeight: 900,
                    fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                INSTALAR
            </button>
            <button onClick={handleDismiss}
                aria-label="Cerrar"
                style={{
                    background: 'transparent', color: '#94a3b8', border: 'none',
                    fontSize: '1.1rem', cursor: 'pointer', padding: '4px 6px', flexShrink: 0,
                }}>
                ✕
            </button>
        </div>
    );
};

export default InstallPrompt;