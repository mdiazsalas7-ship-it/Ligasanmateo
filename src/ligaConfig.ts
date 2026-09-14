// ─────────────────────────────────────────────────────────────
// src/ligaConfig.ts
// ÚNICA FUENTE DE VERDAD para admins y nombres de colecciones.
// ─────────────────────────────────────────────────────────────

import { db } from './firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

export const ADMIN_EMAILS = [
    'adminlibasan@gmail.com',
    'yolfren1985@gmail.com',
];

export const esAdminPorEmail = (email?: string | null): boolean =>
    !!email && ADMIN_EMAILS.includes(email.toLowerCase().trim());

// ─────────────────────────────────────────────────────────────
// NOMBRES DE COLECCIONES POR CATEGORÍA
// Convención: `<base>_<CATEGORIA>` (equipos_U16M, calendario_LIBRE).
// Excepción histórica: MASTER40 usó las colecciones originales sin
// sufijo (equipos, jugadores, calendario). Esa excepción vive solo aquí.
// ─────────────────────────────────────────────────────────────

const CATEGORIA_SIN_SUFIJO = 'MASTER40';

export const normalizarCategoria = (cat: string): string => {
    const c = (cat || '').trim().toUpperCase();
    return c === 'MASTER' ? CATEGORIA_SIN_SUFIJO : c;
};

export const getColName = (base: string, categoria: string): string => {
    const cat = normalizarCategoria(categoria);
    return cat === CATEGORIA_SIN_SUFIJO ? base : `${base}_${cat}`;
};

export const getLogosFolder = (categoria: string): string =>
    `logos_${normalizarCategoria(categoria)}`;

// ─────────────────────────────────────────────────────────────
// CATEGORÍAS
//
// Fuente de verdad: la colección `categorias` de Firestore.
// Mientras esa colección no exista (o esté vacía), se usan estas
// 5 por defecto para que la app siga funcionando sin migración.
// Cada doc de `categorias` tiene: { id, label, orden, activa }
//   - id     → mismo string que ya usan las colecciones (U16M, LIBRE...)
//   - label  → cómo se muestra en el menú (con emoji si se quiere)
//   - orden  → posición en el menú (número)
//   - activa → false = oculta de la app pero conserva sus datos
// ─────────────────────────────────────────────────────────────

export interface CategoriaLiga {
    id: string;
    label: string;
    orden?: number;
    activa?: boolean;
}

// Semilla por defecto (fallback si no hay colección `categorias`)
export const CATEGORIAS_DEFAULT: CategoriaLiga[] = [
    { id: 'INTERINDUSTRIAL', label: '🏭 INTERINDUSTRIAL', orden: 1, activa: true },
    { id: 'U16_FEMENINO',    label: '👧 U16 FEMENINO',    orden: 2, activa: true },
    { id: 'U16M',            label: '👦 U16 MASCULINO',   orden: 3, activa: true },
    { id: 'LIBRE',           label: '🏀 LIGA FLORES',     orden: 4, activa: true },
    { id: 'MASTER40',        label: '🍷 MASTER 40',       orden: 5, activa: true },
];

// Compatibilidad: código viejo que importaba CATEGORIAS / CATEGORIA_IDS
// sigue funcionando con la semilla por defecto.
export const CATEGORIAS = CATEGORIAS_DEFAULT;
export const CATEGORIA_IDS = CATEGORIAS_DEFAULT.map(c => c.id);

const COL_CATEGORIAS = 'categorias';

// Lee las categorías desde Firestore. Si la colección no existe o está
// vacía, devuelve la semilla por defecto. `soloActivas` filtra las
// desactivadas (para el menú público); el panel de admin las pide todas.
export async function cargarCategorias(soloActivas = true): Promise<CategoriaLiga[]> {
    try {
        const snap = await getDocs(collection(db, COL_CATEGORIAS));
        if (snap.empty) return filtrar(CATEGORIAS_DEFAULT, soloActivas);

        const cats = snap.docs.map(d => {
            const data = d.data();
            return {
                id:     d.id,
                label:  data.label || d.id,
                orden:  typeof data.orden === 'number' ? data.orden : 999,
                activa: data.activa !== false, // por defecto activa
            } as CategoriaLiga;
        });
        cats.sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999));
        return filtrar(cats, soloActivas);
    } catch (e) {
        console.warn('[categorias] Error leyendo, uso semilla por defecto:', e);
        return filtrar(CATEGORIAS_DEFAULT, soloActivas);
    }
}

const filtrar = (cats: CategoriaLiga[], soloActivas: boolean) =>
    soloActivas ? cats.filter(c => c.activa !== false) : cats;

// Crea o actualiza una categoría (el id es el nombre en MAYÚSCULAS sin espacios)
export async function guardarCategoria(cat: CategoriaLiga): Promise<void> {
    const id = normalizarCategoria(cat.id).replace(/\s+/g, '_');
    await setDoc(doc(db, COL_CATEGORIAS, id), {
        label:  cat.label || id,
        orden:  cat.orden ?? 999,
        activa: cat.activa !== false,
    }, { merge: true });
}

// Solo borra el documento de la categoría (NO sus datos: equipos,
// calendario, etc.). El borrado en cascada de datos lo hace
// ResetTemporada por separado.
export async function borrarCategoriaDoc(id: string): Promise<void> {
    await deleteDoc(doc(db, COL_CATEGORIAS, normalizarCategoria(id)));
}

// Sube la semilla por defecto a Firestore (para el primer uso: convierte
// las 5 categorías fijas en documentos editables).
export async function sembrarCategoriasSiVacio(): Promise<boolean> {
    const snap = await getDocs(collection(db, COL_CATEGORIAS));
    if (!snap.empty) return false; // ya hay categorías, no tocar
    for (const c of CATEGORIAS_DEFAULT) {
        await guardarCategoria(c);
    }
    return true;
}
