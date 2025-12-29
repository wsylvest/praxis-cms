/**
 * MCP Undo Store Collection
 *
 * Stores previous document states for undo/rollback functionality.
 */

import type { CollectionConfig } from 'payload'

export interface UndoEntry {
  apiKeyId: string
  auditLogId?: string
  collectionSlug: string
  documentId: string
  executedAt?: Date
  executedBy?: string
  expiresAt: Date
  id?: string
  metadata?: Record<string, unknown>
  newState: null | Record<string, unknown>
  operation: 'create' | 'delete' | 'update'
  previousState: null | Record<string, unknown>
  toolName: string
  undoStatus: 'available' | 'executed' | 'expired' | 'unavailable'
  userId: string
}

export const createUndoStoreCollection = (): CollectionConfig => {
  return {
    slug: 'payload-mcp-undo-store',
    access: {
      // Users can read their own undo entries, admins can read all
      read: ({ req: { user } }) => {
        if (!user) {
          return false
        }
        if ((user as any).roles?.includes('admin')) {
          return true
        }
        return {
          userId: { equals: String(user.id) },
        }
      },
      // System creates undo entries
      create: () => true,
      // System updates undo entries
      update: () => true,
      // Only admins can delete
      delete: ({ req: { user } }) => {
        if (!user) {
          return false
        }
        return (user as any).roles?.includes('admin') || false
      },
    },
    admin: {
      defaultColumns: ['toolName', 'collectionSlug', 'operation', 'undoStatus', 'expiresAt'],
      description: 'Stores previous document states for undo functionality',
      group: 'MCP',
      useAsTitle: 'toolName',
    },
    fields: [
      // Identity
      {
        name: 'apiKeyId',
        type: 'text',
        admin: {
          description: 'API key that performed the action',
        },
        index: true,
        required: true,
      },
      {
        name: 'userId',
        type: 'text',
        admin: {
          description: 'User who performed the action',
        },
        index: true,
        required: true,
      },

      // Action details
      {
        name: 'toolName',
        type: 'text',
        admin: {
          description: 'Tool that was executed',
        },
        required: true,
      },
      {
        name: 'operation',
        type: 'select',
        admin: {
          description: 'Type of operation performed',
        },
        options: [
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
          { label: 'Delete', value: 'delete' },
        ],
        required: true,
      },
      {
        name: 'collectionSlug',
        type: 'text',
        admin: {
          description: 'Collection that was modified',
        },
        index: true,
        required: true,
      },
      {
        name: 'documentId',
        type: 'text',
        admin: {
          description: 'Document that was modified',
        },
        index: true,
        required: true,
      },

      // State snapshots
      {
        name: 'previousState',
        type: 'json',
        admin: {
          description: 'Document state before the operation (null for create)',
        },
      },
      {
        name: 'newState',
        type: 'json',
        admin: {
          description: 'Document state after the operation (null for delete)',
        },
      },

      // Undo status
      {
        name: 'undoStatus',
        type: 'select',
        admin: {
          description: 'Current status of the undo entry',
        },
        defaultValue: 'available',
        index: true,
        options: [
          { label: 'Available', value: 'available' },
          { label: 'Executed', value: 'executed' },
          { label: 'Expired', value: 'expired' },
          { label: 'Unavailable', value: 'unavailable' },
        ],
        required: true,
      },
      {
        name: 'expiresAt',
        type: 'date',
        admin: {
          date: {
            displayFormat: 'yyyy-MM-dd HH:mm:ss',
          },
          description: 'When the undo option expires',
        },
        index: true,
        required: true,
      },

      // Execution tracking
      {
        name: 'executedAt',
        type: 'date',
        admin: {
          date: {
            displayFormat: 'yyyy-MM-dd HH:mm:ss',
          },
          description: 'When the undo was executed',
        },
      },
      {
        name: 'executedBy',
        type: 'text',
        admin: {
          description: 'Who executed the undo',
        },
      },

      // Reference to audit log
      {
        name: 'auditLogId',
        type: 'text',
        admin: {
          description: 'ID of the related audit log entry',
        },
      },

      // Additional context
      {
        name: 'metadata',
        type: 'json',
        admin: {
          description: 'Additional metadata',
        },
      },
    ],
    indexes: [
      {
        fields: ['userId', 'undoStatus'],
      },
      {
        fields: ['collectionSlug', 'documentId'],
      },
      {
        fields: ['undoStatus', 'expiresAt'],
      },
    ],
    labels: {
      plural: 'Undo Entries',
      singular: 'Undo Entry',
    },
    timestamps: true,
  }
}
