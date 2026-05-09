import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(9001),
  AUTH_TOKEN: z.string().min(1, 'AUTH_TOKEN is required'),
  CLAUDE_CODE_OAUTH_TOKEN: z.string().min(1, 'CLAUDE_CODE_OAUTH_TOKEN is required'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  WORKSPACE_DIR: z.string().default('/tmp/claude-server-workspace'),
  CLAUDE_TIMEOUT_MS: z.coerce.number().default(1800000),
  CLAUDE_MODEL: z.enum(['sonnet', 'opus']).default('opus'),
  CLAUDE_MAX_TURNS: z.coerce.number().default(50),
  SESSION_TIMEOUT: z.coerce.number().default(1800),
  ALLOWED_TOOLS: z.string().optional(),
  DISABLED_TOOLS: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Environment validation failed:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
