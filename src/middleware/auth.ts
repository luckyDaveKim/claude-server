import type { Request, Response, NextFunction } from 'express';
import { validateToken, extractBearerToken } from '../services/auth.js';
import { UnauthorizedError } from './error-handler.js';

const PUBLIC_PATHS = ['/health'];

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (PUBLIC_PATHS.includes(req.path)) {
    next();
    return;
  }

  const token = extractBearerToken(req.headers.authorization);

  if (!validateToken(token)) {
    next(new UnauthorizedError());
    return;
  }

  next();
}
