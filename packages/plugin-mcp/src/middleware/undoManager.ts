/**
 * MCP Undo Manager
 *
 * Service for managing undo functionality for MCP operations.
 * Captures document state before destructive operations and allows rollback.
 */

import type { Payload } from 'payload'

import type { UndoEntry } from '../collections/createUndoStoreCollection.js'

export interface UndoConfig {
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
   * Collections that support undo
   * If not specified, all collections support undo
   */
  enabledCollections?: string[]

  /**
   * Fields to exclude from state snapshots
   */
  excludeFields?: string[]

  /**
   * Undo expiration time in milliseconds
   * @default 3600000 (1 hour)
   */
  expirationMs?: number

  /**
   * Maximum number of undo entries per user
   * @default 100
   */
  maxEntriesPerUser?: number

  /**
   * Operations that support undo
   * @default ['create', 'update', 'delete']
   */
  supportedOperations?: Array<'create' | 'delete' | 'update'>
}

export interface SaveStateRequest {
  apiKeyId: string
  auditLogId?: string
  collectionSlug: string
  documentId: string
  metadata?: Record<string, unknown>
  operation: 'create' | 'delete' | 'update'
  toolName: string
  userId: string
}

export interface UndoResult {
  error?: string
  restoredDocument?: Record<string, unknown>
  success: boolean
  undoEntry?: UndoEntry
}

/**
 * Create an undo manager instance
 */
export function createUndoManager(config: UndoConfig = {}) {
  const {
    disabledCollections = [],
    enabled = true,
    enabledCollections,
    excludeFields = ['password', 'hash', 'salt', 'resetPasswordToken'],
    expirationMs = 60 * 60 * 1000, // 1 hour
    maxEntriesPerUser = 100,
    supportedOperations = ['create', 'update', 'delete'],
  } = config

  /**
   * Remove excluded fields from state
   */
  function sanitizeState(state: null | Record<string, unknown>): null | Record<string, unknown> {
    if (!state) {
      return null
    }

    const sanitized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(state)) {
      if (!excludeFields.includes(key)) {
        sanitized[key] = value
      }
    }
    return sanitized
  }

  return {
    /**
     * Check if undo is supported for this operation
     */
    isSupported(operation: string, collectionSlug: string): boolean {
      if (!enabled) {
        return false
      }
      if (!supportedOperations.includes(operation as any)) {
        return false
      }
      if (disabledCollections.includes(collectionSlug)) {
        return false
      }
      if (enabledCollections && !enabledCollections.includes(collectionSlug)) {
        return false
      }
      return true
    },

    /**
     * Save document state before an operation
     */
    async saveState(payload: Payload, request: SaveStateRequest): Promise<null | string> {
      if (!this.isSupported(request.operation, request.collectionSlug)) {
        return null
      }

      let previousState: null | Record<string, unknown> = null
      const newState: null | Record<string, unknown> = null

      try {
        // For update and delete, capture the previous state
        if (request.operation === 'update' || request.operation === 'delete') {
          const existingDoc = await payload.findByID({
            id: request.documentId,
            collection: request.collectionSlug,
          })
          previousState = sanitizeState(existingDoc as unknown as Record<string, unknown>)
        }

        // For create and update, we'll capture the new state after the operation
        // This is a placeholder that gets updated via updateNewState

        const expiresAt = new Date(Date.now() + expirationMs)

        const undoEntry: Omit<UndoEntry, 'id'> = {
          apiKeyId: request.apiKeyId,
          auditLogId: request.auditLogId,
          collectionSlug: request.collectionSlug,
          documentId: request.documentId,
          expiresAt,
          metadata: request.metadata,
          newState,
          operation: request.operation,
          previousState,
          toolName: request.toolName,
          undoStatus: 'available',
          userId: request.userId,
        }

        const result = await payload.create({
          collection: 'payload-mcp-undo-store',
          data: undoEntry as any,
        })

        // Enforce max entries per user
        await this.enforceMaxEntries(payload, request.userId)

        return String(result.id)
      } catch (error) {
        payload.logger.error({ err: error, msg: '[payload-mcp] Failed to save undo state' })
        return null
      }
    },

    /**
     * Update the new state after an operation completes
     */
    async updateNewState(
      payload: Payload,
      undoId: string,
      newState: Record<string, unknown>,
    ): Promise<void> {
      try {
        await payload.update({
          id: undoId,
          collection: 'payload-mcp-undo-store',
          data: {
            newState: sanitizeState(newState),
          },
        })
      } catch (error) {
        payload.logger.error({ err: error, msg: '[payload-mcp] Failed to update undo new state' })
      }
    },

    /**
     * Mark an undo entry as unavailable (e.g., document was modified again)
     */
    async markUnavailable(
      payload: Payload,
      collectionSlug: string,
      documentId: string,
    ): Promise<void> {
      try {
        await payload.update({
          collection: 'payload-mcp-undo-store',
          data: {
            undoStatus: 'unavailable',
          },
          where: {
            collectionSlug: { equals: collectionSlug },
            documentId: { equals: documentId },
            undoStatus: { equals: 'available' },
          },
        })
      } catch (error) {
        payload.logger.error({
          err: error,
          msg: '[payload-mcp] Failed to mark undo as unavailable',
        })
      }
    },

    /**
     * Execute an undo operation
     */
    async executeUndo(payload: Payload, undoId: string, executedBy: string): Promise<UndoResult> {
      try {
        const undoEntry = (await payload.findByID({
          id: undoId,
          collection: 'payload-mcp-undo-store',
        })) as unknown as UndoEntry

        if (!undoEntry) {
          return { error: 'Undo entry not found', success: false }
        }

        if (undoEntry.undoStatus !== 'available') {
          return { error: `Undo is ${undoEntry.undoStatus}`, success: false, undoEntry }
        }

        if (new Date(undoEntry.expiresAt) < new Date()) {
          await payload.update({
            id: undoId,
            collection: 'payload-mcp-undo-store',
            data: { undoStatus: 'expired' },
          })
          return { error: 'Undo has expired', success: false, undoEntry }
        }

        let restoredDocument: Record<string, unknown> | undefined

        // Execute the undo based on operation type
        switch (undoEntry.operation) {
          case 'create':
            // Undo create = delete the created document
            await payload.delete({
              id: undoEntry.documentId,
              collection: undoEntry.collectionSlug,
            })
            break

          case 'delete':
            // Undo delete = recreate the document
            if (!undoEntry.previousState) {
              return { error: 'No previous state to restore', success: false, undoEntry }
            }
            restoredDocument = (await payload.create({
              collection: undoEntry.collectionSlug,
              data: {
                ...undoEntry.previousState,
                id: undoEntry.documentId, // Try to preserve original ID
              },
            })) as unknown as Record<string, unknown>
            break

          case 'update':
            // Undo update = restore previous state
            if (!undoEntry.previousState) {
              return { error: 'No previous state to restore', success: false, undoEntry }
            }
            restoredDocument = (await payload.update({
              id: undoEntry.documentId,
              collection: undoEntry.collectionSlug,
              data: undoEntry.previousState,
            })) as unknown as Record<string, unknown>
            break
        }

        // Mark undo as executed
        await payload.update({
          id: undoId,
          collection: 'payload-mcp-undo-store',
          data: {
            executedAt: new Date(),
            executedBy,
            undoStatus: 'executed',
          },
        })

        return {
          restoredDocument,
          success: true,
          undoEntry: { ...undoEntry, undoStatus: 'executed' },
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        payload.logger.error({ err: error, msg: '[payload-mcp] Failed to execute undo' })
        return { error: message, success: false }
      }
    },

    /**
     * Get available undos for a user
     */
    async getAvailableUndos(
      payload: Payload,
      userId: string,
      limit: number = 10,
    ): Promise<UndoEntry[]> {
      const result = await payload.find({
        collection: 'payload-mcp-undo-store',
        limit,
        sort: '-createdAt',
        where: {
          expiresAt: { greater_than: new Date() },
          undoStatus: { equals: 'available' },
          userId: { equals: userId },
        },
      })

      return result.docs as unknown as UndoEntry[]
    },

    /**
     * Get undo entry by ID
     */
    async getUndoEntry(payload: Payload, undoId: string): Promise<null | UndoEntry> {
      try {
        const result = await payload.findByID({
          id: undoId,
          collection: 'payload-mcp-undo-store',
        })
        return result as unknown as UndoEntry
      } catch {
        return null
      }
    },

    /**
     * Enforce maximum entries per user
     */
    async enforceMaxEntries(payload: Payload, userId: string): Promise<void> {
      const result = await payload.find({
        collection: 'payload-mcp-undo-store',
        limit: maxEntriesPerUser + 50, // Get extra to check count
        sort: '-createdAt',
        where: {
          userId: { equals: userId },
        },
      })

      if (result.docs.length > maxEntriesPerUser) {
        // Delete oldest entries
        const toDelete = result.docs.slice(maxEntriesPerUser)
        for (const doc of toDelete) {
          try {
            await payload.delete({
              id: doc.id,
              collection: 'payload-mcp-undo-store',
            })
          } catch {
            // Ignore deletion errors
          }
        }
      }
    },

    /**
     * Expire old undo entries
     */
    async expireEntries(payload: Payload): Promise<number> {
      const now = new Date()

      try {
        const result = await payload.update({
          collection: 'payload-mcp-undo-store',
          data: {
            undoStatus: 'expired',
          },
          where: {
            expiresAt: { less_than: now },
            undoStatus: { equals: 'available' },
          },
        })

        return Array.isArray(result.docs) ? result.docs.length : 0
      } catch (error) {
        payload.logger.error({ err: error, msg: '[payload-mcp] Failed to expire undo entries' })
        return 0
      }
    },

    /**
     * Cleanup old undo entries
     */
    async cleanup(payload: Payload, retentionDays: number = 7): Promise<number> {
      // First expire available entries
      await this.expireEntries(payload)

      // Then delete old entries
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

      const result = await payload.delete({
        collection: 'payload-mcp-undo-store',
        where: {
          createdAt: { less_than: cutoffDate },
        },
      })

      return Array.isArray(result.docs) ? result.docs.length : 0
    },
  }
}

export type UndoManager = ReturnType<typeof createUndoManager>
