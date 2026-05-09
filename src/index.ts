import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { errorHandler, authMiddleware, requestLogger } from './middleware/index.js';
import { healthRouter, sessionsRouter, chatRouter, openaiRouter } from './routes/index.js';
import { sessionManager } from './session/manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);

// OpenAPI spec & Swagger UI (public, before auth)
const openapiPath = path.resolve(__dirname, '../openapi.json');
if (fs.existsSync(openapiPath)) {
  const openapiSpec = JSON.parse(fs.readFileSync(openapiPath, 'utf-8'));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
  app.get('/openapi.json', (_req, res) => res.json(openapiSpec));
}

app.use(authMiddleware);

app.use(healthRouter);
app.use(sessionsRouter);
app.use(chatRouter);
app.use(openaiRouter);

app.use(errorHandler);

logger.setLevel(config.LOG_LEVEL);

const server = app.listen(config.PORT, () => {
  logger.info('Claude Code Server started', {
    port: config.PORT,
    workspace: config.WORKSPACE_DIR,
  });
});

function shutdown(signal: string) {
  logger.info('Shutdown signal received', { signal });

  server.close(() => {
    logger.info('HTTP server closed');
    sessionManager.stopCleanupScheduler();
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app };
