import { postgresPool } from '../config/database.js';

type PreferenceKey = string;

let ensured = false;
async function ensureUserPreferencesTable(): Promise<void> {
  if (ensured) return;
  ensured = true;

  await postgresPool.query(`
    CREATE TABLE IF NOT EXISTS public.parametros_usuario (
      usuario_id INT4 NOT NULL,
      clave VARCHAR(100) NOT NULL,
      valor JSONB NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT now(),
      PRIMARY KEY (usuario_id, clave)
    );
  `);
}

export class UserPreferencesService {
  async getPreferences(userId: number): Promise<Record<string, any>> {
    await ensureUserPreferencesTable();

    const result = await postgresPool.query(
      `SELECT clave, valor
       FROM parametros_usuario
       WHERE usuario_id = $1`,
      [userId]
    );

    const prefs: Record<string, any> = {};
    for (const row of result.rows) {
      const key = String(row.clave);
      const value = row.valor;

      if (key === 'pagina_principal' && value && typeof value === 'object' && typeof value.route === 'string') {
        prefs[key] = value.route;
      } else {
        prefs[key] = value;
      }
    }

    return prefs;
  }

  async setPreference(userId: number, key: PreferenceKey, value: any): Promise<{ key: string; value: any }> {
    await ensureUserPreferencesTable();

    const normalizedKey = String(key).trim();
    if (!normalizedKey) throw new Error('La clave es requerida');
    if (normalizedKey.length > 100) throw new Error('La clave es demasiado larga');

    let valueToStore: any = value;
    let valueToReturn: any = value;

    if (normalizedKey === 'pagina_principal') {
      const route = typeof value === 'string' ? value : value?.route;
      if (typeof route !== 'string' || route.trim().length === 0) {
        throw new Error('pagina_principal debe ser un string con la ruta');
      }
      const trimmed = route.trim();
      if (!trimmed.startsWith('/')) {
        throw new Error('pagina_principal debe iniciar con "/"');
      }
      valueToStore = { route: trimmed };
      valueToReturn = trimmed;
    }

    await postgresPool.query(
      `INSERT INTO parametros_usuario (usuario_id, clave, valor, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (usuario_id, clave)
       DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()`,
      [userId, normalizedKey, JSON.stringify(valueToStore)]
    );

    return { key: normalizedKey, value: valueToReturn };
  }
}


