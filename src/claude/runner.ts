import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Options,
  AgentDefinition as SDKAgentDefinition,
  SDKMessage,
  SDKAssistantMessage,
  SDKResultSuccess,
  SDKResultError,
  SDKSystemMessage,
  CanUseTool,
} from '@anthropic-ai/claude-agent-sdk';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// System Prompt Building
// ---------------------------------------------------------------------------

function getServerBasePromptPath(): string {
  return path.resolve(__dirname, '../../prompts/server-base.md');
}

export function buildSystemPrompt(options: {
  clientPrompt?: string;
  mode?: 'append' | 'replace';
}): string {
  const parts: string[] = [];

  if (options.mode === 'replace' && options.clientPrompt) {
    parts.push(options.clientPrompt);
    return parts.join('\n\n---\n\n');
  }

  // Append mode (default): server base + client
  const basePath = getServerBasePromptPath();
  if (fs.existsSync(basePath)) {
    parts.push(fs.readFileSync(basePath, 'utf-8'));
  }

  if (options.clientPrompt) {
    parts.push(options.clientPrompt);
  }

  return parts.join('\n\n---\n\n');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentDefinition {
  description: string;
  prompt: string;
  tools?: string[];
  disallowedTools?: string[];
  model?: 'sonnet' | 'opus' | 'haiku' | 'inherit';
  maxTurns?: number;
}

export interface RunnerOptions {
  prompt: string;
  cwd: string;
  sessionId?: string;
  isResume?: boolean;
  model?: string;
  maxTurns?: number;
  systemPrompt?: string;
  systemPromptMode?: 'append' | 'replace';
  canUseTool?: (args: { tool_name: string; input: unknown }) => Promise<{ allowed: boolean; reason?: string }>;
  disabledTools?: string[];
  agents?: Record<string, AgentDefinition>;
  outputFormat?: { type: 'json_schema'; schema: object };
  effort?: 'low' | 'medium' | 'high' | 'max';
  timeoutMs?: number;
  abortController?: AbortController;
}

export type SSEEvent =
  | { type: 'system'; sessionId: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use'; name: string; input: unknown }
  | { type: 'tool_result'; content: string }
  | { type: 'result'; content: string; sessionId: string; status: 'success' | 'error' | 'timeout'; processingTimeMs: number }
  | { type: 'error'; message: string; sessionId: string; status: 'error' | 'timeout'; processingTimeMs: number };

// ---------------------------------------------------------------------------
// canUseTool adapter
// ---------------------------------------------------------------------------

function adaptCanUseTool(
  fn: NonNullable<RunnerOptions['canUseTool']>,
): CanUseTool {
  return async (toolName, input, _opts) => {
    const result = await fn({ tool_name: toolName, input });
    if (result.allowed) {
      return { behavior: 'allow' as const };
    }
    return { behavior: 'deny' as const, message: result.reason || 'Denied by policy' };
  };
}

// ---------------------------------------------------------------------------
// Agent definition adapter
// ---------------------------------------------------------------------------

function adaptAgents(
  agents: Record<string, AgentDefinition>,
): Record<string, SDKAgentDefinition> {
  const result: Record<string, SDKAgentDefinition> = {};
  for (const [name, def] of Object.entries(agents)) {
    result[name] = {
      description: def.description,
      prompt: def.prompt,
      ...(def.tools && { tools: def.tools }),
      ...(def.disallowedTools && { disallowedTools: def.disallowedTools }),
      ...(def.model && { model: def.model }),
      ...(def.maxTurns && { maxTurns: def.maxTurns }),
    } as SDKAgentDefinition;
  }
  return result;
}

// ---------------------------------------------------------------------------
// runClaude AsyncGenerator
// ---------------------------------------------------------------------------

export async function* runClaude(options: RunnerOptions): AsyncGenerator<SSEEvent> {
  const startTime = Date.now();
  delete process.env.CLAUDECODE;

  const systemPrompt = buildSystemPrompt({
    clientPrompt: options.systemPrompt,
    mode: options.systemPromptMode,
  });

  const queryOptions: Options = {
    cwd: options.cwd,
    model: options.model || config.CLAUDE_MODEL,
    maxTurns: options.maxTurns || config.CLAUDE_MAX_TURNS,
    systemPrompt,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    includePartialMessages: true,
    settingSources: ['user', 'project', 'local'],
    stderr: (data: string) => logger.debug('SDK stderr', { data: data.trim() }),
  };

  if (options.canUseTool) {
    queryOptions.canUseTool = adaptCanUseTool(options.canUseTool);
  }

  if (options.agents && Object.keys(options.agents).length > 0) {
    queryOptions.agents = adaptAgents(options.agents);
  }

  if (options.outputFormat) {
    queryOptions.outputFormat = options.outputFormat as Options['outputFormat'];
  }

  if (options.effort) {
    queryOptions.effort = options.effort;
  }

  if (options.isResume && options.sessionId) {
    queryOptions.resume = options.sessionId;
  } else if (options.sessionId) {
    queryOptions.sessionId = options.sessionId;
  }

  // PreToolUse hook: disabled tools 차단 (bypassPermissions에서도 동작)
  if (options.disabledTools && options.disabledTools.length > 0) {
    const disabledSet = new Set(options.disabledTools);
    (queryOptions as Record<string, unknown>).hooks = {
      PreToolUse: [{
        hooks: [(input: Record<string, unknown>) => {
          const toolName = input.tool_name as string;
          if (disabledSet.has(toolName)) {
            return {
              decision: 'block',
              reason: `Tool ${toolName} is disabled by server policy`,
            };
          }
          return {};
        }],
      }],
    };
  }

  if (options.abortController) {
    queryOptions.abortController = options.abortController;
  }

  let sessionId = options.sessionId || '';
  let resultText = '';
  let resultStatus: 'success' | 'error' = 'success';

  try {
    const messages = query({ prompt: options.prompt, options: queryOptions });

    for await (const message of messages) {
      const msg = message as SDKMessage;

      if (msg.type === 'system' && 'subtype' in msg && msg.subtype === 'init') {
        const sysMsg = msg as SDKSystemMessage;
        sessionId = sysMsg.session_id;
        yield { type: 'system', sessionId };
      }

      if (msg.type === 'assistant') {
        const assistantMsg = msg as SDKAssistantMessage;
        const content = assistantMsg.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text') {
              yield { type: 'text_delta', text: block.text };
            }
            if (block.type === 'tool_use') {
              yield { type: 'tool_use', name: block.name, input: block.input };
            }
          }
        }
      }

      if (msg.type === 'result') {
        const resultMsg = msg as SDKResultSuccess | SDKResultError;
        sessionId = resultMsg.session_id || sessionId;
        if (resultMsg.subtype === 'success') {
          resultText = (resultMsg as SDKResultSuccess).result || '';
        } else {
          const errorResult = resultMsg as SDKResultError;
          resultText = errorResult.errors?.join('\n') || '';
          resultStatus = 'error';
        }
      }
    }

    yield {
      type: 'result',
      content: resultText,
      sessionId,
      status: resultStatus,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const isTimeout = elapsed >= (options.timeoutMs || config.CLAUDE_TIMEOUT_MS);
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('SDK query failed', { error: errMsg, elapsed, sessionId });
    yield {
      type: 'error',
      message: errMsg,
      sessionId,
      status: isTimeout ? 'timeout' : 'error',
      processingTimeMs: elapsed,
    };
  }
}
