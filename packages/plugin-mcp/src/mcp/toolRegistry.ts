/**
 * MCP Tool Registry
 *
 * Manages deferred tool loading for on-demand tool resolution.
 * Improves startup performance by not loading all tools upfront.
 */

import type { Payload } from 'payload'
import type { z } from 'zod'

export interface ToolDefinition {
  category: 'auth' | 'collection' | 'config' | 'custom' | 'job' | 'resource'
  collectionSlug?: string
  description: string
  handler: (payload: Payload, params: unknown, context: ToolContext) => Promise<unknown>
  inputSchema: z.ZodSchema<any>
  metadata?: Record<string, unknown>
  name: string
  operation?: 'create' | 'delete' | 'execute' | 'find' | 'other' | 'update'
}

export interface ToolContext {
  apiKeyId: string
  permissions: Record<string, unknown>
  streamSessionId?: string
  userEmail?: string
  userId: string
}

export interface DeferredTool {
  category: ToolDefinition['category']
  collectionSlug?: string
  description: string
  inputSchema: z.ZodSchema<any>
  loader: () => Promise<ToolDefinition['handler']>
  metadata?: Record<string, unknown>
  name: string
  operation?: ToolDefinition['operation']
}

interface LoadedTool {
  definition: ToolDefinition
  lastUsedAt: Date
  loadedAt: Date
  usageCount: number
}

/**
 * Create a tool registry instance
 */
export function createToolRegistry() {
  // Deferred tools (not yet loaded)
  const deferredTools = new Map<string, DeferredTool>()

  // Loaded tools (handlers resolved)
  const loadedTools = new Map<string, LoadedTool>()

  // Tool loading promises (prevent concurrent loading)
  const loadingPromises = new Map<string, Promise<ToolDefinition['handler']>>()

  return {
    /**
     * Register a deferred tool
     */
    registerDeferred(tool: DeferredTool): void {
      deferredTools.set(tool.name, tool)
    },

    /**
     * Register multiple deferred tools
     */
    registerDeferredBatch(tools: DeferredTool[]): void {
      for (const tool of tools) {
        this.registerDeferred(tool)
      }
    },

    /**
     * Register a fully loaded tool (no deferral)
     */
    register(definition: ToolDefinition): void {
      loadedTools.set(definition.name, {
        definition,
        lastUsedAt: new Date(),
        loadedAt: new Date(),
        usageCount: 0,
      })
    },

    /**
     * Check if a tool exists (deferred or loaded)
     */
    has(name: string): boolean {
      return deferredTools.has(name) || loadedTools.has(name)
    },

    /**
     * Get tool definition (loads if deferred)
     */
    async get(name: string): Promise<null | ToolDefinition> {
      // Check if already loaded
      const loaded = loadedTools.get(name)
      if (loaded) {
        loaded.usageCount++
        loaded.lastUsedAt = new Date()
        return loaded.definition
      }

      // Check if deferred
      const deferred = deferredTools.get(name)
      if (!deferred) {
        return null
      }

      // Load the tool
      const handler = await this.loadTool(name)
      if (!handler) {
        return null
      }

      // Return the now-loaded tool
      return loadedTools.get(name)?.definition ?? null
    },

    /**
     * Load a deferred tool
     */
    async loadTool(name: string): Promise<null | ToolDefinition['handler']> {
      // Already loaded?
      const loaded = loadedTools.get(name)
      if (loaded) {
        return loaded.definition.handler
      }

      // Not deferred?
      const deferred = deferredTools.get(name)
      if (!deferred) {
        return null
      }

      // Check for existing loading promise
      const existingPromise = loadingPromises.get(name)
      if (existingPromise) {
        return existingPromise
      }

      // Create loading promise
      const loadPromise = deferred
        .loader()
        .then((handler) => {
          // Create full definition
          const definition: ToolDefinition = {
            name: deferred.name,
            category: deferred.category,
            collectionSlug: deferred.collectionSlug,
            description: deferred.description,
            handler,
            inputSchema: deferred.inputSchema,
            metadata: deferred.metadata,
            operation: deferred.operation,
          }

          // Store as loaded
          loadedTools.set(name, {
            definition,
            lastUsedAt: new Date(),
            loadedAt: new Date(),
            usageCount: 0,
          })

          // Remove from deferred
          deferredTools.delete(name)

          // Clear loading promise
          loadingPromises.delete(name)

          return handler
        })
        .catch((error) => {
          // Clear loading promise on failure
          loadingPromises.delete(name)
          throw error
        })

      loadingPromises.set(name, loadPromise)
      return loadPromise
    },

    /**
     * Preload specific tools
     */
    async preload(names: string[]): Promise<void> {
      await Promise.all(names.map((name) => this.loadTool(name)))
    },

    /**
     * Preload tools by category
     */
    async preloadCategory(category: ToolDefinition['category']): Promise<void> {
      const toLoad: string[] = []
      for (const [name, tool] of deferredTools.entries()) {
        if (tool.category === category) {
          toLoad.push(name)
        }
      }
      await this.preload(toLoad)
    },

    /**
     * Preload tools for a collection
     */
    async preloadCollection(collectionSlug: string): Promise<void> {
      const toLoad: string[] = []
      for (const [name, tool] of deferredTools.entries()) {
        if (tool.collectionSlug === collectionSlug) {
          toLoad.push(name)
        }
      }
      await this.preload(toLoad)
    },

    /**
     * Get all tool names (deferred and loaded)
     */
    getToolNames(): string[] {
      const names = new Set<string>()
      for (const name of deferredTools.keys()) {
        names.add(name)
      }
      for (const name of loadedTools.keys()) {
        names.add(name)
      }
      return Array.from(names)
    },

    /**
     * Get tool metadata without loading
     */
    getToolMetadata(name: string): {
      category: ToolDefinition['category']
      collectionSlug?: string
      description: string
      isLoaded: boolean
      name: string
      operation?: ToolDefinition['operation']
    } | null {
      const loaded = loadedTools.get(name)
      if (loaded) {
        return {
          name: loaded.definition.name,
          category: loaded.definition.category,
          collectionSlug: loaded.definition.collectionSlug,
          description: loaded.definition.description,
          isLoaded: true,
          operation: loaded.definition.operation,
        }
      }

      const deferred = deferredTools.get(name)
      if (deferred) {
        return {
          name: deferred.name,
          category: deferred.category,
          collectionSlug: deferred.collectionSlug,
          description: deferred.description,
          isLoaded: false,
          operation: deferred.operation,
        }
      }

      return null
    },

    /**
     * Get all tools metadata (for listing)
     */
    getAllToolsMetadata(): Array<{
      category: ToolDefinition['category']
      collectionSlug?: string
      description: string
      isLoaded: boolean
      name: string
      operation?: ToolDefinition['operation']
    }> {
      const result: Array<{
        category: ToolDefinition['category']
        collectionSlug?: string
        description: string
        isLoaded: boolean
        name: string
        operation?: ToolDefinition['operation']
      }> = []

      for (const [name, tool] of deferredTools.entries()) {
        result.push({
          name,
          category: tool.category,
          collectionSlug: tool.collectionSlug,
          description: tool.description,
          isLoaded: false,
          operation: tool.operation,
        })
      }

      for (const [name, loaded] of loadedTools.entries()) {
        result.push({
          name,
          category: loaded.definition.category,
          collectionSlug: loaded.definition.collectionSlug,
          description: loaded.definition.description,
          isLoaded: true,
          operation: loaded.definition.operation,
        })
      }

      return result
    },

    /**
     * Get tools by category (metadata only)
     */
    getToolsByCategory(category: ToolDefinition['category']): string[] {
      const result: string[] = []

      for (const [name, tool] of deferredTools.entries()) {
        if (tool.category === category) {
          result.push(name)
        }
      }

      for (const [name, loaded] of loadedTools.entries()) {
        if (loaded.definition.category === category) {
          result.push(name)
        }
      }

      return result
    },

    /**
     * Get tools by collection (metadata only)
     */
    getToolsByCollection(collectionSlug: string): string[] {
      const result: string[] = []

      for (const [name, tool] of deferredTools.entries()) {
        if (tool.collectionSlug === collectionSlug) {
          result.push(name)
        }
      }

      for (const [name, loaded] of loadedTools.entries()) {
        if (loaded.definition.collectionSlug === collectionSlug) {
          result.push(name)
        }
      }

      return result
    },

    /**
     * Get input schema for a tool without fully loading
     */
    getInputSchema(name: string): null | z.ZodSchema<any> {
      const loaded = loadedTools.get(name)
      if (loaded) {
        return loaded.definition.inputSchema
      }

      const deferred = deferredTools.get(name)
      if (deferred) {
        return deferred.inputSchema
      }

      return null
    },

    /**
     * Unload a tool (move back to deferred if possible)
     */
    unload(name: string): boolean {
      const loaded = loadedTools.get(name)
      if (!loaded) {
        return false
      }

      // Can't unload tools that weren't deferred
      // (we don't have a loader for them)
      if (!loaded.definition.metadata?.canUnload) {
        return false
      }

      loadedTools.delete(name)
      return true
    },

    /**
     * Get usage statistics
     */
    getStats(): {
      deferredCount: number
      loadedCount: number
      mostUsed: Array<{ name: string; usageCount: number }>
      totalTools: number
    } {
      const mostUsed = Array.from(loadedTools.entries())
        .map(([name, tool]) => ({
          name,
          usageCount: tool.usageCount,
        }))
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 10)

      return {
        deferredCount: deferredTools.size,
        loadedCount: loadedTools.size,
        mostUsed,
        totalTools: deferredTools.size + loadedTools.size,
      }
    },

    /**
     * Clear all tools
     */
    clear(): void {
      deferredTools.clear()
      loadedTools.clear()
      loadingPromises.clear()
    },
  }
}

export type ToolRegistry = ReturnType<typeof createToolRegistry>

/**
 * Helper to create a deferred tool factory for collections
 */
export function createCollectionToolFactory(collectionSlug: string) {
  return {
    createFindTool(
      schema: z.ZodSchema<any>,
      loader: () => Promise<ToolDefinition['handler']>,
    ): DeferredTool {
      return {
        name: `find${toPascalCase(collectionSlug)}`,
        category: 'resource',
        collectionSlug,
        description: `Find documents in the ${collectionSlug} collection`,
        inputSchema: schema,
        loader,
        operation: 'find',
      }
    },

    createCreateTool(
      schema: z.ZodSchema<any>,
      loader: () => Promise<ToolDefinition['handler']>,
    ): DeferredTool {
      return {
        name: `create${toPascalCase(collectionSlug)}`,
        category: 'resource',
        collectionSlug,
        description: `Create a document in the ${collectionSlug} collection`,
        inputSchema: schema,
        loader,
        operation: 'create',
      }
    },

    createUpdateTool(
      schema: z.ZodSchema<any>,
      loader: () => Promise<ToolDefinition['handler']>,
    ): DeferredTool {
      return {
        name: `update${toPascalCase(collectionSlug)}`,
        category: 'resource',
        collectionSlug,
        description: `Update a document in the ${collectionSlug} collection`,
        inputSchema: schema,
        loader,
        operation: 'update',
      }
    },

    createDeleteTool(
      schema: z.ZodSchema<any>,
      loader: () => Promise<ToolDefinition['handler']>,
    ): DeferredTool {
      return {
        name: `delete${toPascalCase(collectionSlug)}`,
        category: 'resource',
        collectionSlug,
        description: `Delete a document from the ${collectionSlug} collection`,
        inputSchema: schema,
        loader,
        operation: 'delete',
      }
    },
  }
}

/**
 * Convert kebab-case or snake_case to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
}
