import { z } from 'zod';

// OpenAI Chat Completions API compatible types
export const ChatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string(),
});

export const ChatCompletionsRequestSchema = z.object({
  model: z.string().optional().default('claude-sonnet-4'),
  messages: z.array(ChatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().positive().optional(),
  stream: z.boolean().optional().default(false),
  // Non-standard extensions
  sessionId: z.string().optional(),
  systemPrompt: z.string().optional(),
  systemPromptMode: z.enum(['append', 'replace']).default('append'),
  allowedTools: z.array(z.string()).optional(),
  disabledTools: z.array(z.string()).optional(),
  maxTurns: z.number().int().positive().optional(),
});

export type ChatCompletionsRequest = z.infer<typeof ChatCompletionsRequestSchema>;

export interface ChatCompletionsResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: 'stop' | 'length' | 'error';
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  sessionId?: string;
}
