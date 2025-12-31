import type { Payload, PayloadRequest, TypedUser } from 'payload'

import type {
  AICompletionResponse,
  AIMessage,
  AIProvider,
  AIStreamEvent,
  AITool,
  AuditLogger,
  PluginAIAdminConfig,
  SessionContext,
  ToolContext,
  ToolHandlerResult,
  UndoManager,
} from '../types/index.js'
import { SecurityManager } from '../middleware/index.js'
import { ProviderManager } from '../providers/index.js'
import { createCollectionTools, ToolRegistry } from '../tools/registry.js'
import { ConfirmationManager } from '../utils/confirmationManager.js'
import { SessionManager } from '../utils/sessionManager.js'
import { createUndoManager } from '../utils/undoManager.js'

export interface AIControllerConfig {
  pluginConfig: PluginAIAdminConfig
  payload: Payload
}

/**
 * AI Controller - main orchestration layer for AI interactions
 */
export class AIController {
  private providerManager: ProviderManager
  private securityManager: SecurityManager
  private sessionManager: SessionManager
  private confirmationManager: ConfirmationManager
  private toolRegistry: ToolRegistry
  private undoManager: UndoManager
  private payload: Payload
  private config: PluginAIAdminConfig

  constructor({ pluginConfig, payload }: AIControllerConfig) {
    this.config = pluginConfig
    this.payload = payload

    // Initialize provider manager
    this.providerManager = new ProviderManager(
      pluginConfig.providers,
      pluginConfig.defaultProvider
    )

    // Initialize security
    this.securityManager = new SecurityManager(pluginConfig.security, payload)

    // Initialize session manager
    this.sessionManager = new SessionManager()

    // Initialize confirmation manager
    this.confirmationManager = new ConfirmationManager(pluginConfig.confirmation)

    // Initialize undo manager
    this.undoManager = createUndoManager(payload, pluginConfig.undo)

    // Initialize tool registry
    this.toolRegistry = new ToolRegistry()
    this.registerTools()
  }

  /**
   * Register all tools
   */
  private registerTools(): void {
    // Register collection tools
    if (this.config.collections) {
      for (const [slug, collectionConfig] of Object.entries(this.config.collections)) {
        if (collectionConfig && collectionConfig.enabled) {
          const tools = createCollectionTools(slug, collectionConfig, collectionConfig.description)
          this.toolRegistry.registerMany(tools)
        }
      }
    }

    // Register custom tools
    if (this.config.tools) {
      this.toolRegistry.registerMany(this.config.tools)
    }

    // Register built-in utility tools
    this.registerBuiltInTools()
  }

  /**
   * Register built-in utility tools
   */
  private registerBuiltInTools(): void {
    const { z } = require('zod')

    // Undo tool
    this.toolRegistry.register({
      name: 'undo_action',
      category: 'admin',
      description: 'Undo a previous action',
      parameters: z.object({
        actionId: z.string().describe('ID of the action to undo'),
      }),
      permissions: [],
      handler: async (args, ctx) => {
        await ctx.undoManager.undo(args.actionId as string)
        return {
          success: true,
          message: 'Action undone successfully',
        }
      },
    })

    // List undo actions tool
    this.toolRegistry.register({
      name: 'list_undo_actions',
      category: 'admin',
      description: 'List available undo actions for this session',
      parameters: z.object({}),
      permissions: [],
      handler: async (_args, ctx) => {
        const actions = await ctx.undoManager.getAvailable(ctx.session.id)
        return {
          success: true,
          data: actions.map((a) => ({
            id: a.id,
            description: a.description,
            toolName: a.toolName,
            expiresAt: a.expiresAt.toISOString(),
          })),
        }
      },
    })

    // Save as draft tool
    this.toolRegistry.register({
      name: 'save_as_draft',
      category: 'content',
      description: 'Save AI-generated content as a draft for review',
      parameters: z.object({
        collection: z.string().describe('Target collection'),
        content: z.record(z.any()).describe('Content to save as draft'),
        documentId: z.string().optional().describe('Document ID for updates'),
      }),
      permissions: [],
      handler: async (args, ctx) => {
        const draft = await ctx.payload.create({
          collection: 'ai-admin-drafts',
          data: {
            user: ctx.user.id,
            sessionId: ctx.session.id,
            conversationId: ctx.session.conversationId,
            collection: args.collection,
            documentId: args.documentId,
            operation: args.documentId ? 'update' : 'create',
            content: args.content,
            prompt: 'Generated via AI',
            status: 'draft',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
        })

        return {
          success: true,
          data: { draftId: draft.id },
          message: 'Content saved as draft. Review and apply when ready.',
        }
      },
    })
  }

  /**
   * Process a chat message
   */
  async chat(
    req: PayloadRequest,
    message: string,
    options?: {
      sessionId?: string
      conversationId?: string
      provider?: AIProvider
      stream?: boolean
    }
  ): Promise<AICompletionResponse> {
    const startTime = Date.now()

    // Security check
    const securityCheck = await this.securityManager.check(req)
    if (!securityCheck.allowed) {
      throw new Error(securityCheck.reason || 'Access denied')
    }

    // Get or create session
    const session = this.sessionManager.getOrCreate(
      options?.sessionId,
      // @ts-expect-error - user type
      req.user.id,
      { conversationId: options?.conversationId }
    )

    // Build messages
    const messages: AIMessage[] = [
      { role: 'user', content: message },
    ]

    // Get tools for context
    // @ts-expect-error - user type
    const userPermissions = this.getUserPermissions(req.user)
    const { tools, estimatedTokens } = this.toolRegistry.getOptimized(
      session,
      userPermissions,
      50000 // Max tokens for tools
    )

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(session, tools)

    // Get completion
    const response = await this.providerManager.complete(
      {
        messages,
        tools,
        systemPrompt,
        maxTokens: 4096,
      },
      options?.provider
    )

    // Handle tool calls
    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolResults = await this.executeToolCalls(
        response.toolCalls,
        req,
        session
      )

      // Add tool results to messages and get final response
      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      })
      messages.push({
        role: 'user',
        content: '',
        toolResults,
      })

      const finalResponse = await this.providerManager.complete(
        {
          messages,
          tools,
          systemPrompt,
          maxTokens: 4096,
        },
        options?.provider
      )

      // Log action
      await this.securityManager.logAction(req, 'chat', {
        result: 'success',
        tokensUsed: (response.usage?.inputTokens || 0) +
          (response.usage?.outputTokens || 0) +
          (finalResponse.usage?.inputTokens || 0) +
          (finalResponse.usage?.outputTokens || 0),
        responseTimeMs: Date.now() - startTime,
      })

      return finalResponse
    }

    // Log action
    await this.securityManager.logAction(req, 'chat', {
      result: 'success',
      tokensUsed: (response.usage?.inputTokens || 0) +
        (response.usage?.outputTokens || 0),
      responseTimeMs: Date.now() - startTime,
    })

    return response
  }

  /**
   * Stream a chat response
   */
  async *streamChat(
    req: PayloadRequest,
    message: string,
    options?: {
      sessionId?: string
      conversationId?: string
      provider?: AIProvider
    }
  ): AsyncGenerator<AIStreamEvent, void, unknown> {
    // Security check
    const securityCheck = await this.securityManager.check(req)
    if (!securityCheck.allowed) {
      yield { type: 'error', error: securityCheck.reason || 'Access denied' }
      return
    }

    // Get or create session
    const session = this.sessionManager.getOrCreate(
      options?.sessionId,
      // @ts-expect-error - user type
      req.user.id,
      { conversationId: options?.conversationId }
    )

    // Build messages
    const messages: AIMessage[] = [
      { role: 'user', content: message },
    ]

    // Get tools for context
    // @ts-expect-error - user type
    const userPermissions = this.getUserPermissions(req.user)
    const { tools } = this.toolRegistry.getOptimized(session, userPermissions)

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(session, tools)

    // Stream response
    const stream = this.providerManager.stream(
      {
        messages,
        tools,
        systemPrompt,
        maxTokens: 4096,
      },
      options?.provider
    )

    for await (const event of stream) {
      // Handle tool calls
      if (event.type === 'tool_use' && event.toolCall) {
        yield event

        // Execute the tool
        const result = await this.executeSingleToolCall(
          event.toolCall,
          req,
          session
        )

        yield {
          type: 'tool_result',
          toolResult: {
            toolCallId: event.toolCall.id,
            result: result.data,
            error: result.error,
          },
        }
      } else {
        yield event
      }
    }

    // Log action
    await this.securityManager.logAction(req, 'chat_stream', {
      result: 'success',
    })
  }

  /**
   * Execute tool calls
   */
  private async executeToolCalls(
    toolCalls: NonNullable<AICompletionResponse['toolCalls']>,
    req: PayloadRequest,
    session: SessionContext
  ): Promise<NonNullable<AIMessage['toolResults']>> {
    const results: NonNullable<AIMessage['toolResults']> = []

    for (const toolCall of toolCalls) {
      const result = await this.executeSingleToolCall(toolCall, req, session)
      results.push({
        toolCallId: toolCall.id,
        result: result.data,
        error: result.error,
      })
    }

    return results
  }

  /**
   * Execute a single tool call
   */
  private async executeSingleToolCall(
    toolCall: { id: string; name: string; arguments: Record<string, unknown> },
    req: PayloadRequest,
    session: SessionContext
  ): Promise<ToolHandlerResult> {
    const tool = this.toolRegistry.get(toolCall.name)

    if (!tool) {
      return {
        success: false,
        error: `Unknown tool: ${toolCall.name}`,
      }
    }

    // Check permissions
    // @ts-expect-error - user type
    const userPermissions = this.getUserPermissions(req.user)
    const hasPermission = tool.permissions.every((p) =>
      userPermissions.includes(p) ||
      userPermissions.includes('admin') ||
      userPermissions.includes('*')
    )

    if (!hasPermission) {
      await this.securityManager.logAction(req, 'tool_call', {
        toolName: toolCall.name,
        parameters: toolCall.arguments,
        result: 'denied',
        errorMessage: 'Permission denied',
      })

      return {
        success: false,
        error: 'Permission denied',
      }
    }

    // Handle confirmation if required
    if (tool.confirmationRequired) {
      const message = ConfirmationManager.generateMessage(
        toolCall.name,
        toolCall.arguments
      )

      const approved = await this.confirmationManager.requestConfirmation(
        session.id,
        toolCall.name,
        toolCall.arguments,
        message
      )

      if (!approved) {
        await this.securityManager.logAction(req, 'tool_call', {
          toolName: toolCall.name,
          parameters: toolCall.arguments,
          result: 'denied',
          errorMessage: 'User declined confirmation',
        })

        return {
          success: false,
          error: 'Action cancelled by user',
        }
      }
    }

    // Build tool context
    const context: ToolContext = {
      payload: this.payload,
      // @ts-expect-error - user type
      user: req.user,
      session,
      undoManager: this.undoManager,
      auditLogger: this.securityManager.getAuditLogger(),
    }

    // Execute tool
    try {
      const result = await tool.handler(toolCall.arguments, context)

      await this.securityManager.logAction(req, 'tool_call', {
        toolName: toolCall.name,
        parameters: toolCall.arguments,
        result: result.success ? 'success' : 'error',
        errorMessage: result.error,
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      await this.securityManager.logAction(req, 'tool_call', {
        toolName: toolCall.name,
        parameters: toolCall.arguments,
        result: 'error',
        errorMessage,
      })

      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  /**
   * Build system prompt with context
   */
  private buildSystemPrompt(session: SessionContext, tools: AITool[]): string {
    const parts: string[] = [
      'You are an AI assistant for the Payload CMS admin panel.',
      'You help users manage content, configure the CMS, and perform administrative tasks.',
      '',
      'Available capabilities:',
    ]

    // Group tools by category
    const byCategory = new Map<string, string[]>()
    for (const tool of tools) {
      const list = byCategory.get(tool.category) || []
      list.push(`- ${tool.name}: ${tool.description}`)
      byCategory.set(tool.category, list)
    }

    for (const [category, toolList] of byCategory) {
      parts.push(`\n${category.toUpperCase()}:`)
      parts.push(...toolList)
    }

    // Add context
    if (session.currentCollection) {
      parts.push(`\nCurrent collection: ${session.currentCollection}`)
    }
    if (session.selectedDocuments && session.selectedDocuments.length > 0) {
      parts.push(`Selected documents: ${session.selectedDocuments.join(', ')}`)
    }

    parts.push('')
    parts.push('Guidelines:')
    parts.push('- Always confirm destructive actions before executing')
    parts.push('- Use save_as_draft when generating content for user review')
    parts.push('- Be concise and helpful in responses')
    parts.push('- If unsure, ask for clarification')

    return parts.join('\n')
  }

  /**
   * Get user permissions
   */
  private getUserPermissions(user: TypedUser): string[] {
    const permissions: string[] = []

    if ((user as any).role === 'admin' || (user as any).roles?.includes('admin')) {
      permissions.push('admin')
    }

    // Add collection permissions based on Payload access control
    // This is simplified - in production you'd check actual access functions
    for (const [slug] of Object.entries(this.config.collections || {})) {
      permissions.push(`${slug}:read`)
      permissions.push(`${slug}:create`)
      permissions.push(`${slug}:update`)
      permissions.push(`${slug}:delete`)
    }

    return permissions
  }

  /**
   * Approve a pending confirmation
   */
  approveConfirmation(confirmationId: string): boolean {
    return this.confirmationManager.approve(confirmationId)
  }

  /**
   * Deny a pending confirmation
   */
  denyConfirmation(confirmationId: string): boolean {
    return this.confirmationManager.deny(confirmationId)
  }

  /**
   * Get pending confirmations for a session
   */
  getPendingConfirmations(sessionId: string) {
    return this.confirmationManager.getPending(sessionId)
  }

  /**
   * Get session
   */
  getSession(sessionId: string) {
    return this.sessionManager.get(sessionId)
  }

  /**
   * Update session context
   */
  updateSession(
    sessionId: string,
    updates: Parameters<SessionManager['update']>[1]
  ) {
    return this.sessionManager.update(sessionId, updates)
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    await this.securityManager.destroy()
    this.sessionManager.destroy()
  }
}

/**
 * Create AI controller
 */
export function createAIController(config: AIControllerConfig): AIController {
  return new AIController(config)
}
