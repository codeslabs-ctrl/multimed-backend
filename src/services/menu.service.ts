import { postgresPool } from '../config/database.js';

export interface MenuItem {
  id: number;
  nombre: string;
  icono: string | null;
  ruta: string | null;
  orden: number;
  activo: boolean;
  padre_id: number | null;
  tipo: 'encabezado' | 'opcion';
  es_visible: boolean;
  hijos?: MenuItem[];
}

export interface PerfilMenuAcceso {
  id: number;
  perfil_id: number;
  menu_item_id: number;
  puede_acceder: boolean;
  puede_crear: boolean;
  puede_editar: boolean;
  puede_eliminar: boolean;
  puede_finalizar: boolean;
  puede_completar: boolean;
  puede_ver_servicios: boolean;
}

export interface Perfil {
  id: number;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export class MenuService {
  /**
   * Obtiene todos los items del menú organizados en jerarquía
   */
  async getMenuItems(): Promise<MenuItem[]> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(`
        SELECT 
          id,
          nombre,
          icono,
          ruta,
          orden,
          activo,
          padre_id,
          tipo,
          es_visible
        FROM menu_items
        WHERE activo = true
        ORDER BY orden, id
      `);

      const items = result.rows as MenuItem[];
      
      // Organizar en jerarquía
      const itemsMap = new Map<number, MenuItem>();
      const rootItems: MenuItem[] = [];

      // Primero crear el mapa
      items.forEach(item => {
        itemsMap.set(item.id, { ...item, hijos: [] });
      });

      // Luego organizar la jerarquía
      items.forEach(item => {
        const menuItem = itemsMap.get(item.id)!;
        if (item.padre_id === null) {
          rootItems.push(menuItem);
        } else {
          const parent = itemsMap.get(item.padre_id);
          if (parent) {
            if (!parent.hijos) {
              parent.hijos = [];
            }
            parent.hijos.push(menuItem);
          }
        }
      });

      return rootItems;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene el menú filtrado por perfil
   */
  async getMenuByPerfil(perfilNombre: string): Promise<MenuItem[]> {
    const client = await postgresPool.connect();
    try {
      // Obtener el perfil
      const perfilResult = await client.query(
        'SELECT id FROM perfiles WHERE nombre = $1 AND activo = true',
        [perfilNombre]
      );

      if (perfilResult.rows.length === 0) {
        return [];
      }

      const perfilId = perfilResult.rows[0].id;
      console.log(`🔍 [MenuService] Obteniendo menú para perfil: ${perfilNombre} (ID: ${perfilId})`);

      // Obtener items del menú con permisos del perfil
      // Incluir:
      // 1. Items opción con puede_acceder = true
      // 2. Encabezados que tienen al menos un hijo accesible
      const result = await client.query(`
        WITH items_con_permisos AS (
          SELECT 
            mi.id,
            mi.nombre,
            mi.icono,
            mi.ruta,
            mi.orden,
            mi.activo,
            mi.padre_id,
            mi.tipo,
            mi.es_visible,
            COALESCE(pma.puede_acceder, false) as puede_acceder
          FROM menu_items mi
          LEFT JOIN perfiles_menu_acceso pma ON (
            mi.id = pma.menu_item_id 
            AND pma.perfil_id = $1
          )
          WHERE mi.activo = true
        ),
        encabezados_con_hijos_accesibles AS (
          SELECT DISTINCT e.id
          FROM items_con_permisos e
          INNER JOIN items_con_permisos h ON h.padre_id = e.id
          WHERE e.tipo = 'encabezado'
            AND h.puede_acceder = true
            AND h.tipo = 'opcion'
        )
        SELECT 
          icp.id,
          icp.nombre,
          icp.icono,
          icp.ruta,
          icp.orden,
          icp.activo,
          icp.padre_id,
          icp.tipo,
          icp.es_visible,
          CASE 
            WHEN icp.tipo = 'encabezado' AND echa.id IS NOT NULL THEN true
            ELSE icp.puede_acceder
          END as puede_acceder
        FROM items_con_permisos icp
        LEFT JOIN encabezados_con_hijos_accesibles echa ON icp.id = echa.id
        WHERE 
          (icp.tipo = 'opcion' AND icp.puede_acceder = true)
          OR 
          (icp.tipo = 'encabezado' AND echa.id IS NOT NULL)
        ORDER BY icp.orden, icp.id
      `, [perfilId]);

      const items = result.rows as (MenuItem & { puede_acceder: boolean })[];
      console.log(`📋 [MenuService] Items obtenidos de la BD: ${items.length}`);
      console.log(`📋 [MenuService] Items:`, items.map(i => ({ id: i.id, nombre: i.nombre, tipo: i.tipo, padre_id: i.padre_id, puede_acceder: i.puede_acceder })));
      
      // Filtrar solo items accesibles y organizar en jerarquía
      const accessibleItems = items.filter(item => {
        // Si es encabezado, debe tener al menos un hijo accesible
        if (item.tipo === 'encabezado') {
          return true; // Se filtrará después si no tiene hijos accesibles
        }
        return item.puede_acceder;
      });

      const itemsMap = new Map<number, MenuItem>();
      const rootItems: MenuItem[] = [];

      // Crear el mapa
      accessibleItems.forEach(item => {
        itemsMap.set(item.id, { 
          ...item, 
          hijos: [],
          puede_acceder: undefined 
        } as MenuItem);
      });

      // Organizar jerarquía
      accessibleItems.forEach(item => {
        const menuItem = itemsMap.get(item.id)!;
        if (item.padre_id === null) {
          rootItems.push(menuItem);
        } else {
          const parent = itemsMap.get(item.padre_id);
          if (parent) {
            if (!parent.hijos) {
              parent.hijos = [];
            }
            parent.hijos.push(menuItem);
          }
        }
      });

      // Filtrar encabezados sin hijos accesibles
      const filteredRootItems = rootItems.filter(item => {
        if (item.tipo === 'encabezado') {
          return item.hijos && item.hijos.length > 0;
        }
        return true;
      });

      console.log(`✅ [MenuService] Menú final organizado: ${filteredRootItems.length} items raíz`);
      console.log(`✅ [MenuService] Estructura:`, JSON.stringify(filteredRootItems.map(i => ({ 
        nombre: i.nombre, 
        tipo: i.tipo, 
        hijos: i.hijos?.map(h => h.nombre) || [] 
      })), null, 2));

      return filteredRootItems;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene todos los perfiles
   */
  async getPerfiles(): Promise<Perfil[]> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(`
        SELECT id, nombre, descripcion, activo
        FROM perfiles
        WHERE activo = true
        ORDER BY nombre
      `);

      return result.rows as Perfil[];
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene permisos de un perfil para todos los items del menú
   */
  async getPermisosByPerfil(perfilId: number): Promise<PerfilMenuAcceso[]> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(`
        SELECT 
          pma.id,
          pma.perfil_id,
          pma.menu_item_id,
          pma.puede_acceder,
          pma.puede_crear,
          pma.puede_editar,
          pma.puede_eliminar,
          pma.puede_finalizar,
          pma.puede_completar,
          pma.puede_ver_servicios
        FROM perfiles_menu_acceso pma
        WHERE pma.perfil_id = $1
        ORDER BY pma.menu_item_id
      `, [perfilId]);

      return result.rows as PerfilMenuAcceso[];
    } finally {
      client.release();
    }
  }

  /**
   * Actualiza permisos de un perfil para un item del menú
   */
  async updatePermisos(
    perfilId: number,
    menuItemId: number,
    permisos: Partial<Omit<PerfilMenuAcceso, 'id' | 'perfil_id' | 'menu_item_id'>>
  ): Promise<PerfilMenuAcceso> {
    const client = await postgresPool.connect();
    try {
      await client.query('BEGIN');

      // Verificar si existe el registro
      const existing = await client.query(
        'SELECT id FROM perfiles_menu_acceso WHERE perfil_id = $1 AND menu_item_id = $2',
        [perfilId, menuItemId]
      );

      let result;
      if (existing.rows.length > 0) {
        // Actualizar
        const setClauses: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        Object.keys(permisos).forEach(key => {
          if (permisos[key as keyof typeof permisos] !== undefined) {
            setClauses.push(`${key} = $${paramIndex}`);
            values.push(permisos[key as keyof typeof permisos]);
            paramIndex++;
          }
        });

        if (setClauses.length === 0) {
          await client.query('ROLLBACK');
          throw new Error('No hay campos para actualizar');
        }

        setClauses.push(`actualizado_en = CURRENT_TIMESTAMP`);
        values.push(perfilId, menuItemId);

        result = await client.query(`
          UPDATE perfiles_menu_acceso
          SET ${setClauses.join(', ')}
          WHERE perfil_id = $${paramIndex} AND menu_item_id = $${paramIndex + 1}
          RETURNING *
        `, values);
      } else {
        // Insertar
        result = await client.query(`
          INSERT INTO perfiles_menu_acceso (
            perfil_id,
            menu_item_id,
            puede_acceder,
            puede_crear,
            puede_editar,
            puede_eliminar,
            puede_finalizar,
            puede_completar,
            puede_ver_servicios
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `, [
          perfilId,
          menuItemId,
          permisos.puede_acceder ?? false,
          permisos.puede_crear ?? false,
          permisos.puede_editar ?? false,
          permisos.puede_eliminar ?? false,
          permisos.puede_finalizar ?? false,
          permisos.puede_completar ?? false,
          permisos.puede_ver_servicios ?? false
        ]);
      }

      await client.query('COMMIT');
      return result.rows[0] as PerfilMenuAcceso;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Actualiza múltiples permisos de un perfil
   */
  async updatePermisosBulk(
    perfilId: number,
    permisos: Array<{
      menu_item_id: number;
      puede_acceder?: boolean;
      puede_crear?: boolean;
      puede_editar?: boolean;
      puede_eliminar?: boolean;
      puede_finalizar?: boolean;
      puede_completar?: boolean;
      puede_ver_servicios?: boolean;
    }>
  ): Promise<void> {
    const client = await postgresPool.connect();
    try {
      await client.query('BEGIN');

      for (const permiso of permisos) {
        const existing = await client.query(
          'SELECT id FROM perfiles_menu_acceso WHERE perfil_id = $1 AND menu_item_id = $2',
          [perfilId, permiso.menu_item_id]
        );

        if (existing.rows.length > 0) {
          // Actualizar
          await client.query(`
            UPDATE perfiles_menu_acceso
            SET 
              puede_acceder = COALESCE($3, puede_acceder),
              puede_crear = COALESCE($4, puede_crear),
              puede_editar = COALESCE($5, puede_editar),
              puede_eliminar = COALESCE($6, puede_eliminar),
              puede_finalizar = COALESCE($7, puede_finalizar),
              puede_completar = COALESCE($8, puede_completar),
              puede_ver_servicios = COALESCE($9, puede_ver_servicios),
              actualizado_en = CURRENT_TIMESTAMP
            WHERE perfil_id = $1 AND menu_item_id = $2
          `, [
            perfilId,
            permiso.menu_item_id,
            permiso.puede_acceder,
            permiso.puede_crear,
            permiso.puede_editar,
            permiso.puede_eliminar,
            permiso.puede_finalizar,
            permiso.puede_completar,
            permiso.puede_ver_servicios
          ]);
        } else {
          // Insertar
          await client.query(`
            INSERT INTO perfiles_menu_acceso (
              perfil_id,
              menu_item_id,
              puede_acceder,
              puede_crear,
              puede_editar,
              puede_eliminar,
              puede_finalizar,
              puede_completar,
              puede_ver_servicios
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            perfilId,
            permiso.menu_item_id,
            permiso.puede_acceder ?? false,
            permiso.puede_crear ?? false,
            permiso.puede_editar ?? false,
            permiso.puede_eliminar ?? false,
            permiso.puede_finalizar ?? false,
            permiso.puede_completar ?? false,
            permiso.puede_ver_servicios ?? false
          ]);
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Indica si el perfil tiene permiso para finalizar consultas (puede_finalizar en Gestión de Consultas).
   * perfilNombre debe coincidir con perfiles.nombre (ej: 'medico', 'administrador', 'secretaria').
   */
  async puedeFinalizarConsulta(perfilNombre: string): Promise<boolean> {
    if (!perfilNombre) return false;
    const client = await postgresPool.connect();
    try {
      const result = await client.query(`
        SELECT pma.puede_finalizar
        FROM perfiles p
        INNER JOIN perfiles_menu_acceso pma ON pma.perfil_id = p.id
        INNER JOIN menu_items mi ON mi.id = pma.menu_item_id
        WHERE p.nombre = $1
          AND p.activo = true
          AND (mi.nombre ILIKE '%Consultas%' OR mi.ruta ILIKE '%consultas%')
        LIMIT 1
      `, [perfilNombre]);
      return result.rows.length > 0 && result.rows[0].puede_finalizar === true;
    } finally {
      client.release();
    }
  }
}

export default new MenuService();

