export { createAuditLogger, InMemoryAuditLogger, PayloadAuditLogger } from './auditLogger.js'
export { createIPAllowlist, IPAllowlist, IPAllowlistPresets } from './ipAllowlist.js'
export { createRateLimiter, getRateLimitHeaders, RateLimiter } from './rateLimiter.js'

import type { Payload, PayloadRequest } from 'payload'

import type {
  AuditLogger,
  IPAllowlistConfig,
  PluginAIAdminConfig,
  RateLimitConfig,
  RateLimitResult,
} from '../types/index.js'
import { createAuditLogger } from './auditLogger.js'
import { createIPAllowlist, IPAllowlist } from './ipAllowlist.js'
import { createRateLimiter, RateLimiter } from './rateLimiter.js'

export interface SecurityContext {
  rateLimiter: RateLimiter
  ipAllowlist: IPAllowlist
  auditLogger: AuditLogger
}

export interface SecurityCheckResult {
  allowed: boolean
  reason?: string
  rateLimit?: RateLimitResult
}

/**
 * Security Manager - combines rate limiting, IP allowlist, and audit logging
 */
export class SecurityManager {
  private rateLimiter: RateLimiter
  private ipAllowlist: IPAllowlist
  private auditLogger: AuditLogger
  private requireAuth: boolean

  constructor(
    config: PluginAIAdminConfig['security'],
    payload?: Payload
  ) {
    const rateLimitConfig: RateLimitConfig = config?.rateLimit || {
      windowMs: 60000,
      maxRequests: 100,
      maxTokensPerWindow: 100000,
    }

    const ipConfig: IPAllowlistConfig = config?.ipAllowlist || {
      enabled: false,
      denyByDefault: false,
    }

    this.rateLimiter = createRateLimiter(rateLimitConfig)
    this.ipAllowlist = createIPAllowlist(ipConfig)
    this.auditLogger = createAuditLogger(payload)
    this.requireAuth = config?.requireAuth ?? true
  }

  /**
   * Check if a request is allowed
   */
  async check(req: PayloadRequest): Promise<SecurityCheckResult> {
    // Check authentication
    if (this.requireAuth) {
      if (!req.user) {
        await this.auditLogger.log({
          userId: 'anonymous',
          sessionId: 'unknown',
          action: 'access_denied',
          result: 'denied',
          errorMessage: 'Authentication required',
          ipAddress: this.getIP(req),
        })

        return {
          allowed: false,
          reason: 'Authentication required',
        }
      }
    }

    // Check IP allowlist
    if (!this.ipAllowlist.isAllowed(req)) {
      await this.auditLogger.log({
        // @ts-expect-error - user may not exist
        userId: req.user?.id || 'anonymous',
        sessionId: req.headers.get('x-session-id') || 'unknown',
        action: 'access_denied',
        result: 'denied',
        errorMessage: 'IP not allowed',
        ipAddress: this.getIP(req),
      })

      return {
        allowed: false,
        reason: 'IP address not allowed',
      }
    }

    // Check rate limit
    const rateLimit = this.rateLimiter.check(req)
    if (!rateLimit.allowed) {
      await this.auditLogger.log({
        // @ts-expect-error - user may not exist
        userId: req.user?.id || 'anonymous',
        sessionId: req.headers.get('x-session-id') || 'unknown',
        action: 'rate_limited',
        result: 'denied',
        errorMessage: 'Rate limit exceeded',
        ipAddress: this.getIP(req),
      })

      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        rateLimit,
      }
    }

    return {
      allowed: true,
      rateLimit,
    }
  }

  /**
   * Log an action
   */
  async logAction(
    req: PayloadRequest,
    action: string,
    extra?: {
      toolName?: string
      parameters?: Record<string, unknown>
      result?: 'success' | 'error' | 'denied' | 'pending'
      errorMessage?: string
      tokensUsed?: number
      responseTimeMs?: number
    }
  ): Promise<void> {
    await this.auditLogger.log({
      // @ts-expect-error - user may not exist
      userId: req.user?.id || 'anonymous',
      sessionId: req.headers.get('x-session-id') || 'unknown',
      action,
      result: extra?.result || 'success',
      ipAddress: this.getIP(req),
      userAgent: req.headers.get('user-agent') || undefined,
      ...extra,
    })
  }

  /**
   * Add tokens to rate limiter after completion
   */
  addTokens(req: PayloadRequest, tokens: number): void {
    this.rateLimiter.addTokens(req, tokens)
  }

  /**
   * Get the audit logger
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger
  }

  /**
   * Get the rate limiter
   */
  getRateLimiter(): RateLimiter {
    return this.rateLimiter
  }

  /**
   * Get IP address from request
   */
  private getIP(req: PayloadRequest): string {
    return (
      req.headers.get('x-forwarded-for')?.split(',')[0] ||
      req.headers.get('x-real-ip') ||
      'unknown'
    )
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    this.rateLimiter.destroy()
    if ('destroy' in this.auditLogger) {
      await (this.auditLogger as { destroy: () => Promise<void> }).destroy()
    }
  }
}

/**
 * Create security manager
 */
export function createSecurityManager(
  config: PluginAIAdminConfig['security'],
  payload?: Payload
): SecurityManager {
  return new SecurityManager(config, payload)
}
