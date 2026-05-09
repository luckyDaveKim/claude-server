import { config } from '../config.js';

export function validateToken(token: string | undefined): boolean {
  if (!token) return false;
  return token === config.AUTH_TOKEN;
}

export function extractBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  if (!authHeader.startsWith('Bearer ')) return undefined;
  return authHeader.slice(7);
}
