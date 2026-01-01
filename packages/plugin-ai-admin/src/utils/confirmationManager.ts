import { v4 as uuid } from 'uuid'

import type {
  ConfirmationConfig,
  ConfirmationLevel,
  PendingConfirmation,
} from '../types/index.js'

type ConfirmationResolver = {
  resolve: (approved: boolean) => void
  timeout: NodeJS.Timeout
}

/**
 * Confirmation Manager - handles human-in-the-loop approval for destructive actions
 */
export class ConfirmationManager {
  private config: ConfirmationConfig
  private pending: Map<string, PendingConfirmation> = new Map()
  private resolvers: Map<string, ConfirmationResolver> = new Map()

  constructor(config?: Partial<ConfirmationConfig>) {
    this.config = {
      bulkOperations: config?.bulkOperations ?? 'modal',
      configChanges: config?.configChanges ?? 'modal',
      defaultLevel: config?.defaultLevel ?? 'none',
      destructiveActions: config?.destructiveActions ?? 'modal',
      timeoutSeconds: config?.timeoutSeconds ?? 60,
    }
  }

  /**
   * Generate confirmation message for a tool
   */
  static generateMessage(
    toolName: string,
    args: Record<string, unknown>
  ): string {
    // Delete operations
    if (toolName.includes('delete')) {
      if (args.where) {
        return `Are you sure you want to delete documents matching the filter? This action cannot be undone.`
      }
      if (Array.isArray(args.ids)) {
        return `Are you sure you want to delete ${args.ids.length} documents? This action cannot be undone.`
      }
      return `Are you sure you want to delete this document? This action cannot be undone.`
    }

    // Bulk update operations
    if (toolName.includes('bulk') || args.where) {
      return `Are you sure you want to update multiple documents? This will affect all documents matching the criteria.`
    }

    // Config changes
    if (toolName.includes('config') || toolName.includes('collection')) {
      return `Are you sure you want to modify the CMS configuration? This may affect the entire system.`
    }

    return `Are you sure you want to proceed with this action?`
  }

  /**
   * Expire a confirmation
   */
  private expire(confirmationId: string): void {
    const confirmation = this.pending.get(confirmationId)

    if (confirmation && confirmation.status === 'pending') {
      confirmation.status = 'expired'
      this.pending.set(confirmationId, confirmation)
    }

    const resolver = this.resolvers.get(confirmationId)
    if (resolver) {
      clearTimeout(resolver.timeout)
      this.resolvers.delete(confirmationId)
    }
  }

  /**
   * Approve a pending confirmation
   */
  approve(confirmationId: string): boolean {
    const confirmation = this.pending.get(confirmationId)
    const resolver = this.resolvers.get(confirmationId)

    if (!confirmation || !resolver) {
      return false
    }

    if (confirmation.status !== 'pending') {
      return false
    }

    confirmation.status = 'approved'
    this.pending.set(confirmationId, confirmation)

    clearTimeout(resolver.timeout)
    resolver.resolve(true)
    this.resolvers.delete(confirmationId)

    return true
  }

  /**
   * Clean up old confirmations
   */
  cleanup(): void {
    const now = new Date()

    for (const [id, confirmation] of this.pending) {
      if (confirmation.expiresAt < now) {
        this.expire(id)
      }
    }

    // Remove old non-pending confirmations
    for (const [id, confirmation] of this.pending) {
      if (confirmation.status !== 'pending') {
        const age = now.getTime() - confirmation.createdAt.getTime()
        if (age > 5 * 60 * 1000) {
          // 5 minutes
          this.pending.delete(id)
        }
      }
    }
  }

  /**
   * Deny a pending confirmation
   */
  deny(confirmationId: string): boolean {
    const confirmation = this.pending.get(confirmationId)
    const resolver = this.resolvers.get(confirmationId)

    if (!confirmation || !resolver) {
      return false
    }

    if (confirmation.status !== 'pending') {
      return false
    }

    confirmation.status = 'denied'
    this.pending.set(confirmationId, confirmation)

    clearTimeout(resolver.timeout)
    resolver.resolve(false)
    this.resolvers.delete(confirmationId)

    return true
  }

  /**
   * Get a specific confirmation
   */
  getConfirmation(confirmationId: string): PendingConfirmation | undefined {
    return this.pending.get(confirmationId)
  }

  /**
   * Determine confirmation level for an action
   */
  getConfirmationLevel(
    toolName: string,
    args: Record<string, unknown>
  ): ConfirmationLevel {
    // Check for destructive actions
    if (
      toolName.includes('delete') ||
      toolName.includes('remove') ||
      toolName.includes('destroy')
    ) {
      return this.config.destructiveActions
    }

    // Check for bulk operations
    if (
      toolName.includes('bulk') ||
      args.where ||
      (Array.isArray(args.ids) && args.ids.length > 1)
    ) {
      return this.config.bulkOperations
    }

    // Check for config changes
    if (
      toolName.includes('config') ||
      toolName.includes('collection') ||
      toolName.includes('field')
    ) {
      return this.config.configChanges
    }

    return this.config.defaultLevel
  }

  /**
   * Get pending confirmations for a session
   */
  getPending(sessionId: string): PendingConfirmation[] {
    return Array.from(this.pending.values()).filter(
      (c) => c.sessionId === sessionId && c.status === 'pending'
    )
  }

  /**
   * Request confirmation for an action
   * Returns a promise that resolves when user approves/denies
   */
  async requestConfirmation(
    sessionId: string,
    toolName: string,
    args: Record<string, unknown>,
    message: string
  ): Promise<boolean> {
    const level = this.getConfirmationLevel(toolName, args)

    // No confirmation needed
    if (level === 'none') {
      return true
    }

    const id = uuid()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + this.config.timeoutSeconds * 1000)

    const confirmation: PendingConfirmation = {
      id,
      arguments: args,
      createdAt: now,
      expiresAt,
      level,
      message,
      sessionId,
      status: 'pending',
      toolName,
    }

    this.pending.set(id, confirmation)

    return new Promise<boolean>((resolve) => {
      // Set timeout
      const timeout = setTimeout(() => {
        this.expire(id)
        resolve(false)
      }, this.config.timeoutSeconds * 1000)

      this.resolvers.set(id, { resolve, timeout })
    })
  }
}

/**
 * Create confirmation manager
 */
export function createConfirmationManager(
  config?: Partial<ConfirmationConfig>
): ConfirmationManager {
  return new ConfirmationManager(config)
}
