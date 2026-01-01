import { z } from 'zod'

import type {
  AITool,
  CollectionAIConfig,
  SessionContext,
  ToolCategory,
} from '../types/index.js'

/**
 * Tool Registry - manages available tools with context-aware loading
 */
export class ToolRegistry {
  private deferredTools: Set<string> = new Set()
  private tools: Map<string, AITool> = new Map()
  private toolsByCategory: Map<ToolCategory, AITool[]> = new Map()

  constructor() {
    // Initialize category maps
    const categories: ToolCategory[] = [
      'content',
      'media',
      'config',
      'analytics',
      'workflow',
      'admin',
    ]
    for (const category of categories) {
      this.toolsByCategory.set(category, [])
    }
  }

  /**
   * Check if user has required permissions for a tool
   */
  private hasPermissions(tool: AITool, userPermissions: string[]): boolean {
    if (tool.permissions.length === 0) {
      return true
    }

    // Admin has all permissions
    if (userPermissions.includes('admin') || userPermissions.includes('*')) {
      return true
    }

    // Check each required permission
    for (const required of tool.permissions) {
      const hasPermission = userPermissions.some((p) => {
        // Exact match
        if (p === required) {return true}

        // Wildcard match (e.g., "posts:*" matches "posts:create")
        if (p.endsWith(':*')) {
          const prefix = p.slice(0, -1)
          if (required.startsWith(prefix)) {return true}
        }

        return false
      })

      if (!hasPermission) {
        return false
      }
    }

    return true
  }

  /**
   * Check if a deferred tool should be loaded for context
   */
  private shouldLoadDeferred(tool: AITool, context: SessionContext): boolean {
    // Load collection-specific tools if viewing that collection
    if (
      context.currentCollection &&
      tool.name.toLowerCase().includes(context.currentCollection.toLowerCase())
    ) {
      return true
    }

    return false
  }

  /**
   * Calculate token usage estimate for tools
   */
  estimateTokens(tools: AITool[]): number {
    // Rough estimate: ~100 tokens per tool definition
    // This includes name, description, and parameter schema
    let tokens = 0

    for (const tool of tools) {
      tokens += 20 // Name and basic structure
      tokens += Math.ceil(tool.description.length / 4) // Description
      tokens += 50 // Average parameter schema overhead
    }

    return tokens
  }

  /**
   * Get a tool by name
   */
  get(name: string): AITool | undefined {
    return this.tools.get(name)
  }

  /**
   * Get all tools
   */
  getAll(): AITool[] {
    return Array.from(this.tools.values())
  }

  /**
   * Get tools by category
   */
  getByCategory(category: ToolCategory): AITool[] {
    return this.toolsByCategory.get(category) || []
  }

  /**
   * Get deferred tool names (for the Tool Search Tool pattern)
   */
  getDeferredToolNames(): string[] {
    return Array.from(this.deferredTools)
  }

  /**
   * Get tools for context (smart loading)
   * Only returns tools relevant to the current context
   */
  getForContext(
    context: SessionContext,
    userPermissions: string[]
  ): AITool[] {
    const tools: AITool[] = []
    const loadedCategories = new Set<ToolCategory>()

    // Always load content tools (most commonly used)
    loadedCategories.add('content')

    // Load category based on context
    if (context.currentCollection) {
      // If viewing a collection, load relevant tools
      loadedCategories.add('content')
    }

    // Check if user has admin permissions
    const isAdmin = userPermissions.includes('admin') ||
      userPermissions.includes('*')

    if (isAdmin) {
      loadedCategories.add('config')
      loadedCategories.add('admin')
    }

    // Load analytics if user can read analytics
    if (
      userPermissions.includes('analytics:read') ||
      userPermissions.includes('analytics:*') ||
      isAdmin
    ) {
      loadedCategories.add('analytics')
    }

    // Load workflow tools if user can manage workflows
    if (
      userPermissions.includes('workflow:*') ||
      userPermissions.includes('jobs:*') ||
      isAdmin
    ) {
      loadedCategories.add('workflow')
    }

    // Always load media tools
    loadedCategories.add('media')

    // Collect tools from loaded categories
    for (const category of loadedCategories) {
      const categoryTools = this.getByCategory(category)
      for (const tool of categoryTools) {
        // Skip deferred tools unless explicitly requested
        if (tool.deferLoading && !this.shouldLoadDeferred(tool, context)) {
          continue
        }

        // Check permissions
        if (this.hasPermissions(tool, userPermissions)) {
          tools.push(tool)
        }
      }
    }

    return tools
  }

  /**
   * Get optimized tool set (minimize tokens while maintaining functionality)
   */
  getOptimized(
    context: SessionContext,
    userPermissions: string[],
    maxTokens: number = 10000
  ): { deferred: string[]; estimatedTokens: number; tools: AITool[] } {
    const allTools = this.getForContext(context, userPermissions)

    // Sort by importance (non-deferred first)
    const sorted = [...allTools].sort((a, b) => {
      if (a.deferLoading && !b.deferLoading) {return 1}
      if (!a.deferLoading && b.deferLoading) {return -1}
      return 0
    })

    const included: AITool[] = []
    const deferred: string[] = []
    let currentTokens = 0

    for (const tool of sorted) {
      const toolTokens = this.estimateTokens([tool])

      if (currentTokens + toolTokens <= maxTokens) {
        included.push(tool)
        currentTokens += toolTokens
      } else {
        deferred.push(tool.name)
      }
    }

    // Always include tool search if we have deferred tools
    if (deferred.length > 0) {
      const searchTool = this.getToolSearchTool()
      const searchTokens = this.estimateTokens([searchTool])

      if (currentTokens + searchTokens <= maxTokens) {
        included.push(searchTool)
        currentTokens += searchTokens
      }
    }

    return {
      deferred,
      estimatedTokens: currentTokens,
      tools: included,
    }
  }

  /**
   * Get tool search tool (for on-demand discovery)
   * This is the "Tool Search Tool" pattern from Anthropic
   */
  getToolSearchTool(): AITool {
    return {
      name: 'search_tools',
      category: 'admin',
      description:
        'Search for available tools by name or description. Use this when you need a capability that might not be loaded.',
      handler: (args) => {
        const query = (args.query as string).toLowerCase()
        const category = args.category as ToolCategory | undefined

        let searchTools = Array.from(this.tools.values())

        if (category) {
          searchTools = searchTools.filter((t) => t.category === category)
        }

        const matches = searchTools.filter(
          (t) =>
            t.name.toLowerCase().includes(query) ||
            t.description.toLowerCase().includes(query)
        )

        return Promise.resolve({
          data: matches.map((t) => ({
            name: t.name,
            category: t.category,
            confirmationRequired: t.confirmationRequired,
            description: t.description,
          })),
          message: `Found ${matches.length} tools matching "${String(args.query)}"`,
          success: true,
        })
      },
      parameters: z.object({
        category: z
          .enum(['content', 'media', 'config', 'analytics', 'workflow', 'admin'])
          .optional()
          .describe('Filter by category'),
        query: z.string().describe('Search query for tool name or description'),
      }),
      permissions: [],
    }
  }

  /**
   * Register a tool
   */
  register(tool: AITool): void {
    this.tools.set(tool.name, tool)

    // Add to category
    const categoryTools = this.toolsByCategory.get(tool.category) || []
    categoryTools.push(tool)
    this.toolsByCategory.set(tool.category, categoryTools)

    // Track if deferred
    if (tool.deferLoading) {
      this.deferredTools.add(tool.name)
    }
  }

  /**
   * Register multiple tools
   */
  registerMany(tools: AITool[]): void {
    for (const tool of tools) {
      this.register(tool)
    }
  }
}

/**
 * Create collection-specific tools
 */
export function createCollectionTools(
  collectionSlug: string,
  config: CollectionAIConfig,
  description?: string
): AITool[] {
  const tools: AITool[] = []

  const enabled =
    typeof config.enabled === 'boolean'
      ? { create: config.enabled, delete: config.enabled, read: config.enabled, update: config.enabled }
      : config.enabled

  // Find tool
  if (enabled.read !== false) {
    tools.push({
      name: `find_${collectionSlug}`,
      category: 'content',
      description: description || `Search and retrieve ${collectionSlug} documents`,
      handler: async (args, ctx) => {
        if (args.id) {
          const doc = await ctx.payload.findByID({
            id: args.id as string,
            collection: collectionSlug,
          })
          return { data: doc, success: true }
        }

        const result = await ctx.payload.find({
          collection: collectionSlug,
          limit: args.limit as number,
          page: args.page as number,
          sort: args.sort as string,
          where: args.where as any,
        })
        return { data: result, success: true }
      },
      parameters: z.object({
        id: z.string().optional().describe('Find a specific document by ID'),
        limit: z.number().optional().default(10).describe('Max results'),
        page: z.number().optional().default(1).describe('Page number'),
        sort: z.string().optional().describe('Sort field (prefix with - for descending)'),
        where: z.record(z.any()).optional().describe('Filter conditions'),
      }),
      permissions: [`${collectionSlug}:read`],
    })
  }

  // Create tool
  if (enabled.create !== false) {
    tools.push({
      name: `create_${collectionSlug}`,
      category: 'content',
      description: `Create a new ${collectionSlug} document`,
      handler: async (args, ctx) => {
        const doc = await ctx.payload.create({
          collection: collectionSlug,
          data: args.data as Record<string, unknown>,
          draft: args.draft as boolean,
        })

        // Save undo action
        const undoActionId = await ctx.undoManager.save({
          description: `Created ${collectionSlug} document`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          previousState: null,
          reverseOperation: async () => {
            await ctx.payload.delete({
              id: doc.id as string,
              collection: collectionSlug,
            })
          },
          toolName: `create_${collectionSlug}`,
        } as any)

        return {
          data: doc,
          message: `Created ${collectionSlug} with ID ${doc.id}`,
          success: true,
        }
      },
      parameters: z.object({
        data: z.record(z.any()).describe('Document data'),
        draft: z.boolean().optional().default(false).describe('Create as draft'),
      }),
      permissions: [`${collectionSlug}:create`],
      undoable: true,
    })
  }

  // Update tool
  if (enabled.update !== false) {
    tools.push({
      name: `update_${collectionSlug}`,
      category: 'content',
      description: `Update an existing ${collectionSlug} document`,
      handler: async (args, ctx) => {
        // Get previous state for undo
        const previousState = await ctx.payload.findByID({
          id: args.id as string,
          collection: collectionSlug,
        })

        const doc = await ctx.payload.update({
          id: args.id as string,
          collection: collectionSlug,
          data: args.data as Record<string, unknown>,
        })

        // Save undo action
        await ctx.undoManager.save({
          description: `Updated ${collectionSlug} document`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          previousState,
          reverseOperation: async () => {
            await ctx.payload.update({
              id: args.id as string,
              collection: collectionSlug,
              data: previousState as Record<string, unknown>,
            })
          },
          toolName: `update_${collectionSlug}`,
        } as any)

        return {
          data: doc,
          message: `Updated ${collectionSlug} ${args.id}`,
          success: true,
        }
      },
      parameters: z.object({
        id: z.string().describe('Document ID to update'),
        data: z.record(z.any()).describe('Fields to update'),
      }),
      permissions: [`${collectionSlug}:update`],
      undoable: true,
    })
  }

  // Delete tool
  if (enabled.delete !== false) {
    tools.push({
      name: `delete_${collectionSlug}`,
      category: 'content',
      confirmationRequired: true,
      description: `Delete a ${collectionSlug} document`,
      handler: async (args, ctx) => {
        // Get previous state for undo
        const previousState = await ctx.payload.findByID({
          id: args.id as string,
          collection: collectionSlug,
        })

        await ctx.payload.delete({
          id: args.id as string,
          collection: collectionSlug,
        })

        // Save undo action
        await ctx.undoManager.save({
          description: `Deleted ${collectionSlug} document`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          previousState,
          reverseOperation: async () => {
            await ctx.payload.create({
              collection: collectionSlug,
              data: previousState as Record<string, unknown>,
            })
          },
          toolName: `delete_${collectionSlug}`,
        } as any)

        return {
          message: `Deleted ${collectionSlug} ${args.id}`,
          success: true,
        }
      },
      parameters: z.object({
        id: z.string().describe('Document ID to delete'),
      }),
      permissions: [`${collectionSlug}:delete`],
      undoable: true,
    })
  }

  return tools
}

/**
 * Create tool registry
 */
export function createToolRegistry(): ToolRegistry {
  return new ToolRegistry()
}
