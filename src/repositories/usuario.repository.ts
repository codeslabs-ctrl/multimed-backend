import { PostgresRepository } from './postgres.repository.js';

export interface UsuarioData {
  id?: number | string;
  username: string;
  email: string;
  password_hash: string;
  rol: string;
  medico_id?: number | null;
  /** MultiMed: clínica a la que está acotado (ej. admin de clínica). NULL = plataforma. */
  clinica_id?: number | null;
  activo: boolean;
  verificado?: boolean;
  first_login?: boolean;
  password_changed_at?: string | null;
  fecha_creacion?: string;
  fecha_actualizacion?: string;
}

// Clase para PostgreSQL
export class UsuarioRepository extends PostgresRepository<UsuarioData> {
  constructor() {
    super('usuarios', 'id');
  }

  async findByUsername(username: string): Promise<UsuarioData | null> {
    try {
      console.log('🔍 UsuarioRepositoryPostgres.findByUsername - Buscando username:', username);
      const query = `
        SELECT id, username, email, password_hash, rol, medico_id, clinica_id, activo, 
               verificado, first_login, password_changed_at, 
               fecha_creacion, fecha_actualizacion
        FROM usuarios
        WHERE username = $1 AND activo = true
        LIMIT 1
      `;
      console.log('🔍 Ejecutando query:', query);
      console.log('🔍 Parámetros:', [username]);
      const result = await this.query(query, [username]);
      console.log('🔍 Resultado de query:', result.rows.length, 'filas encontradas');
      if (result.rows.length > 0) {
        console.log('✅ Usuario encontrado:', result.rows[0].username, 'rol:', result.rows[0].rol);
      } else {
        console.log('❌ No se encontró usuario con username:', username);
      }
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error('❌ Error en UsuarioRepositoryPostgres.findByUsername:', error);
      throw new Error(`Failed to find user by username: ${(error as Error).message}`);
    }
  }
}

// Exportar el tipo para uso en TypeScript
export type UsuarioRepositoryType = typeof UsuarioRepository;

