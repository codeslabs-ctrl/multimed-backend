import { postgresPool } from '../config/database.js';
import { getCurrentClinica } from '../middleware/clinica.middleware';

export interface Clinica {
  id: number;
  alias: string;
  nombre_clinica: string;
  descripcion?: string;
  activa: boolean;
  fecha_creacion: string;
  fecha_actualizacion: string;
  /** Ruta o URL del logo (navbar); opcional */
  logo_path?: string | null;
}

export interface MedicoClinica {
  id: number;
  medico_id: number;
  clinica_alias: string;
  activo: boolean;
  fecha_asignacion: string;
}

export interface EspecialidadClinica {
  id: number;
  especialidad_id: number;
  clinica_alias: string;
  activa: boolean;
  fecha_asignacion: string;
}

export class ClinicaService {
  /**
   * Obtener información de la clínica actual
   */
  async getCurrentClinicaInfo(): Promise<Clinica | null> {
    try {
      const clinicaAlias = getCurrentClinica();
      
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'SELECT * FROM clinicas WHERE alias = $1 AND activa = true LIMIT 1',
          [clinicaAlias]
        );

        if (result.rows.length === 0) {
          return null;
        }

        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en getCurrentClinicaInfo:', error);
      return null;
    }
  }

  /**
   * Obtener médicos asignados a la clínica actual
   */
  async getMedicosByClinica(): Promise<any[]> {
    try {
      const clinicaAlias = getCurrentClinica();
      
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `SELECT 
            mc.*,
            m.id as medico_id,
            m.nombres,
            m.apellidos,
            m.email,
            m.telefono,
            m.especialidad_id
          FROM medicos_clinicas mc
          INNER JOIN medicos m ON mc.medico_id = m.id
          WHERE mc.clinica_alias = $1 AND mc.activo = true`,
          [clinicaAlias]
        );

        // Formatear para compatibilidad con el código existente
        return result.rows.map(row => ({
          ...row,
          medicos: {
            id: row.medico_id,
            nombres: row.nombres,
            apellidos: row.apellidos,
            email: row.email,
            telefono: row.telefono,
            especialidad_id: row.especialidad_id
          }
        }));
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en getMedicosByClinica:', error);
      return [];
    }
  }

  /**
   * Obtener especialidades disponibles en la clínica actual
   */
  async getEspecialidadesByClinica(): Promise<any[]> {
    try {
      const clinicaAlias = getCurrentClinica();
      
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          `SELECT 
            ec.*,
            e.id as especialidad_id,
            e.nombre_especialidad,
            e.descripcion
          FROM especialidades_clinicas ec
          INNER JOIN especialidades e ON ec.especialidad_id = e.id
          WHERE ec.clinica_alias = $1 AND ec.activa = true`,
          [clinicaAlias]
        );

        // Formatear para compatibilidad con el código existente
        return result.rows.map(row => ({
          ...row,
          especialidades: {
            id: row.especialidad_id,
            nombre_especialidad: row.nombre_especialidad,
            descripcion: row.descripcion
          }
        }));
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en getEspecialidadesByClinica:', error);
      return [];
    }
  }

  /**
   * Verificar que un médico pertenece a la clínica actual
   */
  async verifyMedicoClinica(medicoId: number): Promise<boolean> {
    try {
      const clinicaAlias = getCurrentClinica();
      
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'SELECT id FROM medicos_clinicas WHERE medico_id = $1 AND clinica_alias = $2 AND activo = true LIMIT 1',
          [medicoId, clinicaAlias]
        );

        return result.rows.length > 0;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en verifyMedicoClinica:', error);
      return false;
    }
  }

  /**
   * Verificar que una especialidad está disponible en la clínica actual
   */
  async verifyEspecialidadClinica(especialidadId: number): Promise<boolean> {
    try {
      const clinicaAlias = getCurrentClinica();
      
      const client = await postgresPool.connect();
      try {
        const result = await client.query(
          'SELECT id FROM especialidades_clinicas WHERE especialidad_id = $1 AND clinica_alias = $2 AND activo = true LIMIT 1',
          [especialidadId, clinicaAlias]
        );

        return result.rows.length > 0;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en verifyEspecialidadClinica:', error);
      return false;
    }
  }

  /**
   * Asignar médico a la clínica actual
   */
  async asignarMedicoClinica(medicoId: number): Promise<boolean> {
    try {
      const clinicaAlias = getCurrentClinica();
      
      const client = await postgresPool.connect();
      try {
        await client.query(
          'INSERT INTO medicos_clinicas (medico_id, clinica_alias, activo) VALUES ($1, $2, true)',
          [medicoId, clinicaAlias]
        );

        return true;
      } catch (error) {
        console.error('Error asignando médico a clínica:', error);
        return false;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en asignarMedicoClinica:', error);
      return false;
    }
  }

  /**
   * Asignar especialidad a la clínica actual
   */
  async asignarEspecialidadClinica(especialidadId: number): Promise<boolean> {
    try {
      const clinicaAlias = getCurrentClinica();
      
      const client = await postgresPool.connect();
      try {
        await client.query(
          'INSERT INTO especialidades_clinicas (especialidad_id, clinica_alias, activa) VALUES ($1, $2, true)',
          [especialidadId, clinicaAlias]
        );

        return true;
      } catch (error) {
        console.error('Error asignando especialidad a clínica:', error);
        return false;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en asignarEspecialidadClinica:', error);
      return false;
    }
  }

  /**
   * Crear filtro automático por clínica para cualquier tabla
   */
  createClinicaFilter() {
    const clinicaAlias = getCurrentClinica();
    return {
      clinica_alias: clinicaAlias
    };
  }

  /** Listado para formularios MultiMed (plataforma ve todas las activas). */
  async listClinicasActivas(): Promise<Clinica[]> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `SELECT id, alias, nombre_clinica, descripcion, activa, fecha_creacion, fecha_actualizacion, logo_path
         FROM clinicas WHERE activa = true ORDER BY nombre_clinica ASC`
      );
      return result.rows as Clinica[];
    } finally {
      client.release();
    }
  }

  async getClinicaById(id: number): Promise<Clinica | null> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(
        `SELECT id, alias, nombre_clinica, descripcion, activa, fecha_creacion, fecha_actualizacion, logo_path
         FROM clinicas WHERE id = $1 AND activa = true LIMIT 1`,
        [id]
      );
      return (result.rows[0] as Clinica) || null;
    } finally {
      client.release();
    }
  }

  /**
   * Marca para navbar / sesión: prioriza `clinica_id` del usuario; si no, primera clínica activa del médico en `medicos_clinicas`.
   */
  /** Primera clínica activa vinculada al médico (orden `medicos_clinicas.id`). */
  async getDefaultClinicaIdForMedico(medicoId: number): Promise<number | null> {
    const client = await postgresPool.connect();
    try {
      const r = await client.query(
        `SELECT c.id
         FROM medicos_clinicas mc
         INNER JOIN clinicas c ON c.alias = mc.clinica_alias AND c.activa = true
         WHERE mc.medico_id = $1 AND mc.activo = true
         ORDER BY mc.id ASC
         LIMIT 1`,
        [medicoId]
      );
      return r.rows.length ? (r.rows[0].id as number) : null;
    } finally {
      client.release();
    }
  }

  /** El médico tiene vínculo activo con esa clínica. */
  async medicoPerteneceAClinica(medicoId: number, clinicaId: number): Promise<boolean> {
    const client = await postgresPool.connect();
    try {
      const r = await client.query(
        `SELECT 1
         FROM medicos_clinicas mc
         INNER JOIN clinicas c ON c.alias = mc.clinica_alias AND c.id = $2 AND c.activa = true
         WHERE mc.medico_id = $1 AND mc.activo = true
         LIMIT 1`,
        [medicoId, clinicaId]
      );
      return r.rows.length > 0;
    } finally {
      client.release();
    }
  }

  /**
   * Clínicas entre las que el usuario puede operar: médico → `medicos_clinicas`;
   * admin/secretaría con `usuarios.clinica_id` → una sola.
   */
  async getClinicasForUsuario(u: {
    medico_id?: number | null;
    clinica_id?: number | null;
  }): Promise<Clinica[]> {
    const client = await postgresPool.connect();
    try {
      if (u.medico_id != null && u.medico_id > 0) {
        const r = await client.query(
          `SELECT DISTINCT ON (c.id) c.id, c.alias, c.nombre_clinica, c.descripcion, c.activa,
                  c.fecha_creacion, c.fecha_actualizacion, c.logo_path
           FROM medicos_clinicas mc
           INNER JOIN clinicas c ON c.alias = mc.clinica_alias AND c.activa = true
           WHERE mc.medico_id = $1 AND mc.activo = true
           ORDER BY c.id, c.nombre_clinica ASC`,
          [u.medico_id]
        );
        return r.rows as Clinica[];
      }
      if (u.clinica_id != null && u.clinica_id > 0) {
        const one = await this.getClinicaById(u.clinica_id);
        return one ? [one] : [];
      }
      return [];
    } finally {
      client.release();
    }
  }

  async getClinicaBrandingForSession(
    clinicaId: number | null | undefined,
    medicoId: number | null | undefined
  ): Promise<{ id: number; alias: string; nombre_clinica: string; logo_path: string | null } | null> {
    const client = await postgresPool.connect();
    try {
      if (clinicaId != null && clinicaId > 0) {
        const r = await client.query(
          `SELECT id, alias, nombre_clinica, logo_path FROM clinicas WHERE id = $1 AND activa = true LIMIT 1`,
          [clinicaId]
        );
        if (r.rows.length) return r.rows[0] as { id: number; alias: string; nombre_clinica: string; logo_path: string | null };
      }
      if (medicoId != null && medicoId > 0) {
        const r = await client.query(
          `SELECT c.id, c.alias, c.nombre_clinica, c.logo_path
           FROM medicos_clinicas mc
           INNER JOIN clinicas c ON c.alias = mc.clinica_alias AND c.activa = true
           WHERE mc.medico_id = $1 AND mc.activo = true
           ORDER BY mc.id ASC
           LIMIT 1`,
          [medicoId]
        );
        if (r.rows.length) return r.rows[0] as { id: number; alias: string; nombre_clinica: string; logo_path: string | null };
      }
      return null;
    } finally {
      client.release();
    }
  }
}
