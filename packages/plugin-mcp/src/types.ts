import type { CollectionConfig, CollectionSlug, PayloadRequest, TypedUser } from 'payload'
import type { z } from 'zod'

import { type ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'

/**
 * Rate limiting configuration
 */
export type RateLimitingConfig = {
  /**
   * Enable rate limiting
   * @default true
   */
  enabled?: boolean
  /**
   * Maximum requests per window per API key
   * @default 100
   */
  maxRequests?: number
  /**
   * Maximum tokens per window per API key (optional)
   */
  maxTokensPerWindow?: number
  /**
   * API key IDs to skip rate limiting for
   */
  skipKeys?: string[]
  /**
   * Time window in milliseconds
   * @default 60000 (1 minute)
   */
  windowMs?: number
}

/**
 * Audit logging configuration
 */
export type AuditLoggingConfig = {
  /**
   * Enable audit logging
   * @default true
   */
  enabled?: boolean
  /**
   * Log failed operations
   * @default true
   */
  logErrors?: boolean
  /**
   * Log rate limited requests
   * @default true
   */
  logRateLimited?: boolean
  /**
   * Log successful operations
   * @default true
   */
  logSuccess?: boolean
  /**
   * Maximum parameter size to store (bytes)
   * @default 10000
   */
  maxParameterSize?: number
  /**
   * Additional fields to redact from parameters
   */
  redactFields?: string[]
  /**
   * Retention period in days
   * @default 90
   */
  retentionDays?: number
}

/**
 * Confirmation configuration for destructive operations
 */
export type ConfirmationConfig = {
  /**
   * Default confirmation level
   * @default 'inline'
   */
  defaultLevel?: 'email' | 'inline' | 'webhook'
  /**
   * Enable confirmation system
   * @default false
   */
  enabled?: boolean
  /**
   * Confirmation expiration time in milliseconds
   * @default 300000 (5 minutes)
   */
  expirationMs?: number
  /**
   * Collections that always require confirmation
   */
  protectedCollections?: string[]
  /**
   * Operations that require confirmation
   * @default ['delete']
   */
  requireConfirmationFor?: Array<'create' | 'delete' | 'execute' | 'update'>
  /**
   * Collections that never require confirmation
   */
  skipCollections?: string[]
  /**
   * Webhook secret for verification
   */
  webhookSecret?: string
  /**
   * Webhook URL for external confirmation
   */
  webhookUrl?: string
}

/**
 * Undo/rollback configuration
 */
export type UndoConfig = {
  /**
   * Collections that don't support undo
   */
  disabledCollections?: string[]
  /**
   * Enable undo functionality
   * @default true
   */
  enabled?: boolean
  /**
   * Collections that support undo (if not set, all collections support undo)
   */
  enabledCollections?: string[]
  /**
   * Undo expiration time in milliseconds
   * @default 3600000 (1 hour)
   */
  expirationMs?: number
  /**
   * Maximum undo entries per user
   * @default 100
   */
  maxEntriesPerUser?: number
}

/**
 * Streaming (SSE) configuration
 */
export type StreamingConfig = {
  /**
   * Enable SSE streaming endpoint
   * @default true
   */
  enabled?: boolean
  /**
   * Heartbeat interval in milliseconds
   * @default 30000 (30 seconds)
   */
  heartbeatIntervalMs?: number
  /**
   * Session timeout for stale sessions in milliseconds
   * @default 300000 (5 minutes)
   */
  sessionTimeoutMs?: number
}

/**
 * API key enhancement configuration
 */
export type ApiKeyEnhancementsConfig = {
  /**
   * Default expiration time in days for new API keys
   * @default 365
   */
  defaultExpirationDays?: number
  /**
   * Enable key expiration
   * @default true
   */
  enableExpiration?: boolean
  /**
   * Enable IP allowlist
   * @default true
   */
  enableIpAllowlist?: boolean
  /**
   * Enable key rotation tracking
   * @default true
   */
  enableRotation?: boolean
  /**
   * Enable usage tracking
   * @default true
   */
  enableUsageTracking?: boolean
  /**
   * Warning days before expiration
   * @default 30
   */
  expirationWarningDays?: number
  /**
   * Grace period after rotation in hours
   * @default 24
   */
  rotationGracePeriodHours?: number
}

/**
 * Security middleware configuration
 */
export type SecurityConfig = {
  /**
   * API key enhancements (expiration, rotation, IP allowlist)
   */
  apiKeyEnhancements?: ApiKeyEnhancementsConfig
  /**
   * Audit logging configuration
   */
  auditLogging?: AuditLoggingConfig
  /**
   * Confirmation configuration for destructive operations
   */
  confirmations?: ConfirmationConfig
  /**
   * Rate limiting configuration
   */
  rateLimiting?: RateLimitingConfig
  /**
   * Streaming (SSE) configuration
   */
  streaming?: StreamingConfig
  /**
   * Undo/rollback configuration
   */
  undo?: UndoConfig
}

export type PluginMCPServerConfig = {
  /**
   * Set the collections that should be available as resources via MCP.
   */
  collections?: Partial<
    Record<
      CollectionSlug,
      {
        /**
         * Set the description of the collection. This is used by MCP clients to determine when to use the collecton as a resource.
         */
        description?: string
        /**
         * Set the enabled capabilities of the collection. Admins can then allow or disallow the use of the capability by MCP clients.
         */
        enabled:
          | {
              create?: boolean
              delete?: boolean
              find?: boolean
              update?: boolean
            }
          | boolean

        /**
         * Override the response generated by the MCP client. This allows you to modify the response that is sent to the MCP client. This is useful for adding additional data to the response, data normalization, or verifying data.
         */
        overrideResponse?: (
          response: {
            content: Array<{
              text: string
              type: string
            }>
          },
          doc: Record<string, unknown>,
          req: PayloadRequest,
        ) => {
          content: Array<{
            text: string
            type: string
          }>
        }
      }
    >
  >
  /**
   * Disable the MCP plugin.
   */
  disabled?: boolean
  /**
   * Experimental features
   * **These features are for experimental purposes -- They are Disabled in Production by Default**
   */
  experimental?: {
    /**
     * These are MCP tools that can be used by a client to modify Payload.
     */
    tools: {
      /**
       * **Experimental** -- Auth MCP tools allow a client to change authentication priviliages for users. This is for developing ideas that help Admins with authentication tasks.
       */
      auth?: {
        /**
         * Enable the auth MCP tools. This allows Admins to enable or disable the auth capabilities.
         * @default false
         */
        enabled: boolean
      }
      /**
       * **Experimental** -- Collection MCP tools allow for the creation, modification, and deletion of Payload collections. This is for developing ideas that help Developers with collection tasks.
       */
      collections?: {
        /**
         * Set the directory path to the collections directory. This can be a directory outside of your default directory, or another Payload project.
         */
        collectionsDirPath: string
        /**
         * Enable the collection MCP tools. This allows Admins to enable or disable the Collection modification capabilities.
         * @default false
         */
        enabled: boolean
      }
      /**
       * **Experimental** -- Config MCP tools allow for the modification of a Payload Config. This is for developing ideas that help Developers with config tasks.
       */
      config?: {
        /**
         * Set the directory path to the config directory. This can be a directory outside of your default directory, or another Payload project.
         */
        configFilePath: string
        /**
         * Enable the config MCP tools. This allows Admins to enable or disable the Payload Config modification capabilities.
         * @default false
         */
        enabled: boolean
      }
      /**
       * **Experimental** -- Jobs MCP tools allow for the modification of Payload jobs. This is for developing ideas that help Developers with job tasks.
       */
      jobs?: {
        /**
         * Enable the jobs MCP tools. This allows Admins to enable or disable the Job modification capabilities.
         * @default false
         */
        enabled: boolean
        /**
         * Set the directory path to the jobs directory. This can be a directory outside of your default directory, or another Payload project.
         */
        jobsDirPath: string
      }
    }
  }
  /**
   * MCP Server options.
   */
  mcp?: {
    handlerOptions?: MCPHandlerOptions
    /**
     * Add custom MCP Prompts.
     */
    prompts?: {
      /**
       * Set the args schema of the prompt. This is the args schema that will be passed to the prompt. This is used by MCP clients to determine the arguments that will be passed to the prompt.
       */
      argsSchema: z.ZodRawShape
      /**
       * Set the description of the prompt. This is used by MCP clients to determine when to use the prompt.
       */
      description: string
      /**
       * Set the handler of the prompt. This is the function that will be called when the prompt is used.
       */
      handler: (
        args: Record<string, unknown>,
        req: PayloadRequest,
        _extra: unknown,
      ) =>
        | {
            messages: Array<{
              content: {
                text: string
                type: 'text'
              }
              role: 'assistant' | 'user'
            }>
          }
        | Promise<{
            messages: Array<{
              content: {
                text: string
                type: 'text'
              }
              role: 'assistant' | 'user'
            }>
          }>
      /**
       * Set the function name of the prompt.
       */
      name: string
      /**
       * Set the title of the prompt. LLMs will interperate the title to determine when to use the prompt.
       */
      title: string
    }[]

    /**
     * Add custom MCP Resource.
     */
    resources?: {
      /**
       * Set the description of the resource. This is used by MCP clients to determine when to use the resource.
       * example: 'Data is a resource that contains special data.'
       */
      description: string
      /**
       * Set the handler of the resource. This is the function that will be called when the resource is used.
       * The handler can have either 3 arguments (when no args are passed) or 4 arguments (when args are passed).
       */
      handler: (...args: any[]) =>
        | {
            contents: Array<{
              text: string
              uri: string
            }>
          }
        | Promise<{
            contents: Array<{
              text: string
              uri: string
            }>
          }>
      /**
       * Set the mime type of the resource.
       * example: 'text/plain'
       */
      mimeType: string
      /**
       * Set the function name of the resource.
       * example: 'data'
       */
      name: string
      /**
       * Set the title of the resource. LLMs will interperate the title to determine when to use the resource.
       * example: 'Data'
       */
      title: string
      /**
       * Set the uri of the resource.
       * example: 'data://app'
       */
      uri: ResourceTemplate | string
    }[]
    serverOptions?: MCPServerOptions
    /**
     * Add custom MCP Tools.
     */
    tools?: {
      /**
       * Set the description of the tool. This is used by MCP clients to determine when to use the tool.
       */
      description: string
      /**
       * Set the handler of the tool. This is the function that will be called when the tool is used.
       */
      handler: (
        args: Record<string, unknown>,
        req: PayloadRequest,
        _extra: unknown,
      ) =>
        | {
            content: Array<{
              text: string
              type: 'text'
            }>
            role?: string
          }
        | Promise<{
            content: Array<{
              text: string
              type: 'text'
            }>
            role?: string
          }>
      /**
       * Set the name of the tool. This is the name that will be used to identify the tool. LLMs will interperate the name to determine when to use the tool.
       */
      name: string
      /**
       * Set the parameters of the tool. This is the parameters that will be passed to the tool.
       */
      parameters: z.ZodRawShape
    }[]
  }

  /**
   * Override the API key collection.
   * This allows you to add fields to the API key collection or modify the collection in any way you want.
   * @param collection - The API key collection.
   * @returns The modified API key collection.
   */
  overrideApiKeyCollection?: (collection: CollectionConfig) => CollectionConfig

  /**
   * Override the authentication method.
   * This allows you to use a custom authentication method instead of the default API key authentication.
   * @param req - The request object.
   * @returns The MCP access settings.
   */
  overrideAuth?: (
    req: PayloadRequest,
    getDefaultMcpAccessSettings: (overrideApiKey?: null | string) => Promise<MCPAccessSettings>,
  ) => MCPAccessSettings | Promise<MCPAccessSettings>

  /**
   * Security middleware configuration.
   * Configure rate limiting, audit logging, confirmations, undo, and streaming.
   */
  security?: SecurityConfig

  /**
   * Set the users collection that API keys should be associated with.
   */
  userCollection?: CollectionConfig | string
}

/**
 * MCP Handler options.
 */
export type MCPHandlerOptions = {
  /**
   * Set the base path of the MCP handler. This is the path that will be used to access the MCP handler.
   * @default /api
   */
  basePath?: string
  /**
   * Set the maximum duration of the MCP handler. This is the maximum duration that the MCP handler will run for.
   * @default 60
   */
  maxDuration?: number
  /**
   * Set the Redis URL for the MCP handler. This is the URL that will be used to access the Redis server.
   * @default process.env.REDIS_URL
   * INFO: Disabled until developer clarity is reached for server side streaming and we have an auth pattern for all SSE patterns
   */
  // redisUrl?: string
  /**
   * Set verbose logging.
   * @default false
   */
  verboseLogs?: boolean
}

/**
 * MCP Server options.
 */
export type MCPServerOptions = {
  /**
   * Set the server info of the MCP server.
   */
  serverInfo?: {
    /**
     * Set the name of the MCP server.
     * @default 'Payload MCP Server'
     */
    name: string
    /**
     * Set the version of the MCP server.
     * @default '1.0.0'
     */
    version: string
  }
}

export type MCPAccessSettings = {
  auth?: {
    auth?: boolean
    forgotPassword?: boolean
    login?: boolean
    resetPassword?: boolean
    unlock?: boolean
    verify?: boolean
  }
  collections?: {
    create?: boolean
    delete?: boolean
    find?: boolean
    update?: boolean
  }
  config?: {
    find?: boolean
    update?: boolean
  }
  jobs?: {
    create?: boolean
    run?: boolean
    update?: boolean
  }
  'payload-mcp-prompt'?: Record<string, boolean>
  'payload-mcp-resource'?: Record<string, boolean>
  'payload-mcp-tool'?: Record<string, boolean>
  user: TypedUser
} & Record<string, unknown>

export type FieldDefinition = {
  description?: string
  name: string
  options?: { label: string; value: string }[]
  position?: 'main' | 'sidebar'
  required?: boolean
  type: string
}

export type FieldModification = {
  changes: {
    description?: string
    options?: { label: string; value: string }[]
    position?: 'main' | 'sidebar'
    required?: boolean
    type?: string
  }
  fieldName: string
}

export type CollectionConfigUpdates = {
  access?: {
    create?: string
    delete?: string
    read?: string
    update?: string
  }
  description?: string
  slug?: string
  timestamps?: boolean
  versioning?: boolean
}

export type AdminConfig = {
  avatar?: string
  css?: string
  dateFormat?: string
  inactivityRoute?: string
  livePreview?: {
    breakpoints?: Array<{
      height: number
      label: string
      name: string
      width: number
    }>
  }
  logoutRoute?: string
  meta?: {
    favicon?: string
    ogImage?: string
    titleSuffix?: string
  }
  user?: string
}

export type DatabaseConfig = {
  connectOptions?: string
  type?: 'mongodb' | 'postgres'
  url?: string
}

export type PluginUpdates = {
  add?: string[]
  remove?: string[]
}

export type GeneralConfig = {
  cookiePrefix?: string
  cors?: string
  csrf?: string
  graphQL?: {
    disable?: boolean
    schemaOutputFile?: string
  }
  rateLimit?: {
    max?: number
    skip?: string
    window?: number
  }
  secret?: string
  serverURL?: string
  typescript?: {
    declare?: boolean
    outputFile?: string
  }
}

export interface SchemaField {
  description?: string
  name: string
  options?: string[]
  required?: boolean
  type: string
}

export interface TaskSequenceItem {
  description?: string
  retries?: number
  taskId: string
  taskSlug: string
  timeout?: number
}

export interface JobConfigUpdate {
  description?: string
  queue?: string
  retries?: number
  timeout?: number
}
