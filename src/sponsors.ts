// ─────────────────────────────────────────────────────────────
// SISTEMA DE PATROCINADORES — módulo compartido
//
// - Tipos y niveles de paquete
// - fetchPatrocinadoresVigentes(): lee solo los activos y no vencidos
// - appendSponsorStrip(): agrega la franja "PATROCINAN" a cualquier
//   canvas ya dibujado (flyers, resultados) SIN tocar su layout:
//   crea un canvas más alto y pega la franja debajo.
// ─────────────────────────────────────────────────────────────
import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';

export type NivelPatrocinio = 'oro' | 'plata' | 'bronce';

export interface Patrocinador {
    id: string;
    nombre: string;
    logoUrl: string;
    nivel: NivelPatrocinio;
    activo: boolean;
    vencimiento: string;   // 'YYYY-MM-DD'
    enlace?: string;       // WhatsApp / Instagram / web del negocio
    descripcion?: string;  // tagline corto para la valla
    orden?: number;
}

export const NIVEL_ORDEN: Record<NivelPatrocinio, number> = { oro: 0, plata: 1, bronce: 2 };

export const hoyISO = (): string => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString().split('T')[0];
};

export const estaVigente = (p: Patrocinador): boolean =>
    p.activo === true && !!p.vencimiento && p.vencimiento >= hoyISO();

// ── Lee patrocinadores vigentes, opcionalmente filtrados por nivel ──
export async function fetchPatrocinadoresVigentes(
    niveles?: NivelPatrocinio[]
): Promise<Patrocinador[]> {
    try {
        const snap = await getDocs(collection(db, 'patrocinadores'));
        return snap.docs
            .map(d => ({ id: d.id, ...d.data() } as Patrocinador))
            .filter(p => estaVigente(p) && (!niveles || niveles.includes(p.nivel)))
            .sort((a, b) =>
                (NIVEL_ORDEN[a.nivel] - NIVEL_ORDEN[b.nivel]) ||
                ((a.orden ?? 99) - (b.orden ?? 99))
            );
    } catch (e) {
        console.error('[patrocinadores] Error al cargar:', e);
        return [];
    }
}

// ── Carga una imagen como base64 (mismo patrón que los generadores) ──
const loadImg = (url: string): Promise<HTMLImageElement | null> =>
    new Promise(async resolve => {
        try {
            const res = await fetch(url);
            if (!res.ok) { resolve(null); return; }
            const blob = await res.blob();
            const b64 = await new Promise<string>(r => {
                const fr = new FileReader();
                fr.onloadend = () => r(fr.result as string);
                fr.onerror = () => r('');
                fr.readAsDataURL(blob);
            });
            if (!b64) { resolve(null); return; }
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = b64;
        } catch { resolve(null); }
    });

// ─────────────────────────────────────────────────────────────
// appendSponsorStrip
// Recibe el canvas terminado y devuelve uno nuevo con la franja
// de patrocinadores agregada abajo. Si no hay patrocinadores,
// devuelve el canvas original intacto.
// ─────────────────────────────────────────────────────────────
export async function appendSponsorStrip(
    canvas: HTMLCanvasElement,
    patrocinadores: Patrocinador[]
): Promise<HTMLCanvasElement> {
    if (!patrocinadores.length) return canvas;

    // Máximo 4 logos en la franja para que se vean bien
    const lista = patrocinadores.slice(0, 4);

    const W = canvas.width;
    const STRIP_H = Math.round(W * 0.115);          // proporcional al ancho
    const out = document.createElement('canvas');
    out.width = W;
    out.height = canvas.height + STRIP_H;
    const ctx = out.getContext('2d')!;

    // Imagen original arriba
    ctx.drawImage(canvas, 0, 0);

    // Fondo de la franja
    const y0 = canvas.height;
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, y0, W, STRIP_H);
    ctx.strokeStyle = 'rgba(249,115,22,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, y0 + 1); ctx.lineTo(W, y0 + 1); ctx.stroke();

    // Etiqueta PATROCINAN
    const labelH = Math.round(STRIP_H * 0.28);
    ctx.fillStyle = 'rgba(148,163,184,0.85)';
    ctx.font = `bold ${Math.max(11, Math.round(W * 0.016))}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P A T R O C I N A N', W / 2, y0 + labelH / 2 + 6);

    // Tarjetas blancas con los logos
    const zoneY = y0 + labelH + 2;
    const zoneH = STRIP_H - labelH - Math.round(STRIP_H * 0.14);
    const cardH = zoneH;
    const cardW = Math.min(Math.round(W * 0.21), Math.round(cardH * 2.6));
    const gap = Math.round(W * 0.02);
    const totalW = lista.length * cardW + (lista.length - 1) * gap;
    let x = (W - totalW) / 2;

    const imgs = await Promise.all(lista.map(p => loadImg(p.logoUrl)));

    for (let i = 0; i < lista.length; i++) {
        const img = imgs[i];
        // Tarjeta blanca redondeada
        ctx.fillStyle = '#f8fafc';
        const r = 8;
        ctx.beginPath();
        ctx.moveTo(x + r, zoneY);
        ctx.arcTo(x + cardW, zoneY, x + cardW, zoneY + cardH, r);
        ctx.arcTo(x + cardW, zoneY + cardH, x, zoneY + cardH, r);
        ctx.arcTo(x, zoneY + cardH, x, zoneY, r);
        ctx.arcTo(x, zoneY, x + cardW, zoneY, r);
        ctx.closePath();
        ctx.fill();

        if (img) {
            // Logo centrado dentro de la tarjeta, con margen
            const pad = Math.round(cardH * 0.14);
            const maxW = cardW - pad * 2, maxH = cardH - pad * 2;
            const ratio = Math.min(maxW / img.width, maxH / img.height);
            const nw = img.width * ratio, nh = img.height * ratio;
            ctx.drawImage(img, x + (cardW - nw) / 2, zoneY + (cardH - nh) / 2, nw, nh);
        } else {
            // Fallback: nombre del negocio en texto
            ctx.fillStyle = '#334155';
            ctx.font = `bold ${Math.max(11, Math.round(cardH * 0.3))}px system-ui`;
            ctx.fillText(
                lista[i].nombre.length > 16 ? lista[i].nombre.slice(0, 15) + '…' : lista[i].nombre,
                x + cardW / 2, zoneY + cardH / 2
            );
        }
        x += cardW + gap;
    }

    ctx.textBaseline = 'alphabetic';
    return out;
}
