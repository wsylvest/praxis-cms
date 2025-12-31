import type { CollectionConfig, CollectionSlug, PayloadRequest, TypedUser } from 'payload'
import type { z } from 'zod'

// =============================================================================
// AI Provider Types
// =============================================================================

export type AIProvider = 'claude' | 'openai' | 'gemini' | 'grok' | 'ollama'

export interface AIProviderConfig {
  provider: AIProvider
  apiKey?: string
  baseURL?: string
  model?: string
  maxTokens?: number
  temperature?: number
}

export interface AIMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: AIToolCall[]
  toolResults?: AIToolResult[]
}

export interface AIToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface AIToolResult {
  toolCallId: string
  result: unknown
  error?: string
}

export interface AIStreamEvent {
  type: 'text_delta' | 'tool_use' | 'tool_result' | 'complete' | 'error'
  content?: string
  toolCall?: AIToolCall
  toolResult?: AIToolResult
  error?: string
}

export interface AICompletionOptions {
  messages: AIMessage[]
  tools?: AITool[]
  stream?: boolean
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
}

export interface AICompletionResponse {
  content: string
  toolCalls?: AIToolCall[]
  usage?: {
    inputTokens: number
    outputTokens: number
  }
  stopReason?: 'end_turn' | 'tool_use' | 'max_tokens' | 'error'
}

// =============================================================================
// Tool Types
// =============================================================================

export type ToolCategory =
  | 'content'
  | 'media'
  | 'config'
  | 'analytics'
  | 'workflow'
  | 'admin'

export interface AITool {
  name: string
  category: ToolCategory
  description: string
  parameters: z.ZodObject<z.ZodRawShape>
  permissions: string[]
  confirmationRequired?: boolean
  undoable?: boolean
  deferLoading?: boolean
  handler: ToolHandler
}

export type ToolHandler = (
  args: Record<string, unknown>,
  context: ToolContext
) => Promise<ToolHandlerResult>

export interface ToolContext {
  payload: PayloadRequest['payload']
  user: TypedUser
  session: SessionContext
  undoManager: UndoManager
  auditLogger: AuditLogger
}

export interface ToolHandlerResult {
  success: boolean
  data?: unknown
  message?: string
  error?: string
  undoAction?: UndoAction
}

// =============================================================================
// Session & Context Types
// =============================================================================

export interface SessionContext {
  id: string
  userId: string
  currentCollection?: CollectionSlug
  selectedDocuments?: string[]
  conversationId?: string
  metadata?: Record<string, unknown>
  createdAt: Date
  expiresAt: Date
}

export interface ConversationContext {
  id: string
  sessionId: string
  userId: string
  messages: AIMessage[]
  toolHistory: ToolExecutionRecord[]
  createdAt: Date
  updatedAt: Date
}

export interface ToolExecutionRecord {
  id: string
  toolName: string
  arguments: Record<string, unknown>
  result: ToolHandlerResult
  timestamp: Date
  undoable: boolean
  undoExpires?: Date
}

// =============================================================================
// Undo/Rollback Types
// =============================================================================

export interface UndoAction {
  id: string
  toolName: string
  description: string
  previousState: unknown
  reverseOperation: () => Promise<void>
  expiresAt: Date
}

export interface UndoManager {
  save(action: Omit<UndoAction, 'id'>): Promise<string>
  undo(actionId: string): Promise<void>
  getAvailable(sessionId: string): Promise<UndoAction[]>
  cleanup(): Promise<void>
}

// =============================================================================
// Security Types
// =============================================================================

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  maxTokensPerWindow?: number
  keyGenerator?: (req: PayloadRequest) => string
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
  retryAfter?: number
}

export interface AuditLogEntry {
  id: string
  timestamp: Date
  userId: string
  sessionId: string
  action: string
  toolName?: string
  parameters?: Record<string, unknown>
  result: 'success' | 'error' | 'denied' | 'pending'
  errorMessage?: string
  ipAddress?: string
  userAgent?: string
  tokensUsed?: number
  responseTimeMs?: number
}

export interface AuditLogger {
  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void>
  query(filters: AuditQueryFilters): Promise<AuditLogEntry[]>
}

export interface AuditQueryFilters {
  userId?: string
  sessionId?: string
  action?: string
  toolName?: string
  result?: AuditLogEntry['result']
  startDate?: Date
  endDate?: Date
  limit?: number
  offset?: number
}

export interface IPAllowlistConfig {
  enabled: boolean
  allowedIPs?: string[]
  allowedCIDRs?: string[]
  denyByDefault?: boolean
}

// =============================================================================
// Confirmation Types
// =============================================================================

export type ConfirmationLevel = 'none' | 'inline' | 'modal' | 'email' | 'webhook'

export interface ConfirmationConfig {
  defaultLevel: ConfirmationLevel
  destructiveActions: ConfirmationLevel
  bulkOperations: ConfirmationLevel
  configChanges: ConfirmationLevel
  timeoutSeconds: number
}

export interface PendingConfirmation {
  id: string
  sessionId: string
  toolName: string
  arguments: Record<string, unknown>
  level: ConfirmationLevel
  message: string
  createdAt: Date
  expiresAt: Date
  status: 'pending' | 'approved' | 'denied' | 'expired'
}

// =============================================================================
// Draft Storage Types
// =============================================================================

export interface AIGeneratedDraft {
  id: string
  sessionId: string
  conversationId: string
  collection: CollectionSlug
  documentId?: string
  content: Record<string, unknown>
  prompt: string
  createdAt: Date
  expiresAt: Date
  status: 'draft' | 'applied' | 'discarded'
}

// =============================================================================
// Plugin Configuration Types
// =============================================================================

export interface PluginAIAdminConfig {
  /** Enable/disable the plugin */
  enabled?: boolean

  /** AI provider configurations */
  providers: AIProviderConfig[]

  /** Default provider to use */
  defaultProvider: AIProvider

  /** Collections to enable AI tools for */
  collections?: Partial<Record<CollectionSlug, CollectionAIConfig>>

  /** Security configuration */
  security?: {
    rateLimit?: RateLimitConfig
    ipAllowlist?: IPAllowlistConfig
    requireAuth?: boolean
  }

  /** Confirmation settings */
  confirmation?: ConfirmationConfig

  /** Custom tools to add */
  tools?: AITool[]

  /** Undo settings */
  undo?: {
    enabled?: boolean
    retentionHours?: number
  }

  /** Streaming configuration */
  streaming?: {
    enabled?: boolean
    heartbeatIntervalMs?: number
  }

  /** Admin UI configuration */
  admin?: {
    chatPosition?: 'sidebar' | 'drawer' | 'modal'
    showInNav?: boolean
    defaultOpen?: boolean
  }

  /** Override collections */
  overrideCollections?: {
    conversations?: (config: CollectionConfig) => CollectionConfig
    auditLogs?: (config: CollectionConfig) => CollectionConfig
    drafts?: (config: CollectionConfig) => CollectionConfig
  }
}

export interface CollectionAIConfig {
  enabled: boolean | {
    create?: boolean
    read?: boolean
    update?: boolean
    delete?: boolean
  }
  description?: string
  generateFields?: string[]
  excludeFields?: string[]
}

// =============================================================================
// Component Props Types
// =============================================================================

export interface AIChatPanelProps {
  position?: 'sidebar' | 'drawer' | 'modal'
  defaultOpen?: boolean
  onClose?: () => void
}

export interface AIMessageProps {
  message: AIMessage
  isStreaming?: boolean
}

export interface ConfirmationDialogProps {
  confirmation: PendingConfirmation
  onApprove: () => void
  onDeny: () => void
}

export interface UndoToastProps {
  action: UndoAction
  onUndo: () => void
  onDismiss: () => void
}
