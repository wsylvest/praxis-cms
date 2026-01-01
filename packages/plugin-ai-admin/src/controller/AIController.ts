import type { Payload, PayloadRequest, TypedUser } from 'payload'

import { z } from 'zod'

import type {
  AICompletionResponse,
  AIMessage,
  AIProvider,
  AIStreamEvent,
  AITool,
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
  payload: Payload
  pluginConfig: PluginAIAdminConfig
}

/**
 * AI Controller - main orchestration layer for AI interactions
 */
export class AIController {
  private config: PluginAIAdminConfig
  private confirmationManager: ConfirmationManager
  private payload: Payload
  private providerManager: ProviderManager
  private securityManager: SecurityManager
  private sessionManager: SessionManager
  private toolRegistry: ToolRegistry
  private undoManager: UndoManager

  constructor({ payload, pluginConfig }: AIControllerConfig) {
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
   * Execute a single tool call
   */
  private async executeSingleToolCall(
    toolCall: { arguments: Record<string, unknown>; id: string; name: string },
    req: PayloadRequest,
    session: SessionContext
  ): Promise<ToolHandlerResult> {
    const tool = this.toolRegistry.get(toolCall.name)

    if (!tool) {
      return {
        error: `Unknown tool: ${toolCall.name}`,
        success: false,
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
        errorMessage: 'Permission denied',
        parameters: toolCall.arguments,
        result: 'denied',
        toolName: toolCall.name,
      })

      return {
        error: 'Permission denied',
        success: false,
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
          errorMessage: 'User declined confirmation',
          parameters: toolCall.arguments,
          result: 'denied',
          toolName: toolCall.name,
        })

        return {
          error: 'Action cancelled by user',
          success: false,
        }
      }
    }

    // Build tool context
    const context: ToolContext = {
      auditLogger: this.securityManager.getAuditLogger(),
      payload: this.payload,
      session,
      undoManager: this.undoManager,
      user: req.user || undefined,
    }

    // Execute tool
    try {
      const result = await tool.handler(toolCall.arguments, context)

      await this.securityManager.logAction(req, 'tool_call', {
        errorMessage: result.error,
        parameters: toolCall.arguments,
        result: result.success ? 'success' : 'error',
        toolName: toolCall.name,
      })

      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      await this.securityManager.logAction(req, 'tool_call', {
        errorMessage,
        parameters: toolCall.arguments,
        result: 'error',
        toolName: toolCall.name,
      })

      return {
        error: errorMessage,
        success: false,
      }
    }
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
        error: result.error,
        result: result.data,
        toolCallId: toolCall.id,
      })
    }

    return results
  }

  /**
   * Get user permissions
   */
  private getUserPermissions(user: TypedUser): string[] {
    const permissions: string[] = []
    const userWithRoles = user as { role?: string; roles?: string[] } & TypedUser

    if (userWithRoles.role === 'admin' || userWithRoles.roles?.includes('admin')) {
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
   * Register built-in utility tools
   */
  private registerBuiltInTools(): void {

    // Undo tool
    this.toolRegistry.register({
      name: 'undo_action',
      category: 'admin',
      description: 'Undo a previous action',
      handler: async (args, ctx) => {
        await ctx.undoManager.undo(args.actionId as string)
        return {
          message: 'Action undone successfully',
          success: true,
        }
      },
      parameters: z.object({
        actionId: z.string().describe('ID of the action to undo'),
      }),
      permissions: [],
    })

    // List undo actions tool
    this.toolRegistry.register({
      name: 'list_undo_actions',
      category: 'admin',
      description: 'List available undo actions for this session',
      handler: async (_args, ctx) => {
        const actions = await ctx.undoManager.getAvailable(ctx.session.id)
        return {
          data: actions.map((a) => ({
            id: a.id,
            description: a.description,
            expiresAt: a.expiresAt.toISOString(),
            toolName: a.toolName,
          })),
          success: true,
        }
      },
      parameters: z.object({}),
      permissions: [],
    })

    // Save as draft tool
    this.toolRegistry.register({
      name: 'save_as_draft',
      category: 'content',
      description: 'Save AI-generated content as a draft for review',
      handler: async (args, ctx) => {
        const draft = await ctx.payload.create({
          collection: 'ai-admin-drafts',
          data: {
            collection: args.collection,
            content: args.content,
            conversationId: ctx.session.conversationId,
            documentId: args.documentId,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            operation: args.documentId ? 'update' : 'create',
            prompt: 'Generated via AI',
            sessionId: ctx.session.id,
            status: 'draft',
            user: ctx.user?.id,
          },
        })

        return {
          data: { draftId: draft.id },
          message: 'Content saved as draft. Review and apply when ready.',
          success: true,
        }
      },
      parameters: z.object({
        collection: z.string().describe('Target collection'),
        content: z.record(z.any()).describe('Content to save as draft'),
        documentId: z.string().optional().describe('Document ID for updates'),
      }),
      permissions: [],
    })
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
   * Approve a pending confirmation
   */
  approveConfirmation(confirmationId: string): boolean {
    return this.confirmationManager.approve(confirmationId)
  }

  /**
   * Process a chat message
   */
  async chat(
    req: PayloadRequest,
    message: string,
    options?: {
      conversationId?: string
      provider?: AIProvider
      sessionId?: string
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
      { content: message, role: 'user' },
    ]

    // Get tools for context
    // @ts-expect-error - user type
    const userPermissions = this.getUserPermissions(req.user)
    const { tools } = this.toolRegistry.getOptimized(
      session,
      userPermissions,
      50000 // Max tokens for tools
    )

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(session, tools)

    // Get completion
    const response = await this.providerManager.complete(
      {
        maxTokens: 4096,
        messages,
        systemPrompt,
        tools,
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
        content: response.content,
        role: 'assistant',
        toolCalls: response.toolCalls,
      })
      messages.push({
        content: '',
        role: 'user',
        toolResults,
      })

      const finalResponse = await this.providerManager.complete(
        {
          maxTokens: 4096,
          messages,
          systemPrompt,
          tools,
        },
        options?.provider
      )

      // Log action
      await this.securityManager.logAction(req, 'chat', {
        responseTimeMs: Date.now() - startTime,
        result: 'success',
        tokensUsed: (response.usage?.inputTokens || 0) +
          (response.usage?.outputTokens || 0) +
          (finalResponse.usage?.inputTokens || 0) +
          (finalResponse.usage?.outputTokens || 0),
      })

      return finalResponse
    }

    // Log action
    await this.securityManager.logAction(req, 'chat', {
      responseTimeMs: Date.now() - startTime,
      result: 'success',
      tokensUsed: (response.usage?.inputTokens || 0) +
        (response.usage?.outputTokens || 0),
    })

    return response
  }

  /**
   * Deny a pending confirmation
   */
  denyConfirmation(confirmationId: string): boolean {
    return this.confirmationManager.deny(confirmationId)
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    await this.securityManager.destroy()
    this.sessionManager.destroy()
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
   * Stream a chat response
   */
  async *streamChat(
    req: PayloadRequest,
    message: string,
    options?: {
      conversationId?: string
      provider?: AIProvider
      sessionId?: string
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
      { content: message, role: 'user' },
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
        maxTokens: 4096,
        messages,
        systemPrompt,
        tools,
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
            error: result.error,
            result: result.data,
            toolCallId: event.toolCall.id,
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
   * Update session context
   */
  updateSession(
    sessionId: string,
    updates: Parameters<SessionManager['update']>[1]
  ) {
    return this.sessionManager.update(sessionId, updates)
  }
}

/**
 * Create AI controller
 */
export function createAIController(config: AIControllerConfig): AIController {
  return new AIController(config)
}
