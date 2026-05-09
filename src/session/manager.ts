import * as fs from 'fs';
import * as path from 'path';
import type { Session, SessionFileData, SessionIndex } from '../types/session.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

const CLEANUP_INTERVAL_MS = 60 * 1000;
const SESSION_TIMEOUT_MS = config.SESSION_TIMEOUT * 1000;
const MAX_SESSIONS = 500;

const SESSIONS_DIR = path.join(config.WORKSPACE_DIR, 'sessions');

export interface CreateSessionOptions {
  sessionId: string;
  cwd: string;
  firstPrompt: string;
}

export function ensureSessionCwd(sessionId: string): string {
  const dir = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private indexPath: string;
  private writeLock: Promise<void> = Promise.resolve();

  constructor() {
    this.indexPath = path.join(config.WORKSPACE_DIR, 'sessions-index.json');
    this.loadFromFile();
    this.startCleanupScheduler();
  }

  private startCleanupScheduler(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions();
    }, CLEANUP_INTERVAL_MS);
  }

  stopCleanupScheduler(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private loadFromFile(): void {
    try {
      if (fs.existsSync(this.indexPath)) {
        const data = fs.readFileSync(this.indexPath, 'utf-8');
        const index: SessionIndex = JSON.parse(data);

        for (const [sessionId, fileData] of Object.entries(index.sessions)) {
          const session: Session = {
            ...fileData,
            created_at: new Date(fileData.created_at),
            last_activity_at: new Date(fileData.last_activity_at),
          };
          this.sessions.set(sessionId, session);
        }

        logger.info('Sessions loaded from file', { count: this.sessions.size });
      }
    } catch (error) {
      logger.error('Failed to load sessions from file', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private saveToFile(): void {
    this.writeLock = this.writeLock.then(() => this.doSaveToFile()).catch(() => {});
  }

  private doSaveToFile(): void {
    try {
      const sessionsData: Record<string, SessionFileData> = {};

      for (const [sessionId, session] of this.sessions.entries()) {
        sessionsData[sessionId] = {
          session_id: session.session_id,
          cwd: session.cwd,
          first_prompt: session.first_prompt,
          created_at: session.created_at.toISOString(),
          last_activity_at: session.last_activity_at.toISOString(),
          status: session.status,
        };
      }

      const index: SessionIndex = {
        version: 1,
        sessions: sessionsData,
      };

      const dir = path.dirname(this.indexPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tempPath = `${this.indexPath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(index, null, 2));
      fs.renameSync(tempPath, this.indexPath);

      logger.debug('Sessions saved to file', { count: this.sessions.size });
    } catch (error) {
      logger.error('Failed to save sessions to file', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private removeOldestSession(): void {
    let oldest: Session | null = null;
    let oldestId: string | null = null;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (!oldest || session.last_activity_at < oldest.last_activity_at) {
        oldest = session;
        oldestId = sessionId;
      }
    }

    if (oldestId) {
      this.sessions.delete(oldestId);
      logger.info('Removed oldest session (LRU)', { session_id: oldestId });
    }
  }

  createSession(options: CreateSessionOptions): Session {
    const { sessionId, cwd, firstPrompt } = options;

    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.last_activity_at = new Date();
      this.saveToFile();
      return existing;
    }

    if (this.sessions.size >= MAX_SESSIONS) {
      this.removeOldestSession();
    }

    const now = new Date();
    const session: Session = {
      session_id: sessionId,
      cwd,
      first_prompt: firstPrompt.substring(0, 200),
      created_at: now,
      last_activity_at: now,
      status: 'active',
    };

    this.sessions.set(sessionId, session);
    this.saveToFile();
    logger.info('Session created', { session_id: sessionId, cwd });

    return session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): Session[] {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'active')
      .sort((a, b) => b.last_activity_at.getTime() - a.last_activity_at.getTime());
  }

  updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session && session.status === 'active') {
      session.last_activity_at = new Date();
      this.saveToFile();
    }
  }

  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'terminated';
      this.sessions.delete(sessionId);
      this.saveToFile();
      logger.info('Session terminated', { session_id: sessionId });
      return true;
    }
    return false;
  }

  getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active').length;
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    let expiredCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.status !== 'active') continue;

      const idleTime = now.getTime() - session.last_activity_at.getTime();
      if (idleTime > SESSION_TIMEOUT_MS) {
        session.status = 'expired';
        this.sessions.delete(sessionId);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      this.saveToFile();
      logger.info('Expired sessions cleaned up', { count: expiredCount });
    }
  }
}

export const sessionManager = new SessionManager();
export { SessionManager };
