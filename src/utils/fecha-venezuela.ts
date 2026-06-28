const TZ_VENEZUELA = 'America/Caracas';
/** Mediodía Caracas en UTC: 12:00 Caracas = 16:00 UTC (UTC-4) */
const NOON_CARACAS_UTC_HOUR = 16;

function parseYMD(s: string): { y: number; m: number; d: number } | null {
  const parts = s.split('-');
  if (parts.length < 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  return { y, m, d };
}

/**
 * Convierte un valor de fecha a un Date que representa esa fecha calendario en Venezuela (America/Caracas).
 * Así, al guardar en BD (UTC) y mostrar en Venezuela, la fecha no se desfasa un día.
 * @param value fecha del request (string YYYY-MM-DD, Date, o null/undefined para "hoy")
 * @returns Date en UTC que corresponde a mediodía de ese día en Caracas
 */
export function toFechaEmisionVenezuela(value: string | Date | null | undefined): Date {
  if (value == null || value === '') {
    const now = new Date();
    const s = now.toLocaleDateString('en-CA', { timeZone: TZ_VENEZUELA });
    const parsed = parseYMD(s);
    if (!parsed) return new Date();
    const y: number = parsed.y;
    const m: number = parsed.m;
    const day: number = parsed.d;
    return new Date(Date.UTC(y, m - 1, day, NOON_CARACAS_UTC_HOUR, 0, 0, 0));
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const datePart = value.split('T')[0] ?? value;
    const parsed = parseYMD(datePart);
    if (!parsed) return new Date(value);
    const y: number = parsed.y;
    const m: number = parsed.m;
    const day: number = parsed.d;
    return new Date(Date.UTC(y, m - 1, day, NOON_CARACAS_UTC_HOUR, 0, 0, 0));
  }
  const d = new Date(value);
  const s = d.toLocaleDateString('en-CA', { timeZone: TZ_VENEZUELA });
  const parsed = parseYMD(s);
  if (!parsed) return d;
  const y: number = parsed.y;
  const m: number = parsed.m;
  const day: number = parsed.d;
  return new Date(Date.UTC(y, m - 1, day, NOON_CARACAS_UTC_HOUR, 0, 0, 0));
}
