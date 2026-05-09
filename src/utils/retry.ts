import { logger } from './logger.js';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * 지수 백오프로 재시도
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxRetries) {
        break;
      }

      if (opts.shouldRetry && !opts.shouldRetry(error)) {
        break;
      }

      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt),
        opts.maxDelayMs,
      );

      logger.warn('Retry attempt', {
        attempt: attempt + 1,
        maxRetries: opts.maxRetries,
        delayMs: delay,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
