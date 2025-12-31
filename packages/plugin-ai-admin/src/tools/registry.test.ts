import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'
import { ToolRegistry } from './registry.js'
import type { AITool, SessionContext } from '../types/index.js'

describe('ToolRegistry', () => {
  let registry: ToolRegistry

  const createMockTool = (overrides: Partial<AITool> = {}): AITool => ({
    name: 'test_tool',
    description: 'A test tool',
    category: 'content',
    parameters: z.object({
      input: z.string().describe('Test input'),
    }),
    permissions: [],
    handler: async (params) => ({
      success: true,
      data: { echo: params.input },
    }),
    ...overrides,
  })

  beforeEach(() => {
    registry = new ToolRegistry()
  })

  describe('register', () => {
    it('should register a tool', () => {
      const tool = createMockTool()
      registry.register(tool)

      expect(registry.get('test_tool')).toBeDefined()
    })

    it('should add tool to category', () => {
      const tool = createMockTool({ category: 'media' })
      registry.register(tool)

      const mediaTools = registry.getByCategory('media')
      expect(mediaTools.length).toBe(1)
      expect(mediaTools[0].name).toBe('test_tool')
    })
  })

  describe('registerMany', () => {
    it('should register multiple tools', () => {
      const tools = [
        createMockTool({ name: 'tool1' }),
        createMockTool({ name: 'tool2' }),
        createMockTool({ name: 'tool3' }),
      ]

      registry.registerMany(tools)

      expect(registry.getAll().length).toBe(3)
    })
  })

  describe('get', () => {
    it('should return registered tool', () => {
      const tool = createMockTool()
      registry.register(tool)

      expect(registry.get('test_tool')?.name).toBe('test_tool')
    })

    it('should return undefined for non-existent tool', () => {
      expect(registry.get('non_existent')).toBeUndefined()
    })
  })

  describe('getAll', () => {
    it('should return all registered tools', () => {
      registry.register(createMockTool({ name: 'tool1' }))
      registry.register(createMockTool({ name: 'tool2' }))

      const all = registry.getAll()
      expect(all.length).toBe(2)
    })
  })

  describe('getByCategory', () => {
    it('should return tools by category', () => {
      registry.register(createMockTool({ name: 'content1', category: 'content' }))
      registry.register(createMockTool({ name: 'content2', category: 'content' }))
      registry.register(createMockTool({ name: 'media1', category: 'media' }))

      const contentTools = registry.getByCategory('content')
      expect(contentTools.length).toBe(2)

      const mediaTools = registry.getByCategory('media')
      expect(mediaTools.length).toBe(1)
    })

    it('should return empty array for empty category', () => {
      const tools = registry.getByCategory('analytics')
      expect(tools).toEqual([])
    })
  })

  describe('getForContext', () => {
    it('should return tools user has permission for', () => {
      registry.register(
        createMockTool({
          name: 'admin_tool',
          category: 'admin',
          permissions: ['admin'],
        })
      )
      registry.register(
        createMockTool({
          name: 'public_tool',
          category: 'content',
          permissions: [],
        })
      )

      const context: SessionContext = {
        id: 'session-1',
        userId: 'user-1',
        createdAt: new Date(),
        expiresAt: new Date(),
      }

      // Regular user should only get public tool
      const regularUserTools = registry.getForContext(context, ['posts:read'])
      expect(regularUserTools.some((t) => t.name === 'public_tool')).toBe(true)
      expect(regularUserTools.some((t) => t.name === 'admin_tool')).toBe(false)

      // Admin should get both
      const adminTools = registry.getForContext(context, ['admin'])
      expect(adminTools.some((t) => t.name === 'public_tool')).toBe(true)
      expect(adminTools.some((t) => t.name === 'admin_tool')).toBe(true)
    })

    it('should handle wildcard permissions', () => {
      registry.register(
        createMockTool({
          name: 'posts_tool',
          category: 'content',
          permissions: ['posts:create'],
        })
      )

      const context: SessionContext = {
        id: 'session-1',
        userId: 'user-1',
        createdAt: new Date(),
        expiresAt: new Date(),
      }

      // posts:* should match posts:create
      const tools = registry.getForContext(context, ['posts:*'])
      expect(tools.some((t) => t.name === 'posts_tool')).toBe(true)
    })
  })

  describe('getDeferredToolNames', () => {
    it('should return names of deferred tools', () => {
      registry.register(createMockTool({ name: 'regular', deferLoading: false }))
      registry.register(createMockTool({ name: 'deferred', deferLoading: true }))

      const deferred = registry.getDeferredToolNames()
      expect(deferred).toContain('deferred')
      expect(deferred).not.toContain('regular')
    })
  })

  describe('estimateTokens', () => {
    it('should estimate token usage for tools', () => {
      const tool = createMockTool({ description: 'A short description' })
      const estimate = registry.estimateTokens([tool])

      expect(estimate).toBeGreaterThan(0)
    })

    it('should return 0 for empty array', () => {
      const estimate = registry.estimateTokens([])
      expect(estimate).toBe(0)
    })

    it('should increase with longer descriptions', () => {
      const shortTool = createMockTool({ name: 'short', description: 'Short' })
      const longTool = createMockTool({
        name: 'long',
        description: 'A very long description '.repeat(10),
      })

      const shortEstimate = registry.estimateTokens([shortTool])
      const longEstimate = registry.estimateTokens([longTool])

      expect(longEstimate).toBeGreaterThan(shortEstimate)
    })
  })

  describe('getOptimized', () => {
    it('should limit tools to token budget', () => {
      // Register many tools
      for (let i = 0; i < 20; i++) {
        registry.register(
          createMockTool({
            name: `tool_${i}`,
            description: 'A tool that does things '.repeat(5),
          })
        )
      }

      const context: SessionContext = {
        id: 'session-1',
        userId: 'user-1',
        createdAt: new Date(),
        expiresAt: new Date(),
      }

      const result = registry.getOptimized(context, ['admin'], 1000)

      expect(result.estimatedTokens).toBeLessThanOrEqual(1000)
      expect(result.tools.length).toBeLessThan(20)
      expect(result.deferred.length).toBeGreaterThan(0)
    })
  })

  describe('getToolSearchTool', () => {
    it('should return a valid search tool', () => {
      const searchTool = registry.getToolSearchTool()

      expect(searchTool.name).toBe('search_tools')
      expect(searchTool.handler).toBeDefined()
    })

    it('should search registered tools', async () => {
      registry.register(createMockTool({ name: 'create_posts', description: 'Create posts' }))
      registry.register(createMockTool({ name: 'update_posts', description: 'Update posts' }))
      registry.register(createMockTool({ name: 'delete_users', description: 'Delete users' }))

      const searchTool = registry.getToolSearchTool()
      const result = await searchTool.handler({ query: 'posts' }, {} as any)

      expect(result.success).toBe(true)
      expect((result.data as unknown[]).length).toBe(2)
    })
  })
})
