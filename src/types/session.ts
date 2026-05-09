export type SessionStatus = 'active' | 'expired' | 'terminated';

export interface Session {
  session_id: string;
  cwd: string;
  first_prompt: string;
  created_at: Date;
  last_activity_at: Date;
  status: SessionStatus;
}

export interface SessionFileData {
  session_id: string;
  cwd: string;
  first_prompt: string;
  created_at: string;
  last_activity_at: string;
  status: SessionStatus;
}

export interface SessionIndex {
  version: number;
  sessions: Record<string, SessionFileData>;
}
