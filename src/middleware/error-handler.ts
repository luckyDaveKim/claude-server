import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import type { ErrorResponse } from '../types/response.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public error: string,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, 'bad_request', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Invalid or missing authentication token') {
    super(401, 'unauthorized', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, 'not_found', message);
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    logger.warn('Application error', {
      statusCode: err.statusCode,
      error: err.error,
      message: err.message,
    });

    const response: ErrorResponse = {
      error: err.error,
      message: err.message,
    };

    res.status(err.statusCode).json(response);
    return;
  }

  logger.error('Unexpected error', {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });

  const response: ErrorResponse = {
    error: 'internal_error',
    message: 'An unexpected error occurred',
  };

  res.status(500).json(response);
}
