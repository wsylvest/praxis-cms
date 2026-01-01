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
import type { IPAllowlist } from './ipAllowlist.js';
import type { RateLimiter } from './rateLimiter.js';

import { createAuditLogger } from './auditLogger.js'
import { createIPAllowlist } from './ipAllowlist.js'
import { createRateLimiter } from './rateLimiter.js'

export interface SecurityContext {
  auditLogger: AuditLogger
  ipAllowlist: IPAllowlist
  rateLimiter: RateLimiter
}

export interface SecurityCheckResult {
  allowed: boolean
  rateLimit?: RateLimitResult
  reason?: string
}

/**
 * Security Manager - combines rate limiting, IP allowlist, and audit logging
 */
export class SecurityManager {
  private auditLogger: AuditLogger
  private ipAllowlist: IPAllowlist
  private rateLimiter: RateLimiter
  private requireAuth: boolean

  constructor(
    config: PluginAIAdminConfig['security'],
    payload?: Payload
  ) {
    const rateLimitConfig: RateLimitConfig = config?.rateLimit || {
      maxRequests: 100,
      maxTokensPerWindow: 100000,
      windowMs: 60000,
    }

    const ipConfig: IPAllowlistConfig = config?.ipAllowlist || {
      denyByDefault: false,
      enabled: false,
    }

    this.rateLimiter = createRateLimiter(rateLimitConfig)
    this.ipAllowlist = createIPAllowlist(ipConfig)
    this.auditLogger = createAuditLogger(payload)
    this.requireAuth = config?.requireAuth ?? true
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
   * Add tokens to rate limiter after completion
   */
  addTokens(req: PayloadRequest, tokens: number): void {
    this.rateLimiter.addTokens(req, tokens)
  }

  /**
   * Check if a request is allowed
   */
  async check(req: PayloadRequest): Promise<SecurityCheckResult> {
    // Check authentication
    if (this.requireAuth) {
      if (!req.user) {
        await this.auditLogger.log({
          action: 'access_denied',
          errorMessage: 'Authentication required',
          ipAddress: this.getIP(req),
          result: 'denied',
          sessionId: 'unknown',
          userId: 'anonymous',
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
        action: 'access_denied',
        errorMessage: 'IP not allowed',
        ipAddress: this.getIP(req),
        result: 'denied',
        sessionId: req.headers.get('x-session-id') || 'unknown',
        userId: req.user?.id ? String(req.user.id) : 'anonymous',
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
        action: 'rate_limited',
        errorMessage: 'Rate limit exceeded',
        ipAddress: this.getIP(req),
        result: 'denied',
        sessionId: req.headers.get('x-session-id') || 'unknown',
        userId: req.user?.id ? String(req.user.id) : 'anonymous',
      })

      return {
        allowed: false,
        rateLimit,
        reason: 'Rate limit exceeded',
      }
    }

    return {
      allowed: true,
      rateLimit,
    }
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
   * Log an action
   */
  async logAction(
    req: PayloadRequest,
    action: string,
    extra?: {
      errorMessage?: string
      parameters?: Record<string, unknown>
      responseTimeMs?: number
      result?: 'denied' | 'error' | 'pending' | 'success'
      tokensUsed?: number
      toolName?: string
    }
  ): Promise<void> {
    await this.auditLogger.log({
      action,
      ipAddress: this.getIP(req),
      result: extra?.result || 'success',
      sessionId: req.headers.get('x-session-id') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      userId: req.user?.id ? String(req.user.id) : 'anonymous',
      ...extra,
    })
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
