import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

function maskSensitiveHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...headers };
  if (masked.authorization) {
    masked.authorization = 'Bearer ***';
  }
  return masked;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;

    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status_code: res.statusCode,
      duration_ms: duration,
      headers: maskSensitiveHeaders(req.headers as Record<string, unknown>),
    });
  });

  next();
}
