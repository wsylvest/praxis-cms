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
    access: {
      create: () => false, // Created programmatically
      delete: ({ req }) => {
        return (req.user as any)?.role === 'admin'
      },
      read: ({ req }) => {
        if (!req.user) {return false}
        if ((req.user as any).role === 'admin') {return true}
        return {
          userId: { equals: req.user.id },
        }
      },
      update: () => false, // Immutable after creation
    },
    admin: {
      defaultColumns: ['description', 'toolName', 'status', 'createdAt'],
      description: 'Reversible actions for undo/rollback',
      group: 'AI Admin',
    },
    fields: [
      {
        name: 'userId',
        type: 'text',
        index: true,
        required: true,
      },
      {
        name: 'sessionId',
        type: 'text',
        index: true,
        required: true,
      },
      {
        name: 'conversationId',
        type: 'text',
        index: true,
      },
      {
        name: 'toolName',
        type: 'text',
        index: true,
        required: true,
      },
      {
        name: 'description',
        type: 'text',
        admin: {
          description: 'Human-readable description of the action',
        },
        required: true,
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
        admin: {
          description: 'Target collection',
        },
        required: true,
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
        admin: {
          description: 'State before the action (for rollback)',
        },
        required: true,
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
        defaultValue: 'available',
        index: true,
        options: [
          { label: 'Available', value: 'available' },
          { label: 'Undone', value: 'undone' },
          { label: 'Expired', value: 'expired' },
          { label: 'Failed', value: 'failed' },
        ],
        required: true,
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
        admin: {
          description: 'When the undo option expires',
        },
        index: true,
        required: true,
      },
      {
        name: 'errorMessage',
        type: 'text',
        admin: {
          description: 'Error message if undo failed',
        },
      },
    ],
    labels: {
      plural: 'Undo Actions',
      singular: 'Undo Action',
    },
    timestamps: true,
  }

  return override ? override(config) : config
}
