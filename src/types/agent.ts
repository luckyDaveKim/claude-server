import { z } from 'zod';

// AI Agent request format (LangChain ChatOpenAI)
export const AgentRequestSchema = z.object({
  input: z.array(
    z.object({
      type: z.string(),
      role: z.string(),
      content: z.string(),
    })
  ),
  model: z.string().optional(),
  stream: z.boolean().optional(),
  text: z.any().optional(),
  metadata: z
    .object({
      sessionId: z.string().optional(),
      async: z.boolean().optional().default(false),
      systemPrompt: z.string().optional(),
      systemPromptMode: z.enum(['append', 'replace']).default('append'),
      allowedTools: z.array(z.string()).optional(),
      disabledTools: z.array(z.string()).optional(),
      maxTurns: z.number().int().positive().optional(),
    })
    .optional(),
});

export type AgentRequest = z.infer<typeof AgentRequestSchema>;

// LangChain expects response with generations and output
export interface AgentResponse {
  generations: Array<{
    text: string;
    message: {
      type: string;
      role: string;
      content: Array<{ type: string; text: string }>;
    };
  }>;
  output?: Array<{
    type: string;
    role: string;
    content: Array<{ type: string; text: string }>;
  }>;
}
