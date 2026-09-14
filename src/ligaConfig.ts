// ─────────────────────────────────────────────────────────────
// src/ligaConfig.ts
// ÚNICA FUENTE DE VERDAD para:
//   1. Quiénes son administradores
//   2. Cómo se llaman las colecciones de cada categoría
//
// Antes esto estaba duplicado a mano en 8+ archivos con lógicas
// ligeramente distintas. Si hay que cambiar un admin o agregar
// una categoría, se toca AQUÍ y en ningún otro lado.
//
// ⚠️ Si agregas o quitas un admin, hay que reflejarlo también en:
//      - firestore.rules      (función isAdmin)
//      - storage.rules        (función isAdmin)
//      - functions/src/index.ts (ADMIN_EMAILS)
//    Son archivos que corren en el servidor y no pueden importar
//    este módulo.
// ─────────────────────────────────────────────────────────────

export const ADMIN_EMAILS = [
    'adminlibasan@gmail.com',
    'yolfren1985@gmail.com',
];

export const esAdminPorEmail = (email?: string | null): boolean =>
    !!email && ADMIN_EMAILS.includes(email.toLowerCase().trim());

// ─────────────────────────────────────────────────────────────
// NOMBRES DE COLECCIONES POR CATEGORÍA
//
// Convención: `<base>_<CATEGORIA>`  →  equipos_U16M, calendario_LIBRE
// Excepción histórica: MASTER40 fue la categoría original y sus
// colecciones NO tienen sufijo (equipos, jugadores, calendario).
// Esa excepción vive únicamente aquí.
// ─────────────────────────────────────────────────────────────

const CATEGORIA_SIN_SUFIJO = 'MASTER40';

export const normalizarCategoria = (cat: string): string => {
    const c = (cat || '').trim().toUpperCase();
    // 'MASTER' es un alias suelto que aparecía en varios archivos
    return c === 'MASTER' ? CATEGORIA_SIN_SUFIJO : c;
};

export const getColName = (base: string, categoria: string): string => {
    const cat = normalizarCategoria(categoria);
    return cat === CATEGORIA_SIN_SUFIJO ? base : `${base}_${cat}`;
};

// Carpeta de Storage para los logos de una categoría
export const getLogosFolder = (categoria: string): string =>
    `logos_${normalizarCategoria(categoria)}`;

// ─────────────────────────────────────────────────────────────
// CATEGORÍAS
// Lista provisional. Cuando se implemente la colección
// `categorias` en Firestore, esta constante se reemplaza por
// una lectura — el resto del código ya no la conoce directamente.
// ─────────────────────────────────────────────────────────────

export interface CategoriaLiga {
    id: string;
    label: string;
}

export const CATEGORIAS: CategoriaLiga[] = [
    { id: 'INTERINDUSTRIAL', label: '🏭 INTERINDUSTRIAL' },
    { id: 'U16_FEMENINO',    label: '👧 U16 FEMENINO'    },
    { id: 'U16M',            label: '👦 U16 MASCULINO'   },
    { id: 'LIBRE',           label: '🏀 LIGA FLORES'     },
    { id: 'MASTER40',        label: '🍷 MASTER 40'       },
];

export const CATEGORIA_IDS = CATEGORIAS.map(c => c.id);
