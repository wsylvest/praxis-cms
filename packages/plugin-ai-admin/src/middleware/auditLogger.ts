import type { Payload, PayloadRequest } from 'payload'

import { v4 as uuid } from 'uuid'

import type {
  AuditLogEntry,
  AuditLogger,
  AuditQueryFilters,
} from '../types/index.js'

/**
 * Audit Logger for tracking all AI actions
 * Stores logs in Payload collection for persistence and queryability
 */
export class PayloadAuditLogger implements AuditLogger {
  private buffer: Omit<AuditLogEntry, 'id' | 'timestamp'>[] = []
  private collectionSlug = 'ai-admin-audit-logs'
  private flushInterval: NodeJS.Timeout | null = null
  private flushIntervalMs = 5000
  private maxBufferSize = 100
  private payload: Payload

  constructor(payload: Payload) {
    this.payload = payload

    // Flush buffer periodically
    this.flushInterval = setInterval(() => this.flush(), this.flushIntervalMs)
  }

  /**
   * Create an audit log entry from a request
   */
  static fromRequest(
    req: PayloadRequest,
    action: string,
    extra?: Partial<Omit<AuditLogEntry, 'id' | 'timestamp'>>
  ): Omit<AuditLogEntry, 'id' | 'timestamp'> {
    return {
      action,
      ipAddress:
        req.headers.get('x-forwarded-for')?.split(',')[0] ||
        req.headers.get('x-real-ip') ||
        'unknown',
      result: 'pending',
      sessionId: req.headers.get('x-session-id') || 'unknown',
      userAgent: req.headers.get('user-agent') || undefined,
      userId: req.user?.id ? String(req.user.id) : 'anonymous',
      ...extra,
    }
  }

  /**
   * Stop the flush interval
   */
  async destroy(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }

    // Final flush
    await this.flush()
  }

  /**
   * Flush buffered entries to database
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {return}

    const entries = [...this.buffer]
    this.buffer = []

    try {
      // Batch insert
      await Promise.all(
        entries.map((entry) =>
          this.payload.create({
            collection: this.collectionSlug,
            data: {
              ...entry,
              timestamp: new Date().toISOString(),
            },
          })
        )
      )
    } catch (error) {
      // Re-add failed entries to buffer
      this.buffer.unshift(...entries)
      console.error('Failed to flush audit logs:', error)
    }
  }

  /**
   * Log an audit entry
   */
  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    this.buffer.push(entry)

    // Flush if buffer is full
    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush()
    }
  }

  /**
   * Query audit logs
   */
  async query(filters: AuditQueryFilters): Promise<AuditLogEntry[]> {
    const where: Record<string, unknown> = {}

    if (filters.userId) {
      where.userId = { equals: filters.userId }
    }
    if (filters.sessionId) {
      where.sessionId = { equals: filters.sessionId }
    }
    if (filters.action) {
      where.action = { equals: filters.action }
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
        // @ts-expect-error - payload query syntax
        where.timestamp.greater_than_equal = filters.startDate.toISOString()
      }
      if (filters.endDate) {
        // @ts-expect-error - payload query syntax
        where.timestamp.less_than_equal = filters.endDate.toISOString()
      }
    }

    const result = await this.payload.find({
      collection: this.collectionSlug,
      limit: filters.limit || 100,
      page: filters.offset ? Math.floor(filters.offset / (filters.limit || 100)) + 1 : 1,
      sort: '-timestamp',
      where: Object.keys(where).length > 0 ? (where as any) : undefined,
    })

    return result.docs as unknown as AuditLogEntry[]
  }
}

/**
 * In-memory audit logger for development/testing
 */
export class InMemoryAuditLogger implements AuditLogger {
  private logs: AuditLogEntry[] = []

  clear(): void {
    this.logs = []
  }

  getAll(): AuditLogEntry[] {
    return [...this.logs]
  }

  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    this.logs.push({
      id: uuid(),
      timestamp: new Date(),
      ...entry,
    })

    // Keep only last 10000 entries
    if (this.logs.length > 10000) {
      this.logs = this.logs.slice(-10000)
    }
    return Promise.resolve()
  }

  query(filters: AuditQueryFilters): Promise<AuditLogEntry[]> {
    let results = [...this.logs]

    if (filters.userId) {
      results = results.filter((l) => l.userId === filters.userId)
    }
    if (filters.sessionId) {
      results = results.filter((l) => l.sessionId === filters.sessionId)
    }
    if (filters.action) {
      results = results.filter((l) => l.action === filters.action)
    }
    if (filters.toolName) {
      results = results.filter((l) => l.toolName === filters.toolName)
    }
    if (filters.result) {
      results = results.filter((l) => l.result === filters.result)
    }
    if (filters.startDate) {
      results = results.filter((l) => l.timestamp >= filters.startDate!)
    }
    if (filters.endDate) {
      results = results.filter((l) => l.timestamp <= filters.endDate!)
    }

    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    // Apply pagination
    const offset = filters.offset || 0
    const limit = filters.limit || 100

    return Promise.resolve(results.slice(offset, offset + limit))
  }
}

/**
 * Create audit logger
 */
export function createAuditLogger(payload?: Payload): AuditLogger {
  if (payload) {
    return new PayloadAuditLogger(payload)
  }
  return new InMemoryAuditLogger()
}
