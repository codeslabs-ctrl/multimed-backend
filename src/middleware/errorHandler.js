import { Request, Response, NextFunction } from 'express';
import { AppError, ApiResponse } from '../types/index.js';

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Error:', err);

  // Default error
  let error: { message: string; status: number } = {
    message: err.message || 'Internal Server Error',
    status: err.status || 500
  };

  // Supabase errors
  if (err.code && err.code.startsWith('PGRST')) {
    error.message = 'Database error occurred';
    error.status = 400;
  }

  // Validation errors
  if (err.isJoi) {
    error.message = err.details[0].message;
    error.status = 400;
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    error.message = error.status === 500 ? 'Internal Server Error' : error.message;
  }

  const response: ApiResponse = {
    success: false,
    error: {
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  };

  res.status(error.status).json(response);
};

export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const error = new Error(`Not Found - ${req.originalUrl}`) as AppError;
  error.status = 404;
  next(error);
};
