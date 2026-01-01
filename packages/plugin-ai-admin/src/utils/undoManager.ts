import type { Payload } from 'payload'

import { v4 as uuid } from 'uuid'

import type { UndoAction, UndoManager } from '../types/index.js'

interface UndoManagerConfig {
  maxActionsPerSession: number
  retentionHours: number
}

/**
 * Undo Manager - handles saving and executing undo actions
 */
export class PayloadUndoManager implements UndoManager {
  private collectionSlug = 'ai-admin-undo-actions'
  private config: UndoManagerConfig
  private payload: Payload

  constructor(payload: Payload, config?: Partial<UndoManagerConfig>) {
    this.payload = payload
    this.config = {
      maxActionsPerSession: config?.maxActionsPerSession ?? 50,
      retentionHours: config?.retentionHours ?? 24,
    }
  }

  /**
   * Enforce session action limit
   */
  private async enforceSessionLimit(sessionId: string): Promise<void> {
    const actions = await this.payload.find({
      collection: this.collectionSlug,
      limit: this.config.maxActionsPerSession + 10,
      sort: '-createdAt',
      where: {
        and: [
          { sessionId: { equals: sessionId } },
          { status: { equals: 'available' } },
        ],
      },
    })

    // Delete oldest if over limit
    if (actions.docs.length > this.config.maxActionsPerSession) {
      const toDelete = actions.docs.slice(this.config.maxActionsPerSession)
      await Promise.all(
        toDelete.map((doc: any) =>
          this.payload.update({
            id: doc.id,
            collection: this.collectionSlug,
            data: { status: 'expired' },
          })
        )
      )
    }
  }

  /**
   * Cleanup expired actions
   */
  async cleanup(): Promise<void> {
    // Find and mark expired actions
    const expired = await this.payload.find({
      collection: this.collectionSlug,
      limit: 1000,
      where: {
        and: [
          { status: { equals: 'available' } },
          { expiresAt: { less_than: new Date().toISOString() } },
        ],
      },
    })

    if (expired.docs.length > 0) {
      await Promise.all(
        expired.docs.map((doc: any) =>
          this.payload.update({
            id: doc.id,
            collection: this.collectionSlug,
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
   * Get available undo actions for a session
   */
  async getAvailable(sessionId: string): Promise<UndoAction[]> {
    const result = await this.payload.find({
      collection: this.collectionSlug,
      limit: this.config.maxActionsPerSession,
      sort: '-createdAt',
      where: {
        and: [
          { sessionId: { equals: sessionId } },
          { status: { equals: 'available' } },
          { expiresAt: { greater_than: new Date().toISOString() } },
        ],
      },
    })

    return result.docs.map((doc: any) => ({
      id: doc.id as string,
      description: doc.description as string,
      expiresAt: new Date(doc.expiresAt as string),
      previousState: doc.previousState,
      reverseOperation: async () => {
        await this.undo(doc.id)
      },
      toolName: doc.toolName as string,
    }))
  }

  /**
   * Save an undoable action
   */
  async save(
    action: {
      collection: string
      conversationId?: string
      documentId?: string
      documentIds?: string[]
      newState?: unknown
      operation: 'bulk_delete' | 'bulk_update' | 'create' | 'delete' | 'update'
      sessionId: string
      userId: string
    } & Omit<UndoAction, 'id'>
  ): Promise<string> {
    const id = uuid()
    const expiresAt = action.expiresAt ||
      new Date(Date.now() + this.config.retentionHours * 60 * 60 * 1000)

    await this.payload.create({
      collection: this.collectionSlug,
      data: {
        id,
        collection: action.collection,
        conversationId: action.conversationId,
        description: action.description,
        documentId: action.documentId,
        documentIds: action.documentIds,
        expiresAt: expiresAt.toISOString(),
        newState: action.newState,
        operation: action.operation,
        previousState: action.previousState,
        sessionId: action.sessionId,
        status: 'available',
        toolName: action.toolName,
        userId: action.userId,
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
      id: actionId,
      collection: this.collectionSlug,
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
        id: actionId,
        collection: this.collectionSlug,
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
                    id: originalId as number | string | undefined,
                  },
                })
              })
            )
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
                    id: docId as string,
                    collection,
                    data,
                  })
                }
              })
            )
          }
          break

        case 'create':
          // Undo create = delete the document
          if (documentId) {
            await this.payload.delete({
              id: documentId,
              collection,
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
                id: originalId as number | string | undefined,
              },
            })
          }
          break

        case 'update':
          // Undo update = restore previous state
          if (documentId && previousState) {
            const { id: _id, createdAt: _ca, updatedAt: _ua, ...data } = previousState
            await this.payload.update({
              id: documentId,
              collection,
              data,
            })
          }
          break

        default:
          throw new Error(`Unknown operation type: ${operation}`)
      }

      // Mark action as undone
      await this.payload.update({
        id: actionId,
        collection: this.collectionSlug,
        data: {
          status: 'undone',
          undoneAt: new Date().toISOString(),
        },
      })
    } catch (error) {
      // Mark as failed
      await this.payload.update({
        id: actionId,
        collection: this.collectionSlug,
        data: {
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          status: 'failed',
        },
      })
      throw error
    }
  }
}

/**
 * In-memory undo manager for development/testing
 */
export class InMemoryUndoManager implements UndoManager {
  private actions: Map<string, { sessionId: string } & UndoAction> = new Map()

  cleanup(): Promise<void> {
    const now = new Date()
    for (const [id, action] of this.actions) {
      if (action.expiresAt < now) {
        this.actions.delete(id)
      }
    }
    return Promise.resolve()
  }

  getAvailable(sessionId: string): Promise<UndoAction[]> {
    const now = new Date()
    const results = Array.from(this.actions.values())
      .filter((a) => a.sessionId === sessionId && a.expiresAt > now)
      .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())
    return Promise.resolve(results)
  }

  save(action: { sessionId: string } & Omit<UndoAction, 'id'>): Promise<string> {
    const id = uuid()
    this.actions.set(id, { ...action, id })
    return Promise.resolve(id)
  }

  async undo(actionId: string): Promise<void> {
    const action = this.actions.get(actionId)
    if (!action) {
      throw new Error('Undo action not found')
    }

    await action.reverseOperation()
    this.actions.delete(actionId)
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
