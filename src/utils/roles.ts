/** Roles MultiMed: plataforma vs clínica (admins de una sola clínica). */

export const ROL_ADMIN_PLATAFORMA = 'administrador_plataforma';
export const ROL_ADMIN_CLINICA = 'administrador_clinica';
/** Compatibilidad: antes de migración SQL. */
export const ROL_ADMIN_LEGACY = 'administrador';

/**
 * Superadmin de plataforma (JWT + clinica_id): nombre nuevo o legado `administrador` **sin** clínica.
 * No confundir con `administrador` que tiene `clinica_id` (admin de esa clínica).
 */
export function isPlataformaAdminUser(
  user: { rol?: string | null; clinica_id?: number | null } | null | undefined
): boolean {
  if (!user?.rol) return false;
  const r = user.rol.trim();
  if (r === ROL_ADMIN_PLATAFORMA) return true;
  if (r === ROL_ADMIN_LEGACY && (user.clinica_id == null || user.clinica_id === undefined)) return true;
  return false;
}

/**
 * @deprecated Preferir `isPlataformaAdminUser` con el usuario completo. Solo string de rol (sin clinica_id).
 */
export function isAdminPlataforma(rol: string | undefined | null): boolean {
  const r = (rol || '').trim();
  return r === ROL_ADMIN_PLATAFORMA || r === ROL_ADMIN_LEGACY;
}

export function isAdminClinica(rol: string | undefined | null): boolean {
  return (rol || '').trim() === ROL_ADMIN_CLINICA;
}

/**
 * Admin de clínica en JWT: rol `administrador_clinica`, o legado `administrador` con `clinica_id` (no plataforma).
 */
export function isOperadorClinicaJwt(user: {
  rol?: string | null;
  clinica_id?: number | null;
} | null | undefined): boolean {
  if (!user?.rol) return false;
  const r = user.rol.trim();
  if (r === ROL_ADMIN_CLINICA) return true;
  if (r === ROL_ADMIN_LEGACY && user.clinica_id != null && user.clinica_id !== undefined) return true;
  return false;
}

/** Admin de clínica o secretaría: operación diaria (médicos, pacientes, consultas, etc.). */
export function isStaffOperativoClinica(rol: string | undefined | null): boolean {
  const r = (rol || '').trim();
  return r === ROL_ADMIN_CLINICA || r === 'secretaria';
}

/** Incluye finanzas para vistas/reportes que antes tenía "admin". */
export function isGestorOperativoClinicaAmplio(rol: string | undefined | null): boolean {
  const r = (rol || '').trim();
  return isStaffOperativoClinica(r) || r === 'finanzas';
}

/** Alta/edición de médicos: solo staff de clínica (no superadmin plataforma). */
export function puedeGestionarMedicos(rol: string | undefined | null): boolean {
  return isStaffOperativoClinica(rol);
}

/** @deprecated Usar isGestorOperativoClinicaAmplio o isStaffOperativoClinica según contexto */
export function isAnyAdministrador(rol: string | undefined | null): boolean {
  return isAdminPlataforma(rol) || isAdminClinica(rol);
}
