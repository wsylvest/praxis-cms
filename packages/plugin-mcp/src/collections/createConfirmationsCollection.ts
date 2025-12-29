/**
 * MCP Confirmations Collection
 *
 * Stores pending confirmations for destructive MCP operations.
 */

import type { CollectionConfig } from 'payload'

export interface PendingConfirmation {
  apiKeyId: string
  approvedAt?: Date
  approvedBy?: string
  collectionSlug?: string
  confirmationLevel: 'email' | 'inline' | 'webhook'
  deniedAt?: Date
  deniedBy?: string
  denyReason?: string
  documentId?: string
  expiresAt: Date
  id?: string
  message: string
  metadata?: Record<string, unknown>
  operation: 'create' | 'delete' | 'execute' | 'update'
  parameters: Record<string, unknown>
  status: 'approved' | 'denied' | 'expired' | 'pending'
  toolName: string
  userId: string
  webhookSecret?: string
  webhookUrl?: string
}

export const createConfirmationsCollection = (): CollectionConfig => {
  return {
    slug: 'payload-mcp-confirmations',
    access: {
      // Users can read their own confirmations, admins can read all
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
      // System creates confirmations
      create: () => true,
      // Users can approve/deny their own, admins can do all
      update: ({ req: { user } }) => {
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
      // Only admins can delete
      delete: ({ req: { user } }) => {
        if (!user) {
          return false
        }
        return (user as any).roles?.includes('admin') || false
      },
    },
    admin: {
      defaultColumns: ['toolName', 'status', 'expiresAt', 'userId'],
      description: 'Pending confirmations for destructive MCP operations',
      group: 'MCP',
      useAsTitle: 'toolName',
    },
    fields: [
      // Identity
      {
        name: 'apiKeyId',
        type: 'text',
        admin: {
          description: 'API key that initiated the action',
        },
        index: true,
        required: true,
      },
      {
        name: 'userId',
        type: 'text',
        admin: {
          description: 'User associated with the API key',
        },
        index: true,
        required: true,
      },

      // Action details
      {
        name: 'toolName',
        type: 'text',
        admin: {
          description: 'Tool that requires confirmation',
        },
        required: true,
      },
      {
        name: 'operation',
        type: 'select',
        admin: {
          description: 'Type of operation',
        },
        options: [
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
          { label: 'Delete', value: 'delete' },
          { label: 'Execute', value: 'execute' },
        ],
        required: true,
      },
      {
        name: 'collectionSlug',
        type: 'text',
        admin: {
          description: 'Collection affected',
        },
      },
      {
        name: 'documentId',
        type: 'text',
        admin: {
          description: 'Document ID affected',
        },
      },
      {
        name: 'parameters',
        type: 'json',
        admin: {
          description: 'Parameters for the operation',
        },
      },

      // Confirmation settings
      {
        name: 'confirmationLevel',
        type: 'select',
        admin: {
          description: 'How the confirmation should be obtained',
        },
        options: [
          { label: 'Inline (immediate)', value: 'inline' },
          { label: 'Email', value: 'email' },
          { label: 'Webhook', value: 'webhook' },
        ],
        required: true,
      },
      {
        name: 'message',
        type: 'textarea',
        admin: {
          description: 'Message shown to the user for confirmation',
        },
        required: true,
      },

      // Status
      {
        name: 'status',
        type: 'select',
        admin: {
          description: 'Current status of the confirmation',
        },
        defaultValue: 'pending',
        index: true,
        options: [
          { label: 'Pending', value: 'pending' },
          { label: 'Approved', value: 'approved' },
          { label: 'Denied', value: 'denied' },
          { label: 'Expired', value: 'expired' },
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
          description: 'When the confirmation expires',
        },
        index: true,
        required: true,
      },

      // Approval
      {
        name: 'approvedAt',
        type: 'date',
        admin: {
          date: {
            displayFormat: 'yyyy-MM-dd HH:mm:ss',
          },
          description: 'When the confirmation was approved',
        },
      },
      {
        name: 'approvedBy',
        type: 'text',
        admin: {
          description: 'Who approved the confirmation',
        },
      },

      // Denial
      {
        name: 'deniedAt',
        type: 'date',
        admin: {
          date: {
            displayFormat: 'yyyy-MM-dd HH:mm:ss',
          },
          description: 'When the confirmation was denied',
        },
      },
      {
        name: 'deniedBy',
        type: 'text',
        admin: {
          description: 'Who denied the confirmation',
        },
      },
      {
        name: 'denyReason',
        type: 'text',
        admin: {
          description: 'Reason for denial',
        },
      },

      // Webhook settings
      {
        name: 'webhookUrl',
        type: 'text',
        admin: {
          condition: (data) => data.confirmationLevel === 'webhook',
          description: 'Webhook URL for external confirmation',
        },
      },
      {
        name: 'webhookSecret',
        type: 'text',
        admin: {
          condition: (data) => data.confirmationLevel === 'webhook',
          description: 'Secret for webhook verification',
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
        fields: ['userId', 'status'],
      },
      {
        fields: ['status', 'expiresAt'],
      },
    ],
    labels: {
      plural: 'Confirmations',
      singular: 'Confirmation',
    },
    timestamps: true,
  }
}
