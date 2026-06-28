import express, { Request, Response } from 'express';
import { postgresPool } from '../config/database.js';
// import { validateRequest, schemas } from '../middleware/validation.js';
import { 
  PaginationQuery, 
  SearchQuery, 
  CustomQueryRequest,
  DatabaseInfo,
  ApiResponse,
  PaginationInfo
} from '../types/index.js';

const router = express.Router();

// Generic CRUD operations for any table
const createGenericRoutes = (tableName: string) => {
  const routes = express.Router();

  // Get all records with pagination and filtering
  routes.get('/', async (req: Request<{}, ApiResponse, {}, PaginationQuery & SearchQuery>, res: Response<ApiResponse>) => {
    const client = await postgresPool.connect();
    try {
      const { page = 1, limit = 10, sort = 'desc', orderBy, q, filters } = req.query;
      const offset = (page - 1) * limit;

      // Build WHERE clause
      const whereConditions: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      // Apply search
      if (q) {
        whereConditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
        queryParams.push(`%${q}%`);
        paramIndex++;
      }

      // Apply filters
      if (filters) {
        try {
          const filterObj = JSON.parse(filters as unknown as string);
          Object.entries(filterObj).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
              whereConditions.push(`${key} = $${paramIndex}`);
              queryParams.push(value);
              paramIndex++;
            }
          });
        } catch (error) {
          const response: ApiResponse = {
            success: false,
            error: { message: 'Invalid filters format' }
          };
          res.status(400).json(response);
          return;
        }
      }

      // Build WHERE clause
      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      // Build ORDER BY clause
      const orderByColumn = orderBy || 'created_at';
      const orderDirection = sort === 'asc' ? 'ASC' : 'DESC';
      const orderClause = `ORDER BY ${orderByColumn} ${orderDirection}`;

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM ${tableName} ${whereClause}`;
      const countResult = await client.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);

      // Get paginated data
      const dataQuery = `SELECT * FROM ${tableName} ${whereClause} ${orderClause} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(Number(limit), offset);
      const dataResult = await client.query(dataQuery, queryParams);

      const pagination: PaginationInfo = {
        page: Number(page),
        limit: Number(limit),
        total: total,
        pages: Math.ceil(total / Number(limit))
      };

      const response: ApiResponse = {
        success: true,
        data: dataResult.rows,
        pagination
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: 'Internal server error' }
      };
      res.status(500).json(response);
    } finally {
      client.release();
    }
  });

  // Get single record by ID
  routes.get('/:id', async (req: Request<{ id: string }>, res: Response<ApiResponse>) => {
    const client = await postgresPool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        `SELECT * FROM ${tableName} WHERE id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Record not found' }
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: result.rows[0]
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: 'Internal server error' }
      };
      res.status(500).json(response);
    } finally {
      client.release();
    }
  });

  // Create new record
  routes.post('/', async (req: Request<{}, ApiResponse, any>, res: Response<ApiResponse>) => {
    const client = await postgresPool.connect();
    try {
      const columns = Object.keys(req.body);
      const values = Object.values(req.body);
      const placeholders = values.map((_, index) => `$${index + 1}`).join(', ');

      const result = await client.query(
        `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        values
      );

      const response: ApiResponse = {
        success: true,
        data: {
          message: 'Record created successfully',
          ...result.rows[0]
        }
      };
      res.status(201).json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: 'Internal server error' }
      };
      res.status(500).json(response);
    } finally {
      client.release();
    }
  });

  // Update record
  routes.put('/:id', async (req: Request<{ id: string }, ApiResponse, any>, res: Response<ApiResponse>) => {
    const client = await postgresPool.connect();
    try {
      const { id } = req.params;
      const columns = Object.keys(req.body);
      const values = Object.values(req.body);
      const setClause = columns.map((col, index) => `${col} = $${index + 1}`).join(', ');

      const result = await client.query(
        `UPDATE ${tableName} SET ${setClause} WHERE id = $${columns.length + 1} RETURNING *`,
        [...values, id]
      );

      if (result.rows.length === 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Record not found' }
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: {
          message: 'Record updated successfully',
          ...result.rows[0]
        }
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: 'Internal server error' }
      };
      res.status(500).json(response);
    } finally {
      client.release();
    }
  });

  // Delete record
  routes.delete('/:id', async (req: Request<{ id: string }>, res: Response<ApiResponse>) => {
    const client = await postgresPool.connect();
    try {
      const { id } = req.params;

      const result = await client.query(
        `DELETE FROM ${tableName} WHERE id = $1 RETURNING *`,
        [id]
      );

      if (result.rows.length === 0) {
        const response: ApiResponse = {
          success: false,
          error: { message: 'Record not found' }
        };
        res.status(404).json(response);
        return;
      }

      const response: ApiResponse = {
        success: true,
        data: {
          message: 'Record deleted successfully',
          ...result.rows[0]
        }
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse = {
        success: false,
        error: { message: 'Internal server error' }
      };
      res.status(500).json(response);
    } finally {
      client.release();
    }
  });

  return routes;
};

// Example: Users table routes
router.use('/users', createGenericRoutes('users'));

// Example: Products table routes
router.use('/products', createGenericRoutes('products'));

// Example: Orders table routes
router.use('/orders', createGenericRoutes('orders'));

// Custom endpoint for database info
router.get('/info', async (_req: Request, res: Response<ApiResponse<DatabaseInfo>>) => {
  const client = await postgresPool.connect();
  try {
    // Get list of tables (this requires appropriate permissions)
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );

    const response: ApiResponse<DatabaseInfo> = {
      success: true,
      data: {
        tables: result.rows.map((r: any) => r.table_name) || [],
        message: 'Database connection successful'
      }
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: { message: 'Internal server error' }
    };
    res.status(500).json(response);
  } finally {
    client.release();
  }
});

// Custom query endpoint
router.post('/query', async (req: Request<{}, ApiResponse, CustomQueryRequest>, res: Response<ApiResponse>) => {
  const client = await postgresPool.connect();
  try {
    const { table, select = '*', filters = {}, orderBy, limit = 100 } = req.body;

    if (!table) {
      const response: ApiResponse = {
        success: false,
        error: { message: 'Table name is required' }
      };
      res.status(400).json(response);
      return;
    }

    // Build WHERE clause
    const whereConditions: string[] = [];
    const queryParams: any[] = [];
    let paramIndex = 1;

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        whereConditions.push(`${key} = $${paramIndex}`);
        queryParams.push(value);
        paramIndex++;
      }
    });

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Build ORDER BY clause
    let orderClause = '';
    if (orderBy) {
      const direction = orderBy.ascending !== false ? 'ASC' : 'DESC';
      orderClause = `ORDER BY ${orderBy.column} ${direction}`;
    }

    // Build query
    const query = `SELECT ${select} FROM ${table} ${whereClause} ${orderClause} LIMIT $${paramIndex}`;
    queryParams.push(limit);

    const result = await client.query(query, queryParams);

    const response: ApiResponse = {
      success: true,
      data: result.rows
    };
    res.json(response);
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: { message: 'Internal server error' }
    };
    res.status(500).json(response);
  } finally {
    client.release();
  }
});

export default router;
