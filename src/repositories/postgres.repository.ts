import { Pool, PoolClient, QueryResult } from 'pg';
import { postgresPool } from '../config/database.js';
import { PaginationInfo } from '../types/index.js';

export interface BaseRepository<T = any> {
  findAll(filters?: Record<string, any>, pagination?: { page: number; limit: number }): Promise<{ data: T[]; pagination: PaginationInfo }>;
  findById(id: string | number): Promise<T | null>;
  create(data: Partial<T>): Promise<T>;
  update(id: string | number, data: Partial<T>): Promise<T>;
  delete(id: string | number): Promise<boolean>;
  search(query: string, fields: string[]): Promise<T[]>;
}

export class PostgresRepository<T = any> implements BaseRepository<T> {
  protected pool: Pool;
  protected tableName: string;
  protected idColumn: string;

  constructor(tableName: string, idColumn: string = 'id') {
    this.pool = postgresPool;
    this.tableName = tableName;
    this.idColumn = idColumn;
  }

  protected async getClient(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  protected buildWhereClause(filters: Record<string, any>): { clause: string; values: any[] } {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        if (Array.isArray(value)) {
          conditions.push(`${key} = ANY($${paramIndex})`);
          values.push(value);
          paramIndex++;
        } else if (typeof value === 'string' && value.includes('%')) {
          conditions.push(`${key} ILIKE $${paramIndex}`);
          values.push(value);
          paramIndex++;
        } else {
          conditions.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }
    });

    return {
      clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      values
    };
  }

  async findAll(
    filters: Record<string, any> = {},
    pagination: { page: number; limit: number } = { page: 1, limit: 10 }
  ): Promise<{ data: T[]; pagination: PaginationInfo }> {
    const client = await this.getClient();
    try {
      const { page, limit } = pagination;
      const offset = (page - 1) * limit;

      const { clause: whereClause, values: whereValues } = this.buildWhereClause(filters);

      // Count query
      const countQuery = `SELECT COUNT(*) as total FROM ${this.tableName} ${whereClause}`;
      const countResult = await client.query(countQuery, whereValues);
      const total = parseInt(countResult.rows[0].total);

      // Data query
      const dataQuery = `
        SELECT * FROM ${this.tableName} 
        ${whereClause}
        ORDER BY ${this.idColumn} DESC
        LIMIT $${whereValues.length + 1} OFFSET $${whereValues.length + 2}
      `;
      const dataResult = await client.query(dataQuery, [...whereValues, limit, offset]);

      const paginationInfo: PaginationInfo = {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      };

      return {
        data: dataResult.rows as T[],
        pagination: paginationInfo
      };
    } catch (error) {
      throw new Error(`Failed to fetch records: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  async findById(id: string | number): Promise<T | null> {
    const client = await this.getClient();
    try {
      const query = `SELECT * FROM ${this.tableName} WHERE ${this.idColumn} = $1 LIMIT 1`;
      const result = await client.query(query, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0] as T;
    } catch (error) {
      throw new Error(`Failed to fetch record: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  async create(data: Partial<T>): Promise<T> {
    const client = await this.getClient();
    try {
      const columns = Object.keys(data).filter(key => data[key as keyof T] !== undefined);
      const values = columns.map((_, index) => `$${index + 1}`);
      const dataValues = columns.map(col => data[col as keyof T]);

      const query = `
        INSERT INTO ${this.tableName} (${columns.join(', ')})
        VALUES (${values.join(', ')})
        RETURNING *
      `;

      const result = await client.query(query, dataValues);

      if (result.rows.length === 0) {
        throw new Error('Failed to create record');
      }

      return result.rows[0] as T;
    } catch (error) {
      const pg = error as { code?: string; constraint?: string; message?: string; detail?: string };
      const wrapped = new Error(`Failed to create record: ${pg.message || String(error)}`) as Error & {
        code?: string;
        constraint?: string;
        detail?: string;
      };
      if (pg.code != null) wrapped.code = pg.code;
      if (pg.constraint != null) wrapped.constraint = pg.constraint;
      if (pg.detail != null) wrapped.detail = pg.detail;
      throw wrapped;
    } finally {
      client.release();
    }
  }

  async update(id: string | number, data: Partial<T>): Promise<T> {
    const client = await this.getClient();
    try {
      const columns = Object.keys(data).filter(key => data[key as keyof T] !== undefined);
      const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(', ');
      const dataValues = columns.map(col => data[col as keyof T]);

      const query = `
        UPDATE ${this.tableName}
        SET ${setClause}, fecha_actualizacion = NOW()
        WHERE ${this.idColumn} = $${columns.length + 1}
        RETURNING *
      `;

      const result = await client.query(query, [...dataValues, id]);

      if (result.rows.length === 0) {
        throw new Error('Record not found');
      }

      return result.rows[0] as T;
    } catch (error) {
      const pg = error as { code?: string; constraint?: string; message?: string; detail?: string };
      const wrapped = new Error(`Failed to update record: ${pg.message || String(error)}`) as Error & {
        code?: string;
        constraint?: string;
        detail?: string;
      };
      if (pg.code != null) wrapped.code = pg.code;
      if (pg.constraint != null) wrapped.constraint = pg.constraint;
      if (pg.detail != null) wrapped.detail = pg.detail;
      throw wrapped;
    } finally {
      client.release();
    }
  }

  async delete(id: string | number): Promise<boolean> {
    const client = await this.getClient();
    try {
      const query = `DELETE FROM ${this.tableName} WHERE ${this.idColumn} = $1`;
      const result = await client.query(query, [id]);

      return result.rowCount !== null && result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to delete record: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  async search(query: string, fields: string[]): Promise<T[]> {
    const client = await this.getClient();
    try {
      const conditions = fields.map((field, index) => 
        `${field} ILIKE $${index + 1}`
      ).join(' OR ');
      
      const searchValue = `%${query}%`;
      const values = fields.map(() => searchValue);

      const sqlQuery = `
        SELECT * FROM ${this.tableName}
        WHERE ${conditions}
        ORDER BY ${this.idColumn} DESC
      `;

      const result = await client.query(sqlQuery, values);
      return result.rows as T[];
    } catch (error) {
      throw new Error(`Failed to search records: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  // Método helper para ejecutar queries personalizadas
  async query(sql: string, params: any[] = []): Promise<QueryResult> {
    const client = await this.getClient();
    try {
      return await client.query(sql, params);
    } finally {
      client.release();
    }
  }

  // Método helper para transacciones
  async transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

