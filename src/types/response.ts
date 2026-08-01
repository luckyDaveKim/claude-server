export type ResponseStatus = 'success' | 'error' | 'timeout' | 'started';

export interface ChatResponse {
  requestId: string;
  sessionId: string;
  content: string;
  status: ResponseStatus;
  processingTimeMs: number;
  errorMessage?: string;
}

export type ServerStatusState = 'running' | 'stopping' | 'stopped';

export interface ServerStatus {
  status: ServerStatusState;
  uptimeSeconds: number;
  activeSessions: number;
  totalRequests: number;
  version: string;
}

export interface HealthResponse {
  status: 'ok';
}

export interface ErrorResponse {
  error: string;
  message: string;
}
