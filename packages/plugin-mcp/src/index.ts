import type { Config } from 'payload'

import type { MCPAccessSettings, PluginMCPServerConfig, SecurityConfig } from './types.js'

import { createAPIKeysCollection } from './collections/createApiKeysCollection.js'
import { createAuditLogsCollection } from './collections/createAuditLogsCollection.js'
import { createConfirmationsCollection } from './collections/createConfirmationsCollection.js'
import { createUndoStoreCollection } from './collections/createUndoStoreCollection.js'
import { initializeMCPHandler } from './endpoints/mcp.js'
import { createStreamingEndpoint } from './endpoints/streaming.js'
import { getEnhancedApiKeyFields } from './middleware/apiKeyEnhancements.js'

declare module 'payload' {
  export interface PayloadRequest {
    payloadAPI: 'GraphQL' | 'local' | 'MCP' | 'REST'
  }
}

export type { MCPAccessSettings, SecurityConfig }

export { streamManager } from './endpoints/streaming.js'
export type { StreamEvent, StreamManager, StreamSession } from './endpoints/streaming.js'
export { createCollectionToolFactory, createToolRegistry } from './mcp/toolRegistry.js'
export type { DeferredTool, ToolContext, ToolDefinition, ToolRegistry } from './mcp/toolRegistry.js'
export { createApiKeyManager } from './middleware/apiKeyEnhancements.js'
export type { ApiKeyManager } from './middleware/apiKeyEnhancements.js'
export { createAuditLogger } from './middleware/auditLogger.js'
export type { AuditLogger } from './middleware/auditLogger.js'
export { createConfirmationManager } from './middleware/confirmationManager.js'
export type { ConfirmationManager } from './middleware/confirmationManager.js'
// Export middleware utilities for advanced usage
export { createRateLimiter, getRateLimitHeaders } from './middleware/rateLimiter.js'
export type { RateLimiter, RateLimitResult } from './middleware/rateLimiter.js'
export { createUndoManager } from './middleware/undoManager.js'
export type { UndoManager } from './middleware/undoManager.js'
/**
 * The MCP Plugin for Payload. This plugin allows you to add MCP capabilities to your Payload project.
 *
 * @param pluginOptions - The options for the MCP plugin.
 * @experimental This plugin is experimental and may change in the future.
 */
export const mcpPlugin =
  (pluginOptions: PluginMCPServerConfig) =>
  (config: Config): Config => {
    if (!config.collections) {
      config.collections = []
    }

    // Collections
    const collections = pluginOptions.collections || {}
    // Extract custom tools for the global config
    const customTools =
      pluginOptions.mcp?.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
      })) || []

    const experimentalTools = pluginOptions?.experimental?.tools || {}

    /**
     * API Keys
     * --------
     * High resolution control over MCP capabilities is crucial when using Payload with LLMs.
     *
     * This API Keys collection has ways for admins to create API keys and allow or disallow the MCP capabilities.
     * This is useful when Admins want to allow or disallow the use of the MCP capabilities in real time.
     * For example:
     *  - If a collection has all of its capabilities enabled, admins can allow or disallow the create, update, delete, and find capabilities on that collection.
     *  - If a collection only has the find capability enabled, admins can only allow or disallow the find capability on that collection.
     *  - If a custom tool has gone haywire, admins can disallow that tool.
     *
     */
    // Get security configuration
    const securityConfig = pluginOptions.security || {}

    // Create API key collection with optional enhancements
    let apiKeyCollection = createAPIKeysCollection(
      collections,
      customTools,
      experimentalTools,
      pluginOptions,
    )

    // Add enhanced API key fields if enabled
    if (securityConfig.apiKeyEnhancements) {
      const enhancedFields = getEnhancedApiKeyFields(securityConfig.apiKeyEnhancements)
      apiKeyCollection = {
        ...apiKeyCollection,
        fields: [...apiKeyCollection.fields, ...enhancedFields],
      }
    }

    if (pluginOptions.overrideApiKeyCollection) {
      config.collections.push(pluginOptions.overrideApiKeyCollection(apiKeyCollection))
    } else {
      config.collections.push(apiKeyCollection)
    }

    // Add audit logs collection if audit logging is enabled
    if (securityConfig.auditLogging?.enabled !== false) {
      config.collections.push(createAuditLogsCollection())
    }

    // Add confirmations collection if confirmations are enabled
    if (securityConfig.confirmations?.enabled) {
      config.collections.push(createConfirmationsCollection())
    }

    // Add undo store collection if undo is enabled
    if (securityConfig.undo?.enabled !== false) {
      config.collections.push(createUndoStoreCollection())
    }

    /**
     * If the plugin is disabled, we still want to keep added collections/fields so the database schema is consistent which is important for migrations.
     * If your plugin heavily modifies the database schema, you may want to remove this property.
     */
    if (pluginOptions.disabled) {
      return config
    }

    if (!config.endpoints) {
      config.endpoints = []
    }

    /**
     * This is the primary MCP Server Endpoint.
     * Payload will automatically add the /api prefix to the path, so the full path is `/api/mcp`
     * NOTE: This is only transport method until we add full support for SSE which will be another endpoint at `/api/sse`
     */
    config.endpoints.push({
      handler: initializeMCPHandler(pluginOptions),
      method: 'post',
      path: '/mcp',
    })

    /**
     * The GET response is always: {"jsonrpc":"2.0","error":{"code":-32000,"message":"Method not allowed."},"id":null} -- even with an API key
     * This is expected behavior and MCP clients should always use the POST endpoint.
     */
    config.endpoints.push({
      handler: initializeMCPHandler(pluginOptions),
      method: 'get',
      path: '/mcp',
    })

    /**
     * Streaming endpoint for real-time feedback during MCP operations.
     * Uses Server-Sent Events (SSE) for progress updates, confirmations, and undo notifications.
     */
    if (securityConfig.streaming?.enabled !== false) {
      config.endpoints.push({
        handler: createStreamingEndpoint(),
        method: 'get',
        path: '/mcp/stream',
      })
    }

    return config
  }
