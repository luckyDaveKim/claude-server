import { z } from 'zod';

const AgentDefinitionSchema = z.object({
  description: z.string(),
  prompt: z.string(),
  tools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  model: z.enum(['sonnet', 'opus', 'haiku', 'inherit']).optional(),
  maxTurns: z.number().int().positive().optional(),
});

const OutputFormatSchema = z.object({
  type: z.literal('json_schema'),
  schema: z.record(z.string(), z.unknown()),
});

export const ChatRequestSchema = z.object({
  prompt: z.string().min(1).max(102400),
  sessionId: z.string().uuid().nullish(),
  systemPrompt: z.string().optional(),
  systemPromptMode: z.enum(['append', 'replace']).default('append'),
  stream: z.boolean().optional().default(true),
  async: z.boolean().optional().default(false),
  allowedTools: z.array(z.string()).optional(),
  disabledTools: z.array(z.string()).optional(),
  maxTurns: z.number().int().positive().optional(),
  model: z.enum(['sonnet', 'opus']).optional(),
  agents: z.record(z.string(), AgentDefinitionSchema).optional(),
  outputFormat: OutputFormatSchema.optional(),
  effort: z.enum(['low', 'medium', 'high', 'max']).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
