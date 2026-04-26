/** Error típico del driver `pg` (propiedades opcionales). */
type PgErr = Error & { code?: string; constraint?: string; detail?: string };

function unwrapPgError(err: unknown): PgErr | null {
  if (err && typeof err === 'object') {
    const o = err as PgErr;
    if (o.code && typeof o.code === 'string') return o;
    const withCause = err as Error & { cause?: unknown };
    if (withCause.cause) return unwrapPgError(withCause.cause);
  }
  return null;
}

/**
 * Mensaje legible para errores de BD al crear/editar filas en antecedente_medico_tipo.
 * Devuelve undefined si no hay mapeo (dejar el mensaje genérico).
 */
export function friendlyAntecedenteMedicoTipoMessage(err: unknown): string | undefined {
  const pg = unwrapPgError(err);
  if (!pg?.code) return undefined;

  switch (pg.code) {
    case '23514':
      if (pg.constraint === 'antecedente_medico_tipo_tipo_check') {
        return (
          'El tipo de categoría no está permitido con la configuración actual de la base de datos. ' +
          'Elija exactamente una de las opciones del desplegable «Tipo». ' +
          'Si necesita una categoría nueva, primero debe añadirla al catálogo de categorías y ejecutar la migración que enlaza tipos con ese catálogo.'
        );
      }
      if (pg.constraint === 'antecedente_medico_tipo_requiere_detalle_check') {
        return 'La opción «Si el paciente marca Sí, pedir» no es válida. Elija una opción del desplegable.';
      }
      return undefined;
    case '23503':
      if (
        pg.constraint === 'antecedente_medico_tipo_tipo_fkey' ||
        (pg.message && pg.message.includes('antecedente_medico_tipo_tipo_fkey'))
      ) {
        return (
          'El tipo seleccionado no existe en el catálogo de categorías. ' +
          'Registre primero esa categoría (tabla de etiquetas de tipo) y vuelva a intentar.'
        );
      }
      return undefined;
    case '23505':
      if (
        pg.constraint === 'antecedente_medico_tipo_tipo_nombre_key' ||
        pg.constraint === 'uq_ant_mtipo_glob_tipo_nombre' ||
        pg.constraint === 'uq_ant_mtipo_med_tipo_nombre' ||
        (pg.message && /uq_ant_mtipo_/.test(pg.message))
      ) {
        return 'Ya existe un antecedente con ese nombre en la misma categoría (mismo ámbito). Use otro nombre o edite el existente.';
      }
      return undefined;
    default:
      return undefined;
  }
}

/** Código PostgreSQL para decidir código HTTP (409 = duplicado). */
export function postgresErrorCode(err: unknown): string | undefined {
  return unwrapPgError(err)?.code;
}
