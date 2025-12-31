import type { CollectionSlug } from 'payload'
import { v4 as uuid } from 'uuid'

import type { SessionContext } from '../types/index.js'

interface SessionManagerConfig {
  sessionDurationMs: number
  maxSessionsPerUser: number
}

/**
 * Session Manager - handles user sessions and context
 */
export class SessionManager {
  private sessions: Map<string, SessionContext> = new Map()
  private userSessions: Map<string, Set<string>> = new Map()
  private config: SessionManagerConfig
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(config?: Partial<SessionManagerConfig>) {
    this.config = {
      sessionDurationMs: config?.sessionDurationMs ?? 24 * 60 * 60 * 1000, // 24 hours
      maxSessionsPerUser: config?.maxSessionsPerUser ?? 10,
    }

    // Cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000)
  }

  /**
   * Create a new session
   */
  create(userId: string, metadata?: Record<string, unknown>): SessionContext {
    const id = uuid()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + this.config.sessionDurationMs)

    const session: SessionContext = {
      id,
      userId,
      metadata,
      createdAt: now,
      expiresAt,
    }

    this.sessions.set(id, session)

    // Track user sessions
    let userSessions = this.userSessions.get(userId)
    if (!userSessions) {
      userSessions = new Set()
      this.userSessions.set(userId, userSessions)
    }
    userSessions.add(id)

    // Enforce max sessions per user
    this.enforceSessionLimit(userId)

    return session
  }

  /**
   * Get a session by ID
   */
  get(sessionId: string): SessionContext | undefined {
    const session = this.sessions.get(sessionId)

    if (!session) {
      return undefined
    }

    // Check if expired
    if (session.expiresAt < new Date()) {
      this.delete(sessionId)
      return undefined
    }

    return session
  }

  /**
   * Get or create a session
   */
  getOrCreate(
    sessionId: string | undefined,
    userId: string,
    metadata?: Record<string, unknown>
  ): SessionContext {
    if (sessionId) {
      const existing = this.get(sessionId)
      if (existing && existing.userId === userId) {
        return existing
      }
    }

    return this.create(userId, metadata)
  }

  /**
   * Update session context
   */
  update(
    sessionId: string,
    updates: Partial<Pick<SessionContext, 'currentCollection' | 'selectedDocuments' | 'conversationId' | 'metadata'>>
  ): SessionContext | undefined {
    const session = this.get(sessionId)

    if (!session) {
      return undefined
    }

    // Apply updates
    if (updates.currentCollection !== undefined) {
      session.currentCollection = updates.currentCollection
    }
    if (updates.selectedDocuments !== undefined) {
      session.selectedDocuments = updates.selectedDocuments
    }
    if (updates.conversationId !== undefined) {
      session.conversationId = updates.conversationId
    }
    if (updates.metadata !== undefined) {
      session.metadata = { ...session.metadata, ...updates.metadata }
    }

    this.sessions.set(sessionId, session)
    return session
  }

  /**
   * Set current collection context
   */
  setCollection(sessionId: string, collection: CollectionSlug): SessionContext | undefined {
    return this.update(sessionId, { currentCollection: collection })
  }

  /**
   * Set selected documents
   */
  setSelectedDocuments(
    sessionId: string,
    documentIds: string[]
  ): SessionContext | undefined {
    return this.update(sessionId, { selectedDocuments: documentIds })
  }

  /**
   * Link a conversation to the session
   */
  setConversation(
    sessionId: string,
    conversationId: string
  ): SessionContext | undefined {
    return this.update(sessionId, { conversationId })
  }

  /**
   * Extend session expiration
   */
  extend(sessionId: string): SessionContext | undefined {
    const session = this.get(sessionId)

    if (!session) {
      return undefined
    }

    session.expiresAt = new Date(Date.now() + this.config.sessionDurationMs)
    this.sessions.set(sessionId, session)
    return session
  }

  /**
   * Delete a session
   */
  delete(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)

    if (!session) {
      return false
    }

    this.sessions.delete(sessionId)

    // Remove from user sessions
    const userSessions = this.userSessions.get(session.userId)
    if (userSessions) {
      userSessions.delete(sessionId)
      if (userSessions.size === 0) {
        this.userSessions.delete(session.userId)
      }
    }

    return true
  }

  /**
   * Get all sessions for a user
   */
  getUserSessions(userId: string): SessionContext[] {
    const sessionIds = this.userSessions.get(userId)

    if (!sessionIds) {
      return []
    }

    const sessions: SessionContext[] = []
    for (const id of sessionIds) {
      const session = this.get(id)
      if (session) {
        sessions.push(session)
      }
    }

    return sessions
  }

  /**
   * Delete all sessions for a user
   */
  deleteUserSessions(userId: string): number {
    const sessionIds = this.userSessions.get(userId)

    if (!sessionIds) {
      return 0
    }

    let count = 0
    for (const id of sessionIds) {
      if (this.delete(id)) {
        count++
      }
    }

    return count
  }

  /**
   * Enforce max sessions per user
   */
  private enforceSessionLimit(userId: string): void {
    const sessionIds = this.userSessions.get(userId)

    if (!sessionIds || sessionIds.size <= this.config.maxSessionsPerUser) {
      return
    }

    // Get sessions sorted by creation time (oldest first)
    const sessions = Array.from(sessionIds)
      .map((id) => this.sessions.get(id))
      .filter((s): s is SessionContext => !!s)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

    // Delete oldest sessions until under limit
    const toDelete = sessions.slice(0, sessions.length - this.config.maxSessionsPerUser)
    for (const session of toDelete) {
      this.delete(session.id)
    }
  }

  /**
   * Cleanup expired sessions
   */
  private cleanup(): void {
    const now = new Date()

    for (const [id, session] of this.sessions) {
      if (session.expiresAt < now) {
        this.delete(id)
      }
    }
  }

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number
    activeUsers: number
    averageSessionAge: number
  } {
    const now = Date.now()
    let totalAge = 0

    for (const session of this.sessions.values()) {
      totalAge += now - session.createdAt.getTime()
    }

    return {
      totalSessions: this.sessions.size,
      activeUsers: this.userSessions.size,
      averageSessionAge:
        this.sessions.size > 0 ? totalAge / this.sessions.size : 0,
    }
  }

  /**
   * Stop the cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}

/**
 * Create session manager
 */
export function createSessionManager(
  config?: Partial<SessionManagerConfig>
): SessionManager {
  return new SessionManager(config)
}
