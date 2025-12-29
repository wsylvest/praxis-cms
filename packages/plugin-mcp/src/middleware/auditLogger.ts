/**
 * MCP Audit Logger
 *
 * Service for logging all MCP tool executions to the audit logs collection.
 */

import type { Payload } from 'payload'

import type { AuditLogEntry } from '../collections/createAuditLogsCollection.js'

export interface AuditLoggerConfig {
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
   * Fields to redact from parameters
   */
  redactFields?: string[]

  /**
   * Retention period in days (for cleanup job)
   * @default 90
   */
  retentionDays?: number

  /**
   * Sanitize parameters before logging (remove sensitive data)
   * @default true
   */
  sanitizeParameters?: boolean

  /**
   * Custom log transformer
   */
  transformLog?: (log: AuditLogEntry) => AuditLogEntry | null
}

const DEFAULT_REDACT_FIELDS = [
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authorization',
  'cookie',
  'creditCard',
  'credit_card',
  'ssn',
  'socialSecurityNumber',
]

/**
 * Create an audit logger instance
 */
export function createAuditLogger(config: AuditLoggerConfig = {}) {
  const {
    enabled = true,
    logErrors = true,
    logRateLimited = true,
    logSuccess = true,
    maxParameterSize = 10000,
    redactFields = DEFAULT_REDACT_FIELDS,
    sanitizeParameters = true,
    transformLog,
  } = config

  /**
   * Sanitize parameters by redacting sensitive fields
   */
  function sanitize(obj: Record<string, unknown>): Record<string, unknown> {
    if (!sanitizeParameters) {
      return obj
    }

    const sanitized: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase()

      // Check if field should be redacted
      if (redactFields.some((field) => lowerKey.includes(field.toLowerCase()))) {
        sanitized[key] = '[REDACTED]'
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = sanitize(value as Record<string, unknown>)
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map((item) =>
          typeof item === 'object' && item !== null
            ? sanitize(item as Record<string, unknown>)
            : item,
        )
      } else {
        sanitized[key] = value
      }
    }

    return sanitized
  }

  /**
   * Truncate parameters if too large
   */
  function truncateParams(params: Record<string, unknown>): Record<string, unknown> {
    const json = JSON.stringify(params)
    if (json.length <= maxParameterSize) {
      return params
    }

    return {
      _originalSize: json.length,
      _preview: json.substring(0, 500) + '...',
      _truncated: true,
    }
  }

  /**
   * Determine tool category from tool name
   */
  function getToolCategory(
    toolName: string,
  ): 'auth' | 'collection' | 'config' | 'custom' | 'job' | 'resource' {
    if (
      toolName.startsWith('find') ||
      toolName.startsWith('create') ||
      toolName.startsWith('update') ||
      toolName.startsWith('delete')
    ) {
      // Check if it's a collection schema tool
      if (
        toolName === 'createCollection' ||
        toolName === 'updateCollection' ||
        toolName === 'deleteCollection' ||
        toolName === 'findCollection'
      ) {
        return 'collection'
      }
      return 'resource'
    }

    if (toolName.includes('Config')) {
      return 'config'
    }
    if (toolName.includes('Job')) {
      return 'job'
    }
    if (
      ['auth', 'forgotPassword', 'login', 'resetPassword', 'unlock', 'verify'].includes(toolName)
    ) {
      return 'auth'
    }

    return 'custom'
  }

  /**
   * Determine operation type from tool name
   */
  function getOperation(
    toolName: string,
  ): 'create' | 'delete' | 'execute' | 'find' | 'other' | 'update' {
    if (toolName.startsWith('find')) {
      return 'find'
    }
    if (toolName.startsWith('create')) {
      return 'create'
    }
    if (toolName.startsWith('update')) {
      return 'update'
    }
    if (toolName.startsWith('delete')) {
      return 'delete'
    }
    if (toolName === 'runJob') {
      return 'execute'
    }
    return 'other'
  }

  /**
   * Extract collection slug from tool name
   */
  function extractCollectionSlug(toolName: string): string | undefined {
    const match = toolName.match(/^(?:find|create|update|delete)(.+)$/)
    if (match && match[1]) {
      // Convert PascalCase to kebab-case
      return match[1].replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
    }
    return undefined
  }

  return {
    /**
     * Log an MCP action
     */
    async log(
      payload: Payload,
      entry: {
        operation?: AuditLogEntry['operation']
        toolCategory?: AuditLogEntry['toolCategory']
      } & Omit<AuditLogEntry, 'operation' | 'timestamp' | 'toolCategory'>,
    ): Promise<void> {
      if (!enabled) {
        return
      }

      // Check if we should log this result type
      if (entry.result === 'success' && !logSuccess) {
        return
      }
      if (entry.result === 'error' && !logErrors) {
        return
      }
      if (entry.result === 'rate_limited' && !logRateLimited) {
        return
      }

      // Build the log entry
      let logEntry: AuditLogEntry = {
        ...entry,
        collectionSlug: entry.collectionSlug || extractCollectionSlug(entry.toolName),
        operation: entry.operation || getOperation(entry.toolName),
        parameters: truncateParams(sanitize(entry.parameters || {})),
        timestamp: new Date(),
        toolCategory: entry.toolCategory || getToolCategory(entry.toolName),
      }

      // Apply custom transformer
      if (transformLog) {
        const transformed = transformLog(logEntry)
        if (transformed === null) {
          return
        } // Skip logging
        logEntry = transformed
      }

      try {
        await payload.create({
          collection: 'payload-mcp-audit-logs',
          data: logEntry as any,
        })
      } catch (error) {
        // Don't let logging failures break the request
        payload.logger.error({ err: error, msg: '[payload-mcp] Failed to create audit log' })
      }
    },

    /**
     * Query audit logs
     */
    async query(
      payload: Payload,
      filters: {
        apiKeyId?: string
        endDate?: Date
        limit?: number
        page?: number
        result?: AuditLogEntry['result']
        startDate?: Date
        toolName?: string
        userId?: string
      },
    ): Promise<{ docs: AuditLogEntry[]; totalDocs: number; totalPages: number }> {
      const where: any = {}

      if (filters.apiKeyId) {
        where.apiKeyId = { equals: filters.apiKeyId }
      }
      if (filters.userId) {
        where.userId = { equals: filters.userId }
      }
      if (filters.toolName) {
        where.toolName = { equals: filters.toolName }
      }
      if (filters.result) {
        where.result = { equals: filters.result }
      }
      if (filters.startDate || filters.endDate) {
        where.timestamp = {}
        if (filters.startDate) {
          where.timestamp.greater_than_equal = filters.startDate
        }
        if (filters.endDate) {
          where.timestamp.less_than_equal = filters.endDate
        }
      }

      const result = await payload.find({
        collection: 'payload-mcp-audit-logs',
        limit: filters.limit || 50,
        page: filters.page || 1,
        sort: '-timestamp',
        where: Object.keys(where).length > 0 ? where : undefined,
      })

      return {
        docs: result.docs as unknown as AuditLogEntry[],
        totalDocs: result.totalDocs,
        totalPages: result.totalPages,
      }
    },

    /**
     * Get statistics for a time period
     */
    async getStats(
      payload: Payload,
      options: {
        apiKeyId?: string
        endDate: Date
        startDate: Date
        userId?: string
      },
    ): Promise<{
      avgResponseTime: number
      deniedCount: number
      errorCount: number
      rateLimitedCount: number
      successCount: number
      topTools: Array<{ count: number; tool: string }>
      totalRequests: number
    }> {
      const where: any = {
        timestamp: {
          greater_than_equal: options.startDate,
          less_than_equal: options.endDate,
        },
      }

      if (options.apiKeyId) {
        where.apiKeyId = { equals: options.apiKeyId }
      }
      if (options.userId) {
        where.userId = { equals: options.userId }
      }

      const result = await payload.find({
        collection: 'payload-mcp-audit-logs',
        limit: 10000,
        pagination: false,
        where,
      })

      const docs = result.docs as unknown as AuditLogEntry[]

      // Calculate statistics
      const successCount = docs.filter((d) => d.result === 'success').length
      const errorCount = docs.filter((d) => d.result === 'error').length
      const deniedCount = docs.filter((d) => d.result === 'denied').length
      const rateLimitedCount = docs.filter((d) => d.result === 'rate_limited').length

      // Count tools
      const toolCounts: Record<string, number> = {}
      for (const doc of docs) {
        toolCounts[doc.toolName] = (toolCounts[doc.toolName] || 0) + 1
      }
      const topTools = Object.entries(toolCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tool, count]) => ({ count, tool }))

      // Calculate average response time
      const responseTimes = docs
        .filter((d) => d.responseTimeMs !== undefined)
        .map((d) => d.responseTimeMs!)
      const avgResponseTime =
        responseTimes.length > 0
          ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          : 0

      return {
        avgResponseTime: Math.round(avgResponseTime),
        deniedCount,
        errorCount,
        rateLimitedCount,
        successCount,
        topTools,
        totalRequests: docs.length,
      }
    },

    /**
     * Cleanup old logs
     */
    async cleanup(payload: Payload, retentionDays: number): Promise<number> {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

      const result = await payload.delete({
        collection: 'payload-mcp-audit-logs',
        where: {
          timestamp: {
            less_than: cutoffDate,
          },
        },
      })

      return Array.isArray(result.docs) ? result.docs.length : 0
    },
  }
}

export type AuditLogger = ReturnType<typeof createAuditLogger>
