import { Router } from 'express';
import { sessionManager } from '../session/manager.js';
import { NotFoundError } from '../middleware/error-handler.js';

const router = Router();

router.get('/sessions', (_req, res) => {
  const sessions = sessionManager.getAllSessions();

  res.json({
    sessions: sessions.map(session => ({
      session_id: session.session_id,
      status: session.status,
      first_prompt: session.first_prompt,
      last_activity_at: session.last_activity_at.toISOString(),
    })),
    total: sessions.length,
  });
});

router.get('/sessions/:session_id', (req, res, next) => {
  const { session_id } = req.params;
  const session = sessionManager.getSession(session_id);

  if (!session) {
    return next(new NotFoundError(`Session ${session_id} not found`));
  }

  res.json({
    session_id: session.session_id,
    cwd: session.cwd,
    first_prompt: session.first_prompt,
    status: session.status,
    created_at: session.created_at.toISOString(),
    last_activity_at: session.last_activity_at.toISOString(),
  });
});

router.delete('/sessions/:session_id', (req, res, next) => {
  const { session_id } = req.params;
  const deleted = sessionManager.deleteSession(session_id);

  if (!deleted) {
    return next(new NotFoundError(`Session ${session_id} not found`));
  }

  res.status(204).send();
});

export { router as sessionsRouter };
