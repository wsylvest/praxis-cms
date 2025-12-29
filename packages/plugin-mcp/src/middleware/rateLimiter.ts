/**
 * MCP Rate Limiter
 *
 * Provides per-API-key rate limiting for MCP requests.
 * Uses in-memory storage with optional Redis support for distributed deployments.
 */

import type { Payload } from 'payload'

export interface RateLimitConfig {
  /**
   * Custom key generator function
   * @default Uses API key ID
   */
  keyGenerator?: (apiKeyId: string, userId: string) => string

  /**
   * Maximum requests per window per API key
   * @default 100
   */
  maxRequests: number

  /**
   * Maximum tokens per window per API key (optional)
   * Requires tracking token usage in responses
   */
  maxTokensPerWindow?: number

  /**
   * Handler called when rate limit is exceeded
   */
  onRateLimitExceeded?: (
    apiKeyId: string,
    userId: string,
    remaining: RateLimitResult,
  ) => Promise<void> | void

  /**
   * Skip rate limiting for these API key IDs
   */
  skipKeys?: string[]

  /**
   * Time window in milliseconds
   * @default 60000 (1 minute)
   */
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: Date
  retryAfter?: number
  tokensRemaining?: number
}

interface RateLimitEntry {
  requests: number
  tokens: number
  windowStart: number
}

/**
 * In-memory rate limit store
 * For production with multiple instances, use Redis
 */
class RateLimitStore {
  private cleanupInterval: NodeJS.Timeout | null = null
  private store: Map<string, RateLimitEntry> = new Map()

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000)
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      // Remove entries older than 2 hours
      if (now - entry.windowStart > 2 * 60 * 60 * 1000) {
        this.store.delete(key)
      }
    }
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key)
  }

  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry)
  }

  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}

// Global store instance
const rateLimitStore = new RateLimitStore()

/**
 * Create a rate limiter for MCP requests
 */
export function createRateLimiter(config: RateLimitConfig) {
  const {
    keyGenerator = (apiKeyId) => apiKeyId,
    maxRequests = 100,
    maxTokensPerWindow,
    onRateLimitExceeded,
    skipKeys = [],
    windowMs = 60000,
  } = config

  return {
    /**
     * Check if a request is allowed
     */
    async checkLimit(apiKeyId: string, userId: string): Promise<RateLimitResult> {
      // Skip rate limiting for whitelisted keys
      if (skipKeys.includes(apiKeyId)) {
        return {
          allowed: true,
          limit: maxRequests,
          remaining: maxRequests,
          resetAt: new Date(Date.now() + windowMs),
        }
      }

      const key = keyGenerator(apiKeyId, userId)
      const now = Date.now()
      let entry = rateLimitStore.get(key)

      // Initialize or reset window
      if (!entry || now - entry.windowStart >= windowMs) {
        entry = {
          requests: 0,
          tokens: 0,
          windowStart: now,
        }
      }

      const windowEnd = entry.windowStart + windowMs
      const remaining = maxRequests - entry.requests - 1
      const tokensRemaining = maxTokensPerWindow ? maxTokensPerWindow - entry.tokens : undefined

      // Check if limit exceeded
      if (entry.requests >= maxRequests) {
        const retryAfter = Math.ceil((windowEnd - now) / 1000)

        if (onRateLimitExceeded) {
          await onRateLimitExceeded(apiKeyId, userId, {
            allowed: false,
            limit: maxRequests,
            remaining: 0,
            resetAt: new Date(windowEnd),
            retryAfter,
            tokensRemaining,
          })
        }

        return {
          allowed: false,
          limit: maxRequests,
          remaining: 0,
          resetAt: new Date(windowEnd),
          retryAfter,
          tokensRemaining,
        }
      }

      // Check token limit if configured
      if (maxTokensPerWindow && entry.tokens >= maxTokensPerWindow) {
        const retryAfter = Math.ceil((windowEnd - now) / 1000)

        if (onRateLimitExceeded) {
          await onRateLimitExceeded(apiKeyId, userId, {
            allowed: false,
            limit: maxRequests,
            remaining,
            resetAt: new Date(windowEnd),
            retryAfter,
            tokensRemaining: 0,
          })
        }

        return {
          allowed: false,
          limit: maxRequests,
          remaining,
          resetAt: new Date(windowEnd),
          retryAfter,
          tokensRemaining: 0,
        }
      }

      // Increment counter
      entry.requests++
      rateLimitStore.set(key, entry)

      return {
        allowed: true,
        limit: maxRequests,
        remaining: Math.max(0, remaining),
        resetAt: new Date(windowEnd),
        tokensRemaining,
      }
    },

    /**
     * Record token usage for a request
     */
    recordTokens(apiKeyId: string, userId: string, tokens: number): void {
      if (!maxTokensPerWindow) {
        return
      }

      const key = keyGenerator(apiKeyId, userId)
      const entry = rateLimitStore.get(key)

      if (entry) {
        entry.tokens += tokens
        rateLimitStore.set(key, entry)
      }
    },

    /**
     * Get current usage for an API key
     */
    getUsage(
      apiKeyId: string,
      userId: string,
    ): {
      requests: number
      tokens: number
      windowStart: Date
    } | null {
      const key = keyGenerator(apiKeyId, userId)
      const entry = rateLimitStore.get(key)

      if (!entry) {
        return null
      }

      return {
        requests: entry.requests,
        tokens: entry.tokens,
        windowStart: new Date(entry.windowStart),
      }
    },

    /**
     * Reset limits for an API key
     */
    reset(apiKeyId: string, userId: string): void {
      const key = keyGenerator(apiKeyId, userId)
      rateLimitStore.delete(key)
    },

    /**
     * Shutdown the rate limiter (cleanup)
     */
    shutdown(): void {
      rateLimitStore.shutdown()
    },
  }
}

/**
 * Rate limit response headers
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': result.resetAt.toISOString(),
  }

  if (result.retryAfter) {
    headers['Retry-After'] = String(result.retryAfter)
  }

  if (result.tokensRemaining !== undefined) {
    headers['X-RateLimit-Tokens-Remaining'] = String(result.tokensRemaining)
  }

  return headers
}

/**
 * Create rate limit exceeded response
 */
export function createRateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      id: null,
      error: {
        code: -32000,
        data: {
          remaining: result.remaining,
          resetAt: result.resetAt.toISOString(),
          retryAfter: result.retryAfter,
        },
        message: `Rate limit exceeded. Try again in ${result.retryAfter} seconds.`,
      },
      jsonrpc: '2.0',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        ...getRateLimitHeaders(result),
      },
      status: 429,
    },
  )
}

export type RateLimiter = ReturnType<typeof createRateLimiter>
