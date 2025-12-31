import type { Payload } from 'payload'
import { v4 as uuid } from 'uuid'

import type { UndoAction, UndoManager } from '../types/index.js'

interface UndoManagerConfig {
  retentionHours: number
  maxActionsPerSession: number
}

/**
 * Undo Manager - handles saving and executing undo actions
 */
export class PayloadUndoManager implements UndoManager {
  private payload: Payload
  private config: UndoManagerConfig
  private collectionSlug = 'ai-admin-undo-actions'

  constructor(payload: Payload, config?: Partial<UndoManagerConfig>) {
    this.payload = payload
    this.config = {
      retentionHours: config?.retentionHours ?? 24,
      maxActionsPerSession: config?.maxActionsPerSession ?? 50,
    }
  }

  /**
   * Save an undoable action
   */
  async save(
    action: Omit<UndoAction, 'id'> & {
      userId: string
      sessionId: string
      conversationId?: string
      operation: 'create' | 'update' | 'delete' | 'bulk_update' | 'bulk_delete'
      collection: string
      documentId?: string
      documentIds?: string[]
      newState?: unknown
    }
  ): Promise<string> {
    const id = uuid()
    const expiresAt = action.expiresAt ||
      new Date(Date.now() + this.config.retentionHours * 60 * 60 * 1000)

    await this.payload.create({
      collection: this.collectionSlug,
      data: {
        id,
        userId: action.userId,
        sessionId: action.sessionId,
        conversationId: action.conversationId,
        toolName: action.toolName,
        description: action.description,
        operation: action.operation,
        collection: action.collection,
        documentId: action.documentId,
        documentIds: action.documentIds,
        previousState: action.previousState,
        newState: action.newState,
        status: 'available',
        expiresAt: expiresAt.toISOString(),
      },
    })

    // Cleanup old actions for this session if over limit
    await this.enforceSessionLimit(action.sessionId)

    return id
  }

  /**
   * Execute an undo operation
   */
  async undo(actionId: string): Promise<void> {
    // Find the action
    const action = await this.payload.findByID({
      collection: this.collectionSlug,
      id: actionId,
    })

    if (!action) {
      throw new Error('Undo action not found')
    }

    if ((action as any).status !== 'available') {
      throw new Error(`Cannot undo: action status is "${(action as any).status}"`)
    }

    if (new Date((action as any).expiresAt) < new Date()) {
      // Mark as expired
      await this.payload.update({
        collection: this.collectionSlug,
        id: actionId,
        data: { status: 'expired' },
      })
      throw new Error('Cannot undo: action has expired')
    }

    try {
      // Execute the undo based on operation type
      const operation = (action as any).operation as string
      const collection = (action as any).collection as string
      const previousState = (action as any).previousState as Record<string, unknown>
      const documentId = (action as any).documentId as string | undefined
      const documentIds = (action as any).documentIds as string[] | undefined

      switch (operation) {
        case 'create':
          // Undo create = delete the document
          if (documentId) {
            await this.payload.delete({
              collection,
              id: documentId,
            })
          }
          break

        case 'update':
          // Undo update = restore previous state
          if (documentId && previousState) {
            const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = previousState
            await this.payload.update({
              collection,
              id: documentId,
              data,
            })
          }
          break

        case 'delete':
          // Undo delete = recreate the document
          if (previousState) {
            const { id: originalId, createdAt: _ca, updatedAt: _ua, ...data } = previousState
            await this.payload.create({
              collection,
              data: {
                ...data,
                // Try to preserve original ID if possible
                id: originalId as string | number | undefined,
              },
            })
          }
          break

        case 'bulk_update':
          // Undo bulk update = restore each document
          if (documentIds && Array.isArray(previousState)) {
            await Promise.all(
              (previousState as Array<Record<string, unknown>>).map(async (doc) => {
                const { id: docId, createdAt: _ca, updatedAt: _ua, ...data } = doc
                if (docId) {
                  await this.payload.update({
                    collection,
                    id: docId as string,
                    data,
                  })
                }
              })
            )
          }
          break

        case 'bulk_delete':
          // Undo bulk delete = recreate all documents
          if (Array.isArray(previousState)) {
            await Promise.all(
              (previousState as Array<Record<string, unknown>>).map(async (doc) => {
                const { id: originalId, createdAt: _ca, updatedAt: _ua, ...data } = doc
                await this.payload.create({
                  collection,
                  data: {
                    ...data,
                    id: originalId as string | number | undefined,
                  },
                })
              })
            )
          }
          break

        default:
          throw new Error(`Unknown operation type: ${operation}`)
      }

      // Mark action as undone
      await this.payload.update({
        collection: this.collectionSlug,
        id: actionId,
        data: {
          status: 'undone',
          undoneAt: new Date().toISOString(),
        },
      })
    } catch (error) {
      // Mark as failed
      await this.payload.update({
        collection: this.collectionSlug,
        id: actionId,
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        },
      })
      throw error
    }
  }

  /**
   * Get available undo actions for a session
   */
  async getAvailable(sessionId: string): Promise<UndoAction[]> {
    const result = await this.payload.find({
      collection: this.collectionSlug,
      where: {
        and: [
          { sessionId: { equals: sessionId } },
          { status: { equals: 'available' } },
          { expiresAt: { greater_than: new Date().toISOString() } },
        ],
      },
      sort: '-createdAt',
      limit: this.config.maxActionsPerSession,
    })

    return result.docs.map((doc: any) => ({
      id: doc.id as string,
      toolName: doc.toolName as string,
      description: doc.description as string,
      previousState: doc.previousState,
      reverseOperation: async () => {
        await this.undo(doc.id)
      },
      expiresAt: new Date(doc.expiresAt as string),
    }))
  }

  /**
   * Cleanup expired actions
   */
  async cleanup(): Promise<void> {
    // Find and mark expired actions
    const expired = await this.payload.find({
      collection: this.collectionSlug,
      where: {
        and: [
          { status: { equals: 'available' } },
          { expiresAt: { less_than: new Date().toISOString() } },
        ],
      },
      limit: 1000,
    })

    if (expired.docs.length > 0) {
      await Promise.all(
        expired.docs.map((doc: any) =>
          this.payload.update({
            collection: this.collectionSlug,
            id: doc.id,
            data: { status: 'expired' },
          })
        )
      )
    }

    // Delete old expired/undone/failed actions (older than retention period)
    const cutoffDate = new Date(
      Date.now() - this.config.retentionHours * 2 * 60 * 60 * 1000
    )

    await this.payload.delete({
      collection: this.collectionSlug,
      where: {
        and: [
          { status: { in: ['expired', 'undone', 'failed'] } },
          { createdAt: { less_than: cutoffDate.toISOString() } },
        ],
      },
    })
  }

  /**
   * Enforce session action limit
   */
  private async enforceSessionLimit(sessionId: string): Promise<void> {
    const actions = await this.payload.find({
      collection: this.collectionSlug,
      where: {
        and: [
          { sessionId: { equals: sessionId } },
          { status: { equals: 'available' } },
        ],
      },
      sort: '-createdAt',
      limit: this.config.maxActionsPerSession + 10,
    })

    // Delete oldest if over limit
    if (actions.docs.length > this.config.maxActionsPerSession) {
      const toDelete = actions.docs.slice(this.config.maxActionsPerSession)
      await Promise.all(
        toDelete.map((doc: any) =>
          this.payload.update({
            collection: this.collectionSlug,
            id: doc.id,
            data: { status: 'expired' },
          })
        )
      )
    }
  }
}

/**
 * In-memory undo manager for development/testing
 */
export class InMemoryUndoManager implements UndoManager {
  private actions: Map<string, UndoAction & { sessionId: string }> = new Map()

  async save(action: Omit<UndoAction, 'id'> & { sessionId: string }): Promise<string> {
    const id = uuid()
    this.actions.set(id, { ...action, id })
    return id
  }

  async undo(actionId: string): Promise<void> {
    const action = this.actions.get(actionId)
    if (!action) {
      throw new Error('Undo action not found')
    }

    await action.reverseOperation()
    this.actions.delete(actionId)
  }

  async getAvailable(sessionId: string): Promise<UndoAction[]> {
    const now = new Date()
    return Array.from(this.actions.values())
      .filter((a) => a.sessionId === sessionId && a.expiresAt > now)
      .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())
  }

  async cleanup(): Promise<void> {
    const now = new Date()
    for (const [id, action] of this.actions) {
      if (action.expiresAt < now) {
        this.actions.delete(id)
      }
    }
  }
}

/**
 * Create undo manager
 */
export function createUndoManager(
  payload?: Payload,
  config?: Partial<UndoManagerConfig>
): UndoManager {
  if (payload) {
    return new PayloadUndoManager(payload, config)
  }
  return new InMemoryUndoManager()
}
