import { Router } from 'express';
import type { HealthResponse, ServerStatus } from '../types/response.js';
import { sessionManager } from '../session/manager.js';
import { getRequestCount } from './chat.js';

const router = Router();

const startTime = Date.now();

export function getStats() {
  return {
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    activeSessions: sessionManager.getActiveSessionCount(),
    totalRequests: getRequestCount(),
  };
}

router.get('/health', (_req, res) => {
  const response: HealthResponse = { status: 'ok' };
  res.json(response);
});

router.get('/status', (_req, res) => {
  const stats = getStats();
  const response: ServerStatus = {
    status: 'running',
    uptimeSeconds: stats.uptimeSeconds,
    activeSessions: stats.activeSessions,
    totalRequests: stats.totalRequests,
    version: '1.0.0',
  };
  res.json(response);
});

export { router as healthRouter };
