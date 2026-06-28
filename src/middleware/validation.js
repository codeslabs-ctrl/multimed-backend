import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { ValidationSchema, ApiResponse } from '../types/index.js';

export const validateRequest = (schema: ValidationSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req.body);
    if (error) {
      const response: ApiResponse = {
        success: false,
        error: {
          message: error.details[0].message,
          details: error.details
        }
      };
      res.status(400).json(response);
      return;
    }
    next();
  };
};

// Common validation schemas
export const schemas = {
  // Generic ID validation
  id: Joi.object({
    id: Joi.string().uuid().required()
  }),

  // Pagination validation
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sort: Joi.string().valid('asc', 'desc').default('desc'),
    orderBy: Joi.string().optional()
  }),

  // Search validation
  search: Joi.object({
    q: Joi.string().min(1).max(100).optional(),
    filters: Joi.object().optional()
  })
};
