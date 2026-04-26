/**
 * Database Adapter - Abstraction layer for PostgreSQL
 * 
 * This adapter provides a unified interface to work with PostgreSQL database.
 */

import { postgresPool } from '../config/database.js';

export interface QueryOptions {
  select?: string;
  filters?: Record<string, any>;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
}

export interface QueryResult<T = any> {
  data: T[];
  error?: Error | null;
  count?: number;
}

/**
 * Database Adapter - Unified interface for database operations
 */
export class DatabaseAdapter {
  /**
   * Query a table (PostgreSQL)
   */
  static async query<T = any>(
    tableName: string,
    options: QueryOptions = {}
  ): Promise<QueryResult<T>> {
    return this.queryPostgres<T>(tableName, options);
  }

  /**
   * Query a single record by ID
   */
  static async findById<T = any>(tableName: string, id: string | number, idColumn: string = 'id'): Promise<T | null> {
    return this.findByIdPostgres<T>(tableName, id, idColumn);
  }

  /**
   * Insert a record
   */
  static async insert<T = any>(tableName: string, data: Partial<T>): Promise<T> {
    return this.insertPostgres<T>(tableName, data);
  }

  /**
   * Update a record
   */
  static async update<T = any>(
    tableName: string,
    id: string | number,
    data: Partial<T>,
    idColumn: string = 'id'
  ): Promise<T> {
    return this.updatePostgres<T>(tableName, id, data, idColumn);
  }

  /**
   * Delete a record
   */
  static async delete(tableName: string, id: string | number, idColumn: string = 'id'): Promise<boolean> {
    return this.deletePostgres(tableName, id, idColumn);
  }

  /**
   * Execute a raw SQL query (PostgreSQL)
   */
  static async rawQuery<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(sql, params);
      return {
        data: result.rows as T[],
        error: null,
        count: result.rowCount || 0
      };
    } catch (error) {
      return {
        data: [] as T[],
        error: error as Error,
        count: 0
      };
    } finally {
      client.release();
    }
  }

  // PostgreSQL implementations
  private static async queryPostgres<T = any>(
    tableName: string,
    options: QueryOptions = {}
  ): Promise<QueryResult<T>> {
    const client = await postgresPool.connect();
    try {
      const { select = '*', filters = {}, orderBy, limit, offset = 0 } = options;

      let sql = `SELECT ${select} FROM ${tableName}`;
      const params: any[] = [];
      let paramIndex = 1;

      // Build WHERE clause
      const conditions: string[] = [];
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          if (Array.isArray(value)) {
            conditions.push(`${key} = ANY($${paramIndex})`);
            params.push(value);
            paramIndex++;
          } else {
            conditions.push(`${key} = $${paramIndex}`);
            params.push(value);
            paramIndex++;
          }
        }
      });

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }

      // Add ORDER BY
      if (orderBy) {
        sql += ` ORDER BY ${orderBy.column} ${orderBy.ascending !== false ? 'ASC' : 'DESC'}`;
      }

      // Add LIMIT and OFFSET
      if (limit) {
        sql += ` LIMIT $${paramIndex}`;
        params.push(limit);
        paramIndex++;
        if (offset > 0) {
          sql += ` OFFSET $${paramIndex}`;
          params.push(offset);
        }
      }

      const result = await client.query(sql, params);
      return {
        data: result.rows as T[],
        error: null,
        count: result.rowCount || 0
      };
    } catch (error) {
      return {
        data: [] as T[],
        error: error as Error,
        count: 0
      };
    } finally {
      client.release();
    }
  }

  private static async findByIdPostgres<T = any>(
    tableName: string,
    id: string | number,
    idColumn: string = 'id'
  ): Promise<T | null> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(`SELECT * FROM ${tableName} WHERE ${idColumn} = $1 LIMIT 1`, [id]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error(`Error finding by ID in ${tableName}:`, error);
      return null;
    } finally {
      client.release();
    }
  }

  private static async insertPostgres<T = any>(tableName: string, data: Partial<T>): Promise<T> {
    const client = await postgresPool.connect();
    try {
      const columns = Object.keys(data).join(', ');
      const placeholders = Object.keys(data).map((_, i) => `$${i + 1}`).join(', ');
      const values = Object.values(data);

      const sql = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders}) RETURNING *`;
      const result = await client.query(sql, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to insert into ${tableName}: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  private static async updatePostgres<T = any>(
    tableName: string,
    id: string | number,
    data: Partial<T>,
    idColumn: string = 'id'
  ): Promise<T> {
    const client = await postgresPool.connect();
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.entries(data).forEach(([key, value]) => {
        updates.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      });

      values.push(id);
      const sql = `UPDATE ${tableName} SET ${updates.join(', ')} WHERE ${idColumn} = $${paramIndex} RETURNING *`;
      const result = await client.query(sql, values);

      if (result.rows.length === 0) {
        throw new Error('Record not found');
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(`Failed to update ${tableName}: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  private static async deletePostgres(
    tableName: string,
    id: string | number,
    idColumn: string = 'id'
  ): Promise<boolean> {
    const client = await postgresPool.connect();
    try {
      const result = await client.query(`DELETE FROM ${tableName} WHERE ${idColumn} = $1`, [id]);
      return (result.rowCount || 0) > 0;
    } catch (error) {
      throw new Error(`Failed to delete from ${tableName}: ${(error as Error).message}`);
    } finally {
      client.release();
    }
  }

  /**
   * Get PostgreSQL pool (for raw queries)
   */
  static getPostgresPool() {
    return postgresPool;
  }
}
