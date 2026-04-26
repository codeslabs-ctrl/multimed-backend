import { PostgresRepository } from './postgres.repository.js';

export interface UserData {
  id?: string;
  email: string;
  password?: string;
  user_metadata?: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    role?: string;
  };
  created_at?: string;
  updated_at?: string;
}

export class UserRepository extends PostgresRepository<UserData> {
  constructor() {
    super('users');
  }

  async findByEmail(email: string): Promise<UserData | null> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE email = $1 LIMIT 1`,
        [email]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      throw new Error(`Failed to find user by email: ${(error as Error).message}`);
    }
  }

  async findUsersByRole(role: string): Promise<UserData[]> {
    try {
      const result = await this.query(
        `SELECT * FROM ${this.tableName} WHERE user_metadata->>'role' = $1`,
        [role]
      );
      return result.rows;
    } catch (error) {
      throw new Error(`Failed to find users by role: ${(error as Error).message}`);
    }
  }

  async updateLastLogin(id: string): Promise<void> {
    try {
      await this.query(
        `UPDATE ${this.tableName} 
         SET updated_at = NOW(), 
             user_metadata = jsonb_set(COALESCE(user_metadata, '{}'::jsonb), '{last_login}', to_jsonb(NOW()::text))
         WHERE id = $1`,
        [id]
      );
    } catch (error) {
      throw new Error(`Failed to update last login: ${(error as Error).message}`);
    }
  }
}
