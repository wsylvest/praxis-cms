/**
 * MCP Confirmation Manager
 *
 * Service for managing confirmations for destructive MCP operations.
 * Supports inline, email, and webhook confirmation flows.
 */

import type { Payload } from 'payload'

import type { PendingConfirmation } from '../collections/createConfirmationsCollection.js'

export interface ConfirmationConfig {
  /**
   * Default confirmation level for destructive operations
   * @default 'inline'
   */
  defaultLevel?: 'email' | 'inline' | 'webhook'

  /**
   * Enable confirmation system
   * @default true
   */
  enabled?: boolean

  /**
   * Confirmation expiration time in milliseconds
   * @default 300000 (5 minutes)
   */
  expirationMs?: number

  /**
   * Custom confirmation message generator
   */
  generateMessage?: (params: {
    collectionSlug?: string
    documentId?: string
    operation: string
    parameters: Record<string, unknown>
    toolName: string
  }) => string

  /**
   * Collections that always require confirmation for destructive ops
   */
  protectedCollections?: string[]

  /**
   * Operations that require confirmation
   * @default ['delete', 'update']
   */
  requireConfirmationFor?: Array<'create' | 'delete' | 'execute' | 'update'>

  /**
   * Collections that never require confirmation (override)
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

export interface ConfirmationRequest {
  apiKeyId: string
  collectionSlug?: string
  documentId?: string
  metadata?: Record<string, unknown>
  operation: 'create' | 'delete' | 'execute' | 'update'
  parameters: Record<string, unknown>
  toolName: string
  userId: string
}

export interface ConfirmationResult {
  confirmationId?: string
  expiresAt?: Date
  message?: string
  required: boolean
}

/**
 * Create a confirmation manager instance
 */
export function createConfirmationManager(config: ConfirmationConfig = {}) {
  const {
    defaultLevel = 'inline',
    enabled = true,
    expirationMs = 5 * 60 * 1000, // 5 minutes
    generateMessage = defaultMessageGenerator,
    protectedCollections = [],
    requireConfirmationFor = ['delete', 'update'],
    skipCollections = [],
    webhookSecret,
    webhookUrl,
  } = config

  /**
   * Default message generator
   */
  function defaultMessageGenerator(params: {
    collectionSlug?: string
    documentId?: string
    operation: string
    parameters: Record<string, unknown>
    toolName: string
  }): string {
    const { collectionSlug, documentId, operation, toolName } = params

    if (operation === 'delete') {
      if (documentId && collectionSlug) {
        return `Are you sure you want to delete document "${documentId}" from collection "${collectionSlug}"? This action cannot be undone.`
      }
      if (collectionSlug) {
        return `Are you sure you want to delete from collection "${collectionSlug}"? This action cannot be undone.`
      }
      return `Are you sure you want to perform this delete operation? This action cannot be undone.`
    }

    if (operation === 'update') {
      if (documentId && collectionSlug) {
        return `Confirm update to document "${documentId}" in collection "${collectionSlug}".`
      }
      return `Confirm this update operation.`
    }

    if (operation === 'execute') {
      return `Confirm execution of "${toolName}".`
    }

    return `Confirm this "${operation}" operation using "${toolName}".`
  }

  return {
    /**
     * Check if an operation requires confirmation
     */
    requiresConfirmation(request: ConfirmationRequest): boolean {
      if (!enabled) {
        return false
      }

      const { collectionSlug, operation } = request

      // Check skip list first
      if (collectionSlug && skipCollections.includes(collectionSlug)) {
        return false
      }

      // Check protected collections
      if (collectionSlug && protectedCollections.includes(collectionSlug)) {
        return true
      }

      // Check operation type
      return requireConfirmationFor.includes(operation)
    },

    /**
     * Create a pending confirmation
     */
    async createConfirmation(
      payload: Payload,
      request: ConfirmationRequest,
    ): Promise<ConfirmationResult> {
      if (!this.requiresConfirmation(request)) {
        return { required: false }
      }

      const message = generateMessage({
        collectionSlug: request.collectionSlug,
        documentId: request.documentId,
        operation: request.operation,
        parameters: request.parameters,
        toolName: request.toolName,
      })

      const expiresAt = new Date(Date.now() + expirationMs)

      const confirmationData: Omit<PendingConfirmation, 'id'> = {
        apiKeyId: request.apiKeyId,
        collectionSlug: request.collectionSlug,
        confirmationLevel: defaultLevel,
        documentId: request.documentId,
        expiresAt,
        message,
        metadata: request.metadata,
        operation: request.operation,
        parameters: request.parameters,
        status: 'pending',
        toolName: request.toolName,
        userId: request.userId,
        webhookSecret: defaultLevel === 'webhook' ? webhookSecret : undefined,
        webhookUrl: defaultLevel === 'webhook' ? webhookUrl : undefined,
      }

      try {
        const result = await payload.create({
          collection: 'payload-mcp-confirmations',
          data: confirmationData as any,
        })

        const confirmationId = String(result.id)

        // Send webhook notification if configured
        if (defaultLevel === 'webhook' && webhookUrl) {
          await this.sendWebhookNotification(confirmationId, message, request)
        }

        return {
          confirmationId,
          expiresAt,
          message,
          required: true,
        }
      } catch (error) {
        payload.logger.error({ err: error, msg: '[payload-mcp] Failed to create confirmation' })
        throw error
      }
    },

    /**
     * Check confirmation status
     */
    async getConfirmationStatus(
      payload: Payload,
      confirmationId: string,
    ): Promise<null | PendingConfirmation> {
      try {
        const result = await payload.findByID({
          id: confirmationId,
          collection: 'payload-mcp-confirmations',
        })

        return result as unknown as PendingConfirmation
      } catch {
        return null
      }
    },

    /**
     * Check if a confirmation is valid and approved
     */
    async isApproved(payload: Payload, confirmationId: string): Promise<boolean> {
      const confirmation = await this.getConfirmationStatus(payload, confirmationId)

      if (!confirmation) {
        return false
      }
      if (confirmation.status !== 'approved') {
        return false
      }
      if (new Date(confirmation.expiresAt) < new Date()) {
        return false
      }

      return true
    },

    /**
     * Approve a confirmation
     */
    async approve(
      payload: Payload,
      confirmationId: string,
      approvedBy: string,
    ): Promise<null | PendingConfirmation> {
      try {
        const confirmation = await this.getConfirmationStatus(payload, confirmationId)

        if (!confirmation) {
          return null
        }
        if (confirmation.status !== 'pending') {
          return confirmation
        }
        if (new Date(confirmation.expiresAt) < new Date()) {
          // Auto-expire
          await payload.update({
            id: confirmationId,
            collection: 'payload-mcp-confirmations',
            data: { status: 'expired' },
          })
          return { ...confirmation, status: 'expired' }
        }

        const result = await payload.update({
          id: confirmationId,
          collection: 'payload-mcp-confirmations',
          data: {
            approvedAt: new Date(),
            approvedBy,
            status: 'approved',
          },
        })

        return result as unknown as PendingConfirmation
      } catch (error) {
        payload.logger.error({ err: error, msg: '[payload-mcp] Failed to approve confirmation' })
        return null
      }
    },

    /**
     * Deny a confirmation
     */
    async deny(
      payload: Payload,
      confirmationId: string,
      deniedBy: string,
      reason?: string,
    ): Promise<null | PendingConfirmation> {
      try {
        const result = await payload.update({
          id: confirmationId,
          collection: 'payload-mcp-confirmations',
          data: {
            deniedAt: new Date(),
            deniedBy,
            denyReason: reason,
            status: 'denied',
          },
        })

        return result as unknown as PendingConfirmation
      } catch (error) {
        payload.logger.error({ err: error, msg: '[payload-mcp] Failed to deny confirmation' })
        return null
      }
    },

    /**
     * Send webhook notification for confirmation
     */
    async sendWebhookNotification(
      confirmationId: string,
      message: string,
      request: ConfirmationRequest,
    ): Promise<void> {
      if (!webhookUrl) {
        return
      }

      const body = {
        type: 'confirmation_required',
        collectionSlug: request.collectionSlug,
        confirmationId,
        documentId: request.documentId,
        message,
        operation: request.operation,
        timestamp: new Date().toISOString(),
        toolName: request.toolName,
        userId: request.userId,
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (webhookSecret) {
        // Add HMAC signature
        const encoder = new TextEncoder()
        const key = await crypto.subtle.importKey(
          'raw',
          encoder.encode(webhookSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign'],
        )
        const signature = await crypto.subtle.sign(
          'HMAC',
          key,
          encoder.encode(JSON.stringify(body)),
        )
        headers['X-MCP-Signature'] = Buffer.from(signature).toString('hex')
      }

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 30000) // 30s timeout

        await fetch(webhookUrl, {
          body: JSON.stringify(body),
          headers,
          method: 'POST',
          signal: controller.signal,
        })

        clearTimeout(timeoutId)
      } catch {
        // Webhook failures are non-blocking - confirmation still created
      }
    },

    /**
     * Expire old pending confirmations
     */
    async expireConfirmations(payload: Payload): Promise<number> {
      const now = new Date()

      try {
        const result = await payload.update({
          collection: 'payload-mcp-confirmations',
          data: {
            status: 'expired',
          },
          where: {
            expiresAt: { less_than: now },
            status: { equals: 'pending' },
          },
        })

        return Array.isArray(result.docs) ? result.docs.length : 0
      } catch (error) {
        payload.logger.error({ err: error, msg: '[payload-mcp] Failed to expire confirmations' })
        return 0
      }
    },

    /**
     * Get pending confirmations for a user
     */
    async getPendingForUser(payload: Payload, userId: string): Promise<PendingConfirmation[]> {
      const result = await payload.find({
        collection: 'payload-mcp-confirmations',
        sort: '-createdAt',
        where: {
          expiresAt: { greater_than: new Date() },
          status: { equals: 'pending' },
          userId: { equals: userId },
        },
      })

      return result.docs as unknown as PendingConfirmation[]
    },

    /**
     * Cleanup expired and old confirmations
     */
    async cleanup(payload: Payload, retentionDays: number = 30): Promise<number> {
      // First expire pending confirmations
      await this.expireConfirmations(payload)

      // Then delete old confirmations
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

      const result = await payload.delete({
        collection: 'payload-mcp-confirmations',
        where: {
          createdAt: { less_than: cutoffDate },
        },
      })

      return Array.isArray(result.docs) ? result.docs.length : 0
    },
  }
}

export type ConfirmationManager = ReturnType<typeof createConfirmationManager>
