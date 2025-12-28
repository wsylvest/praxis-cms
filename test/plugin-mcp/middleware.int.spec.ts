import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createToolRegistry } from '../../packages/plugin-mcp/src/mcp/toolRegistry.js'
import { createRateLimiter } from '../../packages/plugin-mcp/src/middleware/rateLimiter.js'

describe('MCP Middleware', () => {
  describe('Rate Limiter', () => {
    it('should allow requests within limit', async () => {
      const rateLimiter = createRateLimiter({
        maxRequests: 10,
        windowMs: 60000,
      })

      const result = await rateLimiter.checkLimit('api-key-1', 'user-1')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
      expect(result.resetAt).toBeInstanceOf(Date)
    })

    it('should block requests exceeding limit', async () => {
      const rateLimiter = createRateLimiter({
        maxRequests: 3,
        windowMs: 60000,
      })

      // Make 3 requests
      await rateLimiter.checkLimit('api-key-2', 'user-2')
      await rateLimiter.checkLimit('api-key-2', 'user-2')
      await rateLimiter.checkLimit('api-key-2', 'user-2')

      // 4th request should be blocked
      const result = await rateLimiter.checkLimit('api-key-2', 'user-2')

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfter).toBeDefined()
    })

    it('should skip whitelisted keys', async () => {
      const rateLimiter = createRateLimiter({
        maxRequests: 1,
        skipKeys: ['admin-key'],
        windowMs: 60000,
      })

      // First request
      await rateLimiter.checkLimit('admin-key', 'user-3')
      // Second request should still be allowed
      const result = await rateLimiter.checkLimit('admin-key', 'user-3')

      expect(result.allowed).toBe(true)
    })

    it('should track usage correctly', async () => {
      const rateLimiter = createRateLimiter({
        maxRequests: 10,
        windowMs: 60000,
      })

      await rateLimiter.checkLimit('api-key-4', 'user-4')
      await rateLimiter.checkLimit('api-key-4', 'user-4')

      const usage = rateLimiter.getUsage('api-key-4', 'user-4')

      expect(usage).toBeDefined()
      expect(usage?.requests).toBe(2)
    })

    it('should reset limits when requested', async () => {
      const rateLimiter = createRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      })

      await rateLimiter.checkLimit('api-key-5', 'user-5')
      await rateLimiter.checkLimit('api-key-5', 'user-5')

      rateLimiter.reset('api-key-5', 'user-5')

      const usage = rateLimiter.getUsage('api-key-5', 'user-5')

      expect(usage).toBeNull()
    })

    it('should call onRateLimitExceeded callback', async () => {
      const callback = vi.fn()

      const rateLimiter = createRateLimiter({
        maxRequests: 1,
        onRateLimitExceeded: callback,
        windowMs: 60000,
      })

      await rateLimiter.checkLimit('api-key-6', 'user-6')
      await rateLimiter.checkLimit('api-key-6', 'user-6')

      expect(callback).toHaveBeenCalledExactlyOnceWith('api-key-6', 'user-6', expect.objectContaining({
          allowed: false,
          remaining: 0,
        }))
    })

    it('should record token usage', async () => {
      const rateLimiter = createRateLimiter({
        maxRequests: 100,
        maxTokensPerWindow: 1000,
        windowMs: 60000,
      })

      // First make a request to initialize the entry
      await rateLimiter.checkLimit('api-key-7', 'user-7')

      // Then record tokens
      rateLimiter.recordTokens('api-key-7', 'user-7', 100)

      const usage = rateLimiter.getUsage('api-key-7', 'user-7')
      expect(usage?.tokens).toBe(100)
    })
  })

  describe('Tool Registry', () => {
    let registry: ReturnType<typeof createToolRegistry>

    beforeEach(() => {
      registry = createToolRegistry()
    })

    it('should register deferred tools', () => {
      registry.registerDeferred({
        name: 'testTool',
        category: 'custom',
        description: 'A test tool',
        inputSchema: {} as any,
        loader: () => Promise.resolve(() => 'result'),
      })

      expect(registry.has('testTool')).toBe(true)
    })

    it('should load deferred tools on demand', async () => {
      const mockHandler = vi.fn().mockResolvedValue('handler result')

      registry.registerDeferred({
        name: 'lazyTool',
        category: 'resource',
        collectionSlug: 'posts',
        description: 'A lazy loaded tool',
        inputSchema: {} as any,
        loader: () => Promise.resolve(mockHandler),
        operation: 'find',
      })

      const metadata = registry.getToolMetadata('lazyTool')
      expect(metadata?.isLoaded).toBe(false)

      const tool = await registry.get('lazyTool')

      expect(tool).toBeDefined()
      expect(tool?.name).toBe('lazyTool')
      expect(registry.getToolMetadata('lazyTool')?.isLoaded).toBe(true)
    })

    it('should return null for non-existent tools', async () => {
      const tool = await registry.get('nonExistent')
      expect(tool).toBeNull()
    })

    it('should list all tool names', () => {
      registry.registerDeferred({
        name: 'tool1',
        category: 'custom',
        description: 'Tool 1',
        inputSchema: {} as any,
        loader: () => Promise.resolve(() => 'result'),
      })

      registry.registerDeferred({
        name: 'tool2',
        category: 'resource',
        description: 'Tool 2',
        inputSchema: {} as any,
        loader: () => Promise.resolve(() => 'result'),
      })

      const names = registry.getToolNames()
      expect(names).toContain('tool1')
      expect(names).toContain('tool2')
    })

    it('should get tools by category', () => {
      registry.registerDeferred({
        name: 'customTool',
        category: 'custom',
        description: 'Custom tool',
        inputSchema: {} as any,
        loader: () => Promise.resolve(() => 'result'),
      })

      registry.registerDeferred({
        name: 'resourceTool',
        category: 'resource',
        description: 'Resource tool',
        inputSchema: {} as any,
        loader: () => Promise.resolve(() => 'result'),
      })

      const customTools = registry.getToolsByCategory('custom')
      const resourceTools = registry.getToolsByCategory('resource')

      expect(customTools).toContain('customTool')
      expect(customTools).not.toContain('resourceTool')
      expect(resourceTools).toContain('resourceTool')
    })

    it('should get tools by collection', () => {
      registry.registerDeferred({
        name: 'findPosts',
        category: 'resource',
        collectionSlug: 'posts',
        description: 'Find posts',
        inputSchema: {} as any,
        loader: () => Promise.resolve(() => 'result'),
      })

      registry.registerDeferred({
        name: 'findUsers',
        category: 'resource',
        collectionSlug: 'users',
        description: 'Find users',
        inputSchema: {} as any,
        loader: () => Promise.resolve(() => 'result'),
      })

      const postTools = registry.getToolsByCollection('posts')
      const userTools = registry.getToolsByCollection('users')

      expect(postTools).toContain('findPosts')
      expect(postTools).not.toContain('findUsers')
      expect(userTools).toContain('findUsers')
    })

    it('should track usage statistics', async () => {
      registry.registerDeferred({
        name: 'trackedTool',
        category: 'custom',
        description: 'A tracked tool',
        inputSchema: {} as any,
        loader: () => Promise.resolve(() => 'result'),
      })

      // Load and use the tool multiple times
      await registry.get('trackedTool')
      await registry.get('trackedTool')
      await registry.get('trackedTool')

      const stats = registry.getStats()

      expect(stats.loadedCount).toBe(1)
      expect(stats.deferredCount).toBe(0)
      expect(stats.mostUsed[0]).toEqual({
        name: 'trackedTool',
        usageCount: 2, // First get loads, subsequent gets increment
      })
    })

    it('should preload tools by category', async () => {
      registry.registerDeferred({
        name: 'job1',
        category: 'job',
        description: 'Job 1',
        inputSchema: {} as any,
        loader: () => Promise.resolve(() => 'result'),
      })

      registry.registerDeferred({
        name: 'job2',
        category: 'job',
        description: 'Job 2',
        inputSchema: {} as any,
        loader: () => Promise.resolve(() => 'result'),
      })

      registry.registerDeferred({
        name: 'auth1',
        category: 'auth',
        description: 'Auth 1',
        inputSchema: {} as any,
        loader: () => Promise.resolve(() => 'result'),
      })

      await registry.preloadCategory('job')

      expect(registry.getToolMetadata('job1')?.isLoaded).toBe(true)
      expect(registry.getToolMetadata('job2')?.isLoaded).toBe(true)
      expect(registry.getToolMetadata('auth1')?.isLoaded).toBe(false)
    })

    it('should clear all tools', () => {
      registry.registerDeferred({
        name: 'tool',
        category: 'custom',
        description: 'Tool',
        inputSchema: {} as any,
        loader: () => Promise.resolve(() => 'result'),
      })

      expect(registry.has('tool')).toBe(true)

      registry.clear()

      expect(registry.has('tool')).toBe(false)
      expect(registry.getToolNames()).toHaveLength(0)
    })
  })
})
