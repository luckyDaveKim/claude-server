/**
 * Chat Service — orchestration layer connecting routes to the SDK runner.
 */

import { v4 as uuidv4 } from 'uuid';
import { runClaude, type RunnerOptions, type SSEEvent, type AgentDefinition } from '../claude/runner.js';
import { sessionManager, ensureSessionCwd } from '../session/manager.js';
import { buildToolConfig } from '../tools/index.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

export interface ChatOptions {
  prompt: string;
  sessionId?: string | null;
  systemPrompt?: string;
  systemPromptMode?: 'append' | 'replace';
  model?: string;
  maxTurns?: number;
  allowedTools?: string[];
  disabledTools?: string[];
  agents?: Record<string, AgentDefinition>;
  outputFormat?: { type: 'json_schema'; schema: object };
  effort?: 'low' | 'medium' | 'high' | 'max';
  abortController?: AbortController;
}

export interface ChatResult {
  sessionId: string;
  content: string;
  status: 'success' | 'error' | 'timeout';
  processingTimeMs: number;
}

export type { SSEEvent, AgentDefinition };

export async function* executeChat(options: ChatOptions): AsyncGenerator<SSEEvent> {
  const {
    prompt,
    systemPrompt,
    systemPromptMode,
    model,
    maxTurns,
    allowedTools,
    disabledTools,
    agents,
    outputFormat,
    effort,
  } = options;

  let isResume = !!options.sessionId;
  const sessionId = options.sessionId ?? uuidv4();
  let existingSession;

  if (isResume) {
    existingSession = sessionManager.getSession(sessionId);
    if (!existingSession) {
      logger.warn('Session not found for resume, creating new session', { requestedSessionId: sessionId });
      isResume = false;
    }
  }

  logger.info('executeChat started', {
    sessionId,
    isResume,
    hasAgents: !!(agents && Object.keys(agents).length),
  });

  const cwd = isResume && existingSession
    ? existingSession.cwd
    : ensureSessionCwd(sessionId);

  sessionManager.createSession({
    sessionId,
    cwd,
    firstPrompt: prompt,
  });

  const toolConfig = buildToolConfig({ allowedTools, disabledTools });

  const runnerOptions: RunnerOptions = {
    prompt,
    cwd,
    sessionId,
    isResume,
    model,
    maxTurns,
    systemPrompt,
    systemPromptMode,
    canUseTool: toolConfig.canUseTool,
    disabledTools: toolConfig.permissionConfig.disabledTools,
    agents,
    outputFormat,
    effort,
    timeoutMs: config.CLAUDE_TIMEOUT_MS,
    abortController: options.abortController,
  };

  try {
    for await (const event of runClaude(runnerOptions)) {
      sessionManager.updateActivity(sessionId);
      yield event;
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown runner error';
    logger.error('runClaude threw unexpectedly', { sessionId, error: errMsg });
    yield {
      type: 'error',
      message: errMsg,
      sessionId,
      status: 'error',
      processingTimeMs: 0,
    };
  }
}

export async function executeChatSync(options: ChatOptions): Promise<ChatResult> {
  let sessionId = options.sessionId ?? '';
  let content = '';
  let status: ChatResult['status'] = 'success';
  let processingTimeMs = 0;

  for await (const event of executeChat(options)) {
    switch (event.type) {
      case 'system':
        sessionId = event.sessionId;
        break;
      case 'text_delta':
        content += event.text;
        break;
      case 'result':
        sessionId = event.sessionId;
        content = event.content;
        status = event.status;
        processingTimeMs = event.processingTimeMs;
        break;
      case 'error':
        sessionId = event.sessionId;
        content = event.message;
        status = event.status;
        processingTimeMs = event.processingTimeMs;
        break;
      default:
        break;
    }
  }

  return { sessionId, content, status, processingTimeMs };
}
