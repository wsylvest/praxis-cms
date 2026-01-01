import type { CollectionConfig, CollectionSlug, PayloadRequest, TypedUser } from 'payload'
import type { z } from 'zod'

// =============================================================================
// AI Provider Types
// =============================================================================

export type AIProvider = 'claude' | 'gemini' | 'grok' | 'ollama' | 'openai'

export interface AIProviderConfig {
  apiKey?: string
  baseURL?: string
  maxTokens?: number
  model?: string
  provider: AIProvider
  temperature?: number
}

export interface AIMessage {
  content: string
  role: 'assistant' | 'system' | 'user'
  toolCalls?: AIToolCall[]
  toolResults?: AIToolResult[]
}

export interface AIToolCall {
  arguments: Record<string, unknown>
  id: string
  name: string
}

export interface AIToolResult {
  error?: string
  result: unknown
  toolCallId: string
}

export interface AIStreamEvent {
  content?: string
  error?: string
  toolCall?: AIToolCall
  toolResult?: AIToolResult
  type: 'complete' | 'error' | 'text_delta' | 'tool_result' | 'tool_use'
}

export interface AICompletionOptions {
  maxTokens?: number
  messages: AIMessage[]
  stream?: boolean
  systemPrompt?: string
  temperature?: number
  tools?: AITool[]
}

export interface AICompletionResponse {
  content: string
  stopReason?: 'end_turn' | 'error' | 'max_tokens' | 'tool_use'
  toolCalls?: AIToolCall[]
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

// =============================================================================
// Tool Types
// =============================================================================

export type ToolCategory =
  | 'admin'
  | 'analytics'
  | 'config'
  | 'content'
  | 'media'
  | 'workflow'

export interface AITool {
  category: ToolCategory
  confirmationRequired?: boolean
  deferLoading?: boolean
  description: string
  handler: ToolHandler
  name: string
  parameters: z.ZodObject<z.ZodRawShape>
  permissions: string[]
  undoable?: boolean
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolHandlerResult>

export interface ToolContext {
  auditLogger: AuditLogger
  payload: PayloadRequest['payload']
  session: SessionContext
  undoManager: UndoManager
  user?: TypedUser
}

export interface ToolHandlerResult {
  data?: unknown
  error?: string
  message?: string
  success: boolean
  undoAction?: UndoAction
}

// =============================================================================
// Session & Context Types
// =============================================================================

export interface SessionContext {
  conversationId?: string
  createdAt: Date
  currentCollection?: CollectionSlug
  expiresAt: Date
  id: string
  metadata?: Record<string, unknown>
  selectedDocuments?: string[]
  userId: string
}

export interface ConversationContext {
  createdAt: Date
  id: string
  messages: AIMessage[]
  sessionId: string
  toolHistory: ToolExecutionRecord[]
  updatedAt: Date
  userId: string
}

export interface ToolExecutionRecord {
  arguments: Record<string, unknown>
  id: string
  result: ToolHandlerResult
  timestamp: Date
  toolName: string
  undoable: boolean
  undoExpires?: Date
}

// =============================================================================
// Undo/Rollback Types
// =============================================================================

export interface UndoAction {
  description: string
  expiresAt: Date
  id: string
  previousState: unknown
  reverseOperation: () => Promise<void>
  toolName: string
}

export interface UndoManager {
  cleanup(): Promise<void>
  getAvailable(sessionId: string): Promise<UndoAction[]>
  save(action: Omit<UndoAction, 'id'>): Promise<string>
  undo(actionId: string): Promise<void>
}

// =============================================================================
// Security Types
// =============================================================================

export interface RateLimitConfig {
  keyGenerator?: (req: PayloadRequest) => string
  maxRequests: number
  maxTokensPerWindow?: number
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
  retryAfter?: number
}

export interface AuditLogEntry {
  action: string
  errorMessage?: string
  id: string
  ipAddress?: string
  parameters?: Record<string, unknown>
  responseTimeMs?: number
  result: 'denied' | 'error' | 'pending' | 'success'
  sessionId: string
  timestamp: Date
  tokensUsed?: number
  toolName?: string
  userAgent?: string
  userId: string
}

export interface AuditLogger {
  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void>
  query(filters: AuditQueryFilters): Promise<AuditLogEntry[]>
}

export interface AuditQueryFilters {
  action?: string
  endDate?: Date
  limit?: number
  offset?: number
  result?: AuditLogEntry['result']
  sessionId?: string
  startDate?: Date
  toolName?: string
  userId?: string
}

export interface IPAllowlistConfig {
  allowedCIDRs?: string[]
  allowedIPs?: string[]
  denyByDefault?: boolean
  enabled: boolean
}

// =============================================================================
// Confirmation Types
// =============================================================================

export type ConfirmationLevel = 'email' | 'inline' | 'modal' | 'none' | 'webhook'

export interface ConfirmationConfig {
  bulkOperations: ConfirmationLevel
  configChanges: ConfirmationLevel
  defaultLevel: ConfirmationLevel
  destructiveActions: ConfirmationLevel
  timeoutSeconds: number
}

export interface PendingConfirmation {
  arguments: Record<string, unknown>
  createdAt: Date
  expiresAt: Date
  id: string
  level: ConfirmationLevel
  message: string
  sessionId: string
  status: 'approved' | 'denied' | 'expired' | 'pending'
  toolName: string
}

// =============================================================================
// Draft Storage Types
// =============================================================================

export interface AIGeneratedDraft {
  collection: CollectionSlug
  content: Record<string, unknown>
  conversationId: string
  createdAt: Date
  documentId?: string
  expiresAt: Date
  id: string
  prompt: string
  sessionId: string
  status: 'applied' | 'discarded' | 'draft'
}

// =============================================================================
// Plugin Configuration Types
// =============================================================================

export interface PluginAIAdminConfig {
  /** Admin UI configuration */
  admin?: {
    chatPosition?: 'drawer' | 'modal' | 'sidebar'
    defaultOpen?: boolean
    showInNav?: boolean
  }

  /** Collections to enable AI tools for */
  collections?: Partial<Record<CollectionSlug, CollectionAIConfig>>

  /** Confirmation settings */
  confirmation?: ConfirmationConfig

  /** Default provider to use */
  defaultProvider: AIProvider

  /** Enable/disable the plugin */
  enabled?: boolean

  /** Override collections */
  overrideCollections?: {
    auditLogs?: (config: CollectionConfig) => CollectionConfig
    conversations?: (config: CollectionConfig) => CollectionConfig
    drafts?: (config: CollectionConfig) => CollectionConfig
  }

  /** AI provider configurations */
  providers: AIProviderConfig[]

  /** Security configuration */
  security?: {
    ipAllowlist?: IPAllowlistConfig
    rateLimit?: RateLimitConfig
    requireAuth?: boolean
  }

  /** Streaming configuration */
  streaming?: {
    enabled?: boolean
    heartbeatIntervalMs?: number
  }

  /** Custom tools to add */
  tools?: AITool[]

  /** Undo settings */
  undo?: {
    enabled?: boolean
    retentionHours?: number
  }
}

export interface CollectionAIConfig {
  description?: string
  enabled: {
    create?: boolean
    delete?: boolean
    read?: boolean
    update?: boolean
  } | boolean
  excludeFields?: string[]
  generateFields?: string[]
}

// =============================================================================
// Component Props Types
// =============================================================================

export interface AIChatPanelProps {
  defaultOpen?: boolean
  onClose?: () => void
  position?: 'drawer' | 'modal' | 'sidebar'
}

export interface AIMessageProps {
  isStreaming?: boolean
  message: AIMessage
}

export interface ConfirmationDialogProps {
  confirmation: PendingConfirmation
  onApprove: () => void
  onDeny: () => void
}

export interface UndoToastProps {
  action: UndoAction
  onDismiss: () => void
  onUndo: () => void
}
