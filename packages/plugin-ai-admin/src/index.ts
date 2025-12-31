import type { Config } from 'payload'

import type { PluginAIAdminConfig } from './types/index.js'

import {
  createAuditLogsCollection,
  createConversationsCollection,
  createDraftsCollection,
  createSettingsGlobal,
  createUndoActionsCollection,
} from './collections/index.js'
import { createAIController } from './controller/AIController.js'
import {
  createChatEndpoint,
  createConfirmationEndpoint,
  createSessionEndpoint,
  createStreamingChatEndpoint,
} from './endpoints/index.js'

export * from './types/index.js'
export { ProviderManager, ClaudeProvider, OpenAIProvider, GeminiProvider } from './providers/index.js'
export { SecurityManager, RateLimiter, createAuditLogger } from './middleware/index.js'
export { ToolRegistry, createCollectionTools } from './tools/registry.js'
export { createAIController, AIController } from './controller/AIController.js'
export { SessionManager, ConfirmationManager, createUndoManager } from './utils/index.js'


// Singleton controller reference
let controllerInstance: ReturnType<typeof createAIController> | null = null

/**
 * AI Admin Plugin for Payload CMS
 *
 * Provides a multi-model AI chat interface in the admin panel with:
 * - Support for Claude, OpenAI, Gemini, and Grok
 * - Rate limiting, audit logging, and IP allowlisting
 * - Undo/rollback for AI actions
 * - Human-in-the-loop confirmations for destructive actions
 * - Context-aware tool loading to minimize token usage
 * - Streaming responses
 * - Draft storage for AI-generated content
 *
 * @example
 * ```ts
 * import { buildConfig } from 'payload'
 * import { aiAdminPlugin } from '@payloadcms/plugin-ai-admin'
 *
 * export default buildConfig({
 *   plugins: [
 *     aiAdminPlugin({
 *       providers: [
 *         { provider: 'claude', apiKey: process.env.ANTHROPIC_API_KEY },
 *         { provider: 'openai', apiKey: process.env.OPENAI_API_KEY },
 *       ],
 *       defaultProvider: 'claude',
 *       collections: {
 *         posts: { enabled: true, description: 'Blog posts' },
 *         pages: { enabled: true, description: 'Static pages' },
 *       },
 *     }),
 *   ],
 * })
 * ```
 */
export const aiAdminPlugin =
  (pluginConfig: PluginAIAdminConfig) =>
  (config: Config): Config => {
    // Initialize collections array if not present
    if (!config.collections) {
      config.collections = []
    }

    // Initialize globals array if not present
    if (!config.globals) {
      config.globals = []
    }

    // Initialize endpoints array if not present
    if (!config.endpoints) {
      config.endpoints = []
    }

    // Add plugin collections
    config.collections.push(
      pluginConfig.overrideCollections?.conversations
        ? pluginConfig.overrideCollections.conversations(createConversationsCollection())
        : createConversationsCollection()
    )

    config.collections.push(
      pluginConfig.overrideCollections?.auditLogs
        ? pluginConfig.overrideCollections.auditLogs(createAuditLogsCollection())
        : createAuditLogsCollection()
    )

    config.collections.push(
      pluginConfig.overrideCollections?.drafts
        ? pluginConfig.overrideCollections.drafts(createDraftsCollection())
        : createDraftsCollection()
    )

    config.collections.push(createUndoActionsCollection())

    // Add settings global
    config.globals.push(createSettingsGlobal())

    // If plugin is disabled, return config without endpoints
    if (pluginConfig.enabled === false) {
      return config
    }

    // Add onInit hook to initialize controller
    const existingOnInit = config.onInit
    config.onInit = async (payload) => {
      // Call existing onInit if present
      if (existingOnInit) {
        await existingOnInit(payload)
      }

      // Initialize AI controller
      controllerInstance = createAIController({
        pluginConfig,
        payload,
      })

      payload.logger.info('[ai-admin] Plugin initialized')
    }

    // Add endpoints
    config.endpoints.push(
      {
        path: '/ai/chat',
        method: 'post',
        handler: async (req) => {
          if (!controllerInstance) {
            return Response.json(
              { error: 'AI controller not initialized' },
              { status: 500 }
            )
          }
          return createChatEndpoint(controllerInstance)(req)
        },
      },
      {
        path: '/ai/chat/stream',
        method: 'post',
        handler: async (req) => {
          if (!controllerInstance) {
            return Response.json(
              { error: 'AI controller not initialized' },
              { status: 500 }
            )
          }
          return createStreamingChatEndpoint(controllerInstance)(req)
        },
      },
      {
        path: '/ai/confirmation',
        method: 'post',
        handler: async (req) => {
          if (!controllerInstance) {
            return Response.json(
              { error: 'AI controller not initialized' },
              { status: 500 }
            )
          }
          return createConfirmationEndpoint(controllerInstance)(req)
        },
      },
      {
        path: '/ai/session',
        method: 'get',
        handler: async (req) => {
          if (!controllerInstance) {
            return Response.json(
              { error: 'AI controller not initialized' },
              { status: 500 }
            )
          }
          return createSessionEndpoint(controllerInstance)(req)
        },
      },
      {
        path: '/ai/session',
        method: 'patch',
        handler: async (req) => {
          if (!controllerInstance) {
            return Response.json(
              { error: 'AI controller not initialized' },
              { status: 500 }
            )
          }
          return createSessionEndpoint(controllerInstance)(req)
        },
      }
    )

    // Add admin components if enabled
    if (pluginConfig.admin?.showInNav !== false) {
      // Add custom admin components via config
      if (!config.admin) {
        config.admin = {}
      }

      if (!config.admin.components) {
        config.admin.components = {}
      }

      // Add AI chat provider and components
      // Note: In production, these would be actual React components
      // that need to be bundled separately for client-side use
    }

    return config
  }

/**
 * Get the AI controller instance
 * Useful for custom integrations
 */
export function getAIController(): ReturnType<typeof createAIController> | null {
  return controllerInstance
}

// Default export
export default aiAdminPlugin
