/**
 * POST /chat — Main chat endpoint supporting three modes:
 *
 *  1. async: true   -> Return sessionId immediately, execute in background
 *  2. stream: false -> Consume the SSE stream internally, return JSON
 *  3. stream: true  -> SSE event stream (default)
 */

import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ChatRequestSchema } from '../types/request.js';
import type { ChatResponse } from '../types/response.js';
import { executeChat, executeChatSync, type ChatOptions } from '../services/chat-service.js';
import { BadRequestError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Simple request counter (standalone — no dependency on health.ts)
// ---------------------------------------------------------------------------

let totalRequests = 0;

export function incrementRequestCount(): void {
  totalRequests++;
}

export function getRequestCount(): number {
  return totalRequests;
}

// ---------------------------------------------------------------------------
// Helper: build ChatOptions from validated request body
// ---------------------------------------------------------------------------

function buildChatOptions(body: ReturnType<typeof ChatRequestSchema.parse>): ChatOptions {
  return {
    prompt: body.prompt,
    sessionId: body.sessionId ?? undefined,
    systemPrompt: body.systemPrompt,
    systemPromptMode: body.systemPromptMode,
    model: body.model,
    maxTurns: body.maxTurns,
    allowedTools: body.allowedTools,
    disabledTools: body.disabledTools,
    agents: body.agents,
    outputFormat: body.outputFormat,
    effort: body.effort,
  };
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function writeSSE(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function setSSEHeaders(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Send SSE comment to establish connection and prevent premature close
  res.write(':ok\n\n');
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function chatHandler(req: Request, res: Response): Promise<void> {
  incrementRequestCount();
  const requestId = uuidv4();

  // --- Parse & validate --------------------------------------------------
  const parseResult = ChatRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    const messages = parseResult.error.issues
      .map((e) => `${e.path.map(String).join('.')}: ${e.message}`)
      .join('; ');
    throw new BadRequestError(messages);
  }

  const body = parseResult.data;
  const chatOptions = buildChatOptions(body);

  // --- AbortController: kills the SDK CLI subprocess on client disconnect --
  const abortController = new AbortController();
  chatOptions.abortController = abortController;

  // Detect client disconnection via the underlying TCP socket.
  // res.on('close') only fires after response headers are sent (useless for sync mode).
  // req.socket.on('close') fires when the TCP connection actually terminates.
  let clientDisconnected = false;
  const onDisconnect = () => {
    if (!clientDisconnected) {
      clientDisconnected = true;
      abortController.abort();
      logger.info('Client disconnected, SDK process aborted', { requestId });
    }
  };
  req.socket.once('close', onDisconnect);
  res.once('close', onDisconnect);

  logger.info('Chat request received', {
    requestId,
    mode: body.async ? 'async' : body.stream ? 'stream' : 'sync',
    sessionId: body.sessionId ?? 'new',
  });

  // -----------------------------------------------------------------------
  // Mode 1: async — fire-and-forget, return sessionId immediately
  // -----------------------------------------------------------------------
  if (body.async) {
    const sessionId = chatOptions.sessionId ?? uuidv4();
    chatOptions.sessionId = sessionId;

    // Fire the streaming execution in the background (no await)
    // Async mode does NOT abort on client disconnect — work continues in background.
    // Remove the abortController so the background task runs to completion.
    chatOptions.abortController = undefined;

    void (async () => {
      try {
        // Consume the entire generator so side-effects (session creation, etc.) happen
        for await (const _event of executeChat(chatOptions)) {
          // intentionally consuming without forwarding
        }
        logger.info('Async chat completed', { requestId, sessionId });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'unknown error';
        logger.error('Async chat failed', { requestId, sessionId, error: errMsg });
      }
    })();

    const asyncResponse: ChatResponse = {
      requestId,
      sessionId,
      content: '',
      status: 'started',
      processingTimeMs: 0,
    };

    res.status(202).json(asyncResponse);
    return;
  }

  // -----------------------------------------------------------------------
  // Mode 2: sync JSON — consume stream, return single JSON response
  // -----------------------------------------------------------------------
  if (!body.stream) {
    const result = await executeChatSync(chatOptions);

    // Client may have disconnected while we were waiting
    if (clientDisconnected) return;

    const jsonResponse: ChatResponse = {
      requestId,
      sessionId: result.sessionId,
      content: result.content,
      status: result.status,
      processingTimeMs: result.processingTimeMs,
    };

    res.status(result.status === 'success' ? 200 : 500).json(jsonResponse);
    return;
  }

  // -----------------------------------------------------------------------
  // Mode 3: SSE streaming (default)
  // -----------------------------------------------------------------------
  setSSEHeaders(res);

  try {
    for await (const event of executeChat(chatOptions)) {
      if (clientDisconnected) {
        logger.info('Aborting SSE stream — client gone', { requestId });
        break;
      }

      switch (event.type) {
        case 'system':
          writeSSE(res, 'system', { sessionId: event.sessionId });
          break;

        case 'text_delta':
          writeSSE(res, 'text_delta', { text: event.text });
          break;

        case 'tool_use':
          writeSSE(res, 'tool_use', { name: event.name, input: event.input });
          break;

        case 'tool_result':
          writeSSE(res, 'tool_result', { content: event.content });
          break;

        case 'result':
          writeSSE(res, 'result', {
            requestId,
            sessionId: event.sessionId,
            content: event.content,
            status: event.status,
            processingTimeMs: event.processingTimeMs,
          });
          break;

        case 'error':
          writeSSE(res, 'error', {
            requestId,
            sessionId: event.sessionId,
            message: event.message,
            status: event.status,
            processingTimeMs: event.processingTimeMs,
          });
          break;

        default:
          // future event types — forward as-is
          writeSSE(res, (event as { type: string }).type, event);
          break;
      }
    }
  } catch (err) {
    if (!clientDisconnected) {
      const errMsg = err instanceof Error ? err.message : 'Internal error';
      writeSSE(res, 'error', { requestId, message: errMsg, status: 'error' });
    }
  } finally {
    if (!clientDisconnected) {
      // Signal end of stream
      writeSSE(res, 'done', { requestId });
      res.end();
    }
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const chatRouter = Router();
chatRouter.post('/chat', chatHandler);
