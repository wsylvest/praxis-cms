import type { CollectionConfig } from 'payload'

/**
 * Undo Actions Collection
 * Stores reversible actions for undo/rollback functionality
 */
export const createUndoActionsCollection = (
  override?: (config: CollectionConfig) => CollectionConfig
): CollectionConfig => {
  const config: CollectionConfig = {
    slug: 'ai-admin-undo-actions',
    labels: {
      singular: 'Undo Action',
      plural: 'Undo Actions',
    },
    admin: {
      group: 'AI Admin',
      description: 'Reversible actions for undo/rollback',
      defaultColumns: ['description', 'toolName', 'status', 'createdAt'],
    },
    access: {
      read: ({ req }) => {
        if (!req.user) return false
        if ((req.user as any).role === 'admin') return true
        return {
          userId: { equals: req.user.id },
        }
      },
      create: () => false, // Created programmatically
      update: () => false, // Immutable after creation
      delete: ({ req }) => {
        return (req.user as any)?.role === 'admin'
      },
    },
    fields: [
      {
        name: 'userId',
        type: 'text',
        required: true,
        index: true,
      },
      {
        name: 'sessionId',
        type: 'text',
        required: true,
        index: true,
      },
      {
        name: 'conversationId',
        type: 'text',
        index: true,
      },
      {
        name: 'toolName',
        type: 'text',
        required: true,
        index: true,
      },
      {
        name: 'description',
        type: 'text',
        required: true,
        admin: {
          description: 'Human-readable description of the action',
        },
      },
      {
        name: 'operation',
        type: 'select',
        options: [
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
          { label: 'Delete', value: 'delete' },
          { label: 'Bulk Update', value: 'bulk_update' },
          { label: 'Bulk Delete', value: 'bulk_delete' },
        ],
        required: true,
      },
      {
        name: 'collection',
        type: 'text',
        required: true,
        admin: {
          description: 'Target collection',
        },
      },
      {
        name: 'documentId',
        type: 'text',
        admin: {
          description: 'Target document ID (for single doc operations)',
        },
      },
      {
        name: 'documentIds',
        type: 'json',
        admin: {
          description: 'Target document IDs (for bulk operations)',
        },
      },
      {
        name: 'previousState',
        type: 'json',
        required: true,
        admin: {
          description: 'State before the action (for rollback)',
        },
      },
      {
        name: 'newState',
        type: 'json',
        admin: {
          description: 'State after the action',
        },
      },
      {
        name: 'status',
        type: 'select',
        options: [
          { label: 'Available', value: 'available' },
          { label: 'Undone', value: 'undone' },
          { label: 'Expired', value: 'expired' },
          { label: 'Failed', value: 'failed' },
        ],
        defaultValue: 'available',
        required: true,
        index: true,
      },
      {
        name: 'undoneAt',
        type: 'date',
        admin: {
          description: 'When the action was undone',
        },
      },
      {
        name: 'expiresAt',
        type: 'date',
        required: true,
        index: true,
        admin: {
          description: 'When the undo option expires',
        },
      },
      {
        name: 'errorMessage',
        type: 'text',
        admin: {
          description: 'Error message if undo failed',
        },
      },
    ],
    timestamps: true,
  }

  return override ? override(config) : config
}
