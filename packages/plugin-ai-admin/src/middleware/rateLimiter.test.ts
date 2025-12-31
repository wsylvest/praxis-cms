import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { RateLimiter } from './rateLimiter.js'

// Mock PayloadRequest for testing
const createMockRequest = (userId?: string, ip?: string) => ({
  headers: new Map([
    ['x-forwarded-for', ip || '127.0.0.1'],
    ['authorization', ''],
  ]) as unknown as Headers,
  user: userId ? { id: userId } : undefined,
} as any)

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      windowMs: 60000, // 1 minute
      maxRequests: 10,
      maxTokensPerWindow: 1000,
    })
  })

  afterEach(() => {
    rateLimiter.destroy()
  })

  describe('check', () => {
    it('should allow requests within the limit', () => {
      const req = createMockRequest('user-1')
      const result = rateLimiter.check(req)

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
    })

    it('should track request counts correctly', () => {
      const req = createMockRequest('user-1')

      for (let i = 0; i < 5; i++) {
        rateLimiter.check(req)
      }

      const result = rateLimiter.check(req)
      expect(result.remaining).toBe(4)
    })

    it('should block requests when limit is exceeded', () => {
      const req = createMockRequest('user-1')

      // Use up all requests
      for (let i = 0; i < 10; i++) {
        rateLimiter.check(req)
      }

      const result = rateLimiter.check(req)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfter).toBeGreaterThan(0)
    })

    it('should track different users separately', () => {
      const req1 = createMockRequest('user-1')
      const req2 = createMockRequest('user-2')

      for (let i = 0; i < 10; i++) {
        rateLimiter.check(req1)
      }

      // user-1 should be blocked
      const result1 = rateLimiter.check(req1)
      expect(result1.allowed).toBe(false)

      // user-2 should still have full quota
      const result2 = rateLimiter.check(req2)
      expect(result2.allowed).toBe(true)
      expect(result2.remaining).toBe(9)
    })
  })

  describe('addTokens', () => {
    it('should track token usage', () => {
      const req = createMockRequest('user-1')
      rateLimiter.check(req)
      rateLimiter.addTokens(req, 500)

      const usage = rateLimiter.getUsage(req)
      expect(usage?.tokens).toBe(501) // 1 from check + 500 added
    })
  })

  describe('getUsage', () => {
    it('should return null for unknown users', () => {
      const req = createMockRequest('unknown-user')
      const usage = rateLimiter.getUsage(req)
      expect(usage).toBeNull()
    })

    it('should return usage for known users', () => {
      const req = createMockRequest('user-1')
      rateLimiter.check(req)
      rateLimiter.check(req)

      const usage = rateLimiter.getUsage(req)
      expect(usage?.requests).toBe(2)
    })
  })

  describe('reset', () => {
    it('should reset limits for a user', () => {
      const req = createMockRequest('user-1')

      // Use up quota
      for (let i = 0; i < 10; i++) {
        rateLimiter.check(req)
      }

      expect(rateLimiter.check(req).allowed).toBe(false)

      rateLimiter.reset(req)

      expect(rateLimiter.check(req).allowed).toBe(true)
    })
  })
})
