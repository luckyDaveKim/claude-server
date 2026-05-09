/**
 * OpenAI-compatible API routes.
 *
 * Endpoints:
 *  - GET  /v1/models             — list available models
 *  - POST /v1/chat/completions   — OpenAI Chat Completions (stream + non-stream)
 *  - POST /v1/responses          — LangChain / n8n Agent format
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';
import { ChatCompletionsRequestSchema } from '../types/openai.js';
import type { ChatCompletionsResponse } from '../types/openai.js';
import { AgentRequestSchema } from '../types/agent.js';
import type { AgentResponse } from '../types/agent.js';
import { executeChat, executeChatSync, type ChatOptions } from '../services/chat-service.js';
import { BadRequestError } from '../middleware/error-handler.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { incrementRequestCount } from './chat.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Namespace for generating consistent UUIDs from custom session IDs */
const SESSION_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function isValidUUID(str: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/** Convert custom session ID to UUID (consistent hashing) */
function normalizeSessionId(sessionId: string): string {
  if (isValidUUID(sessionId)) {
    return sessionId;
  }
  return uuidv5(sessionId, SESSION_NAMESPACE);
}

/** Generate an OpenAI-style request ID */
function makeChatcmplId(): string {
  return `chatcmpl-${uuidv4().replace(/-/g, '').substring(0, 29)}`;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = Router();

// -------------------------------------------------------------------------
// GET /v1/models
// -------------------------------------------------------------------------

const AVAILABLE_MODELS = ['sonnet', 'opus'] as const;

router.get('/v1/models', (_req: Request, res: Response) => {
  const now = Math.floor(Date.now() / 1000);
  res.json({
    object: 'list',
    data: AVAILABLE_MODELS.map((id) => ({
      id,
      object: 'model',
      created: now,
      owned_by: 'anthropic',
    })),
  });
});

// -------------------------------------------------------------------------
// POST /v1/responses — LangChain / n8n Agent endpoint
// -------------------------------------------------------------------------

router.post(
  '/v1/responses',
  async (req: Request, res: Response, next: NextFunction) => {
    incrementRequestCount();

    logger.info('AI Agent request received', {
      body: JSON.stringify(req.body),
      headers: req.headers,
    });

    const parseResult = AgentRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      logger.error('AI Agent request validation failed', {
        errors: parseResult.error.issues,
        body: req.body,
      });
      return next(new BadRequestError(parseResult.error.issues[0].message));
    }

    const { input, metadata } = parseResult.data;
    if (input.length === 0) {
      return next(new BadRequestError('Empty input array'));
    }

    // Extract the last user message as the prompt
    const lastMessage = input[input.length - 1];
    const prompt = lastMessage.content;

    // Normalize session ID to UUID if needed
    const sessionId = metadata?.sessionId
      ? normalizeSessionId(metadata.sessionId)
      : undefined;

    const chatOptions: ChatOptions = {
      prompt,
      sessionId,
      systemPrompt: metadata?.systemPrompt,
      systemPromptMode: metadata?.systemPromptMode,
      maxTurns: metadata?.maxTurns,
      allowedTools: metadata?.allowedTools,
      disabledTools: metadata?.disabledTools,
    };

    const isAsync = metadata?.async || false;

    try {
      let outputText: string;

      if (isAsync) {
        // Fire-and-forget: consume stream in background
        void (async () => {
          try {
            for await (const _event of executeChat(chatOptions)) {
              // intentionally consuming without forwarding
            }
            logger.info('Async agent task completed', { sessionId });
          } catch (error) {
            logger.error('Async agent task failed', {
              sessionId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        })();

        outputText = '작업이 백그라운드에서 시작되었습니다.\n\n완료 후 로그를 확인해주세요.';
      } else {
        const result = await executeChatSync(chatOptions);
        outputText = result.content;
      }

      const response: AgentResponse = {
        generations: [
          {
            text: outputText,
            message: {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: outputText }],
            },
          },
        ],
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: outputText }],
          },
        ],
      };

      res.json(response);
    } catch (error) {
      logger.error('AI Agent request failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      const errorBody: AgentResponse = {
        generations: [
          {
            text: errorMessage,
            message: {
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: errorMessage }],
            },
          },
        ],
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: errorMessage }],
          },
        ],
      };

      res.status(500).json(errorBody);
    }
  },
);

// -------------------------------------------------------------------------
// POST /v1/chat/completions — OpenAI Chat Completions compatible
// -------------------------------------------------------------------------

router.post(
  '/v1/chat/completions',
  async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    incrementRequestCount();

    const parseResult = ChatCompletionsRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return next(new BadRequestError(parseResult.error.issues[0].message));
    }

    const {
      model,
      messages,
      sessionId: requestSessionId,
      stream,
      systemPrompt,
      systemPromptMode,
      allowedTools,
      disabledTools,
      maxTurns,
    } = parseResult.data;

    // Extract the last user message as the prompt
    const lastUserMessage = [...messages]
      .reverse()
      .find((msg) => msg.role === 'user');
    if (!lastUserMessage) {
      return next(
        new BadRequestError('No user message found in messages array'),
      );
    }

    // Extract system messages and combine them with systemPrompt
    const systemMessages = messages
      .filter((msg) => msg.role === 'system')
      .map((msg) => msg.content);
    const combinedSystemPrompt =
      [...(systemPrompt ? [systemPrompt] : []), ...systemMessages].join(
        '\n\n',
      ) || undefined;

    const prompt = lastUserMessage.content;
    const requestId = makeChatcmplId();

    // Normalize session ID to UUID format
    const sessionId = requestSessionId
      ? normalizeSessionId(requestSessionId)
      : undefined;

    const chatOptions: ChatOptions = {
      prompt,
      model,
      sessionId,
      systemPrompt: combinedSystemPrompt,
      systemPromptMode,
      maxTurns,
      allowedTools,
      disabledTools,
    };

    // -----------------------------------------------------------------
    // Streaming mode — OpenAI SSE format
    // -----------------------------------------------------------------
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const created = Math.floor(startTime / 1000);

      let clientDisconnected = false;
      req.on('close', () => {
        clientDisconnected = true;
        logger.info('OpenAI SSE client disconnected', { requestId });
      });

      try {
        for await (const event of executeChat(chatOptions)) {
          if (clientDisconnected) {
            break;
          }

          if (event.type === 'text_delta') {
            const chunk = {
              id: requestId,
              object: 'chat.completion.chunk',
              created,
              model: config.CLAUDE_MODEL,
              choices: [
                {
                  index: 0,
                  delta: { content: event.text },
                  finish_reason: null,
                },
              ],
            };
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
          // Other event types (tool_use, tool_result, system) are
          // internal to the agent loop and are not surfaced in the
          // OpenAI streaming format.
        }
      } catch (err) {
        if (!clientDisconnected) {
          const errMsg =
            err instanceof Error ? err.message : 'Internal error';
          logger.error('OpenAI streaming error', {
            requestId,
            error: errMsg,
          });
        }
      } finally {
        if (!clientDisconnected) {
          // Send the final stop chunk
          const stopChunk = {
            id: requestId,
            object: 'chat.completion.chunk',
            created,
            model: config.CLAUDE_MODEL,
            choices: [
              {
                index: 0,
                delta: {},
                finish_reason: 'stop',
              },
            ],
          };
          res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }

      return;
    }

    // -----------------------------------------------------------------
    // Non-streaming mode — single JSON response
    // -----------------------------------------------------------------
    try {
      const result = await executeChatSync(chatOptions);

      const response: ChatCompletionsResponse = {
        id: requestId,
        object: 'chat.completion',
        created: Math.floor(startTime / 1000),
        model: config.CLAUDE_MODEL,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: result.content,
            },
            finish_reason: 'stop',
          },
        ],
        sessionId: result.sessionId,
      };

      res.json(response);
    } catch (error) {
      logger.error('Chat completions request failed', {
        request_id: requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      const errorContent =
        error instanceof Error ? error.message : 'Unknown error';
      const response: ChatCompletionsResponse = {
        id: requestId,
        object: 'chat.completion',
        created: Math.floor(startTime / 1000),
        model: config.CLAUDE_MODEL,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: errorContent,
            },
            finish_reason: 'error',
          },
        ],
        sessionId: sessionId,
      };

      res.status(500).json(response);
    }
  },
);

export { router as openaiRouter };
