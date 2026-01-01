import type { PayloadRequest } from 'payload'

import type { RateLimitConfig, RateLimitResult } from '../types/index.js'

interface RateLimitEntry {
  count: number
  tokens: number
  windowStart: number
}

/**
 * In-memory rate limiter with sliding window
 * For production, replace with Redis-based implementation
 */
export class RateLimiter {
  private cleanupInterval: NodeJS.Timeout | null = null
  private config: RateLimitConfig
  private store: Map<string, RateLimitEntry> = new Map()

  constructor(config: RateLimitConfig) {
    this.config = {
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
      maxRequests: config.maxRequests || 100,
      maxTokensPerWindow: config.maxTokensPerWindow || 100000,
      windowMs: config.windowMs || 60000, // 1 minute default
    }

    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000)
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now()

    for (const [key, entry] of this.store) {
      if (now - entry.windowStart >= this.config.windowMs) {
        this.store.delete(key)
      }
    }
  }

  private defaultKeyGenerator(req: PayloadRequest): string {
    // Use API key if present, otherwise user ID, otherwise IP
    const apiKey = req.headers.get('authorization')?.replace('Bearer ', '')
    if (apiKey) {
      return `api:${apiKey.slice(0, 16)}`
    }

    if (req.user?.id) {
      return `user:${req.user.id}`
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ||
      req.headers.get('x-real-ip') ||
      'unknown'
    return `ip:${ip}`
  }

  /**
   * Add tokens used after completion (for accurate token tracking)
   */
  addTokens(req: PayloadRequest, tokens: number): void {
    const key = this.config.keyGenerator!(req)
    const entry = this.store.get(key)

    if (entry) {
      entry.tokens += tokens
      this.store.set(key, entry)
    }
  }

  /**
   * Check if request is allowed and update counters
   */
  check(req: PayloadRequest, tokensUsed: number = 1): RateLimitResult {
    const key = this.config.keyGenerator!(req)
    const now = Date.now()

    let entry = this.store.get(key)

    // Reset if window has passed
    if (!entry || now - entry.windowStart >= this.config.windowMs) {
      entry = { count: 0, tokens: 0, windowStart: now }
    }

    // Check limits
    const requestsRemaining = this.config.maxRequests - entry.count
    const tokensRemaining = this.config.maxTokensPerWindow
      ? this.config.maxTokensPerWindow - entry.tokens
      : Infinity

    const allowed = requestsRemaining > 0 &&
      (tokensRemaining === Infinity || tokensRemaining >= tokensUsed)

    if (allowed) {
      // Update counters
      entry.count++
      entry.tokens += tokensUsed
      this.store.set(key, entry)
    }

    const resetAt = new Date(entry.windowStart + this.config.windowMs)
    const retryAfter = allowed ? undefined : Math.ceil((resetAt.getTime() - now) / 1000)

    return {
      allowed,
      remaining: Math.max(0, requestsRemaining - (allowed ? 1 : 0)),
      resetAt,
      retryAfter,
    }
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Get current usage for a request
   */
  getUsage(req: PayloadRequest): { requests: number; resetAt: Date; tokens: number } | null {
    const key = this.config.keyGenerator!(req)
    const entry = this.store.get(key)

    if (!entry) {return null}

    return {
      requests: entry.count,
      resetAt: new Date(entry.windowStart + this.config.windowMs),
      tokens: entry.tokens,
    }
  }

  /**
   * Reset limits for a key
   */
  reset(req: PayloadRequest): void {
    const key = this.config.keyGenerator!(req)
    this.store.delete(key)
  }
}

/**
 * Create rate limiter middleware
 */
export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  return new RateLimiter(config)
}

/**
 * Rate limit headers for responses
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.remaining + (result.allowed ? 1 : 0)),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': result.resetAt.toISOString(),
    ...(result.retryAfter ? { 'Retry-After': String(result.retryAfter) } : {}),
  }
}
