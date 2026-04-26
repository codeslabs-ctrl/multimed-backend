import { PaginationInfo } from '../types/index.js';
import { PostgresRepository } from './postgres.repository.js';

export interface BaseRepository<T = any> {
  findAll(filters?: Record<string, any>, pagination?: { page: number; limit: number }): Promise<{ data: T[]; pagination: PaginationInfo }>;
  findById(id: string): Promise<T | null>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
  search(query: string, fields: string[]): Promise<T[]>;
}

// Factory method para crear el repositorio apropiado
// Ahora siempre usa PostgreSQL
export function createRepository<T>(tableName: string, idColumn: string = 'id'): BaseRepository<T> {
  return new PostgresRepository<T>(tableName, idColumn);
}

// Clase obsoleta - mantenida solo para compatibilidad
// Ya no se usa Supabase
export class SupabaseRepository<T = any> implements BaseRepository<T> {
  protected tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
    console.warn('⚠️ SupabaseRepository está obsoleto. Use PostgresRepository en su lugar.');
  }

  async findAll(
    _filters: Record<string, any> = {},
    _pagination: { page: number; limit: number } = { page: 1, limit: 10 }
  ): Promise<{ data: T[]; pagination: PaginationInfo }> {
    throw new Error('SupabaseRepository is deprecated. Use PostgresRepository instead.');
  }

  async findById(_id: string): Promise<T | null> {
    throw new Error('SupabaseRepository is deprecated. Use PostgresRepository instead.');
  }

  async create(_data: Partial<T>): Promise<T> {
    throw new Error('SupabaseRepository is deprecated. Use PostgresRepository instead.');
  }

  async update(_id: string, _data: Partial<T>): Promise<T> {
    throw new Error('SupabaseRepository is deprecated. Use PostgresRepository instead.');
  }

  async delete(_id: string): Promise<boolean> {
    throw new Error('SupabaseRepository is deprecated. Use PostgresRepository instead.');
  }

  async search(_query: string, _fields: string[]): Promise<T[]> {
    throw new Error('SupabaseRepository is deprecated. Use PostgresRepository instead.');
  }
}
