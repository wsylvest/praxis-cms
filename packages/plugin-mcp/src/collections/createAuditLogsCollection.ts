/**
 * MCP Audit Logs Collection
 *
 * Tracks all MCP tool executions for security auditing and debugging.
 */

import type { CollectionConfig } from 'payload'

export interface AuditLogEntry {
  apiKeyId: string
  apiKeyLabel?: string
  collectionSlug?: string
  confirmationId?: string
  confirmationRequired?: boolean
  documentId?: string
  errorCode?: string
  errorMessage?: string
  id?: string
  ipAddress?: string
  metadata?: Record<string, unknown>
  operation: 'create' | 'delete' | 'execute' | 'find' | 'other' | 'update'
  parameters: Record<string, unknown>
  requestId?: string
  responseTimeMs?: number
  result: 'denied' | 'error' | 'pending_confirmation' | 'rate_limited' | 'success'
  timestamp: Date
  tokensUsed?: number
  toolCategory: 'auth' | 'collection' | 'config' | 'custom' | 'job' | 'resource'
  toolName: string
  undoAvailable?: boolean
  undoId?: string
  userAgent?: string
  userEmail?: string
  userId: string
}

export const createAuditLogsCollection = (): CollectionConfig => {
  return {
    slug: 'payload-mcp-audit-logs',
    access: {
      // Only admins can read audit logs
      read: ({ req: { user } }) => {
        if (!user) {
          return false
        }
        return (user as any).roles?.includes('admin') || false
      },
      // System creates logs, no user creation
      create: () => true,
      // Logs are immutable
      update: () => false,
      // Only admins can delete (for cleanup)
      delete: ({ req: { user } }) => {
        if (!user) {
          return false
        }
        return (user as any).roles?.includes('admin') || false
      },
    },
    admin: {
      defaultColumns: ['timestamp', 'toolName', 'operation', 'result', 'userId'],
      description: 'Audit trail of all MCP tool executions',
      group: 'MCP',
      useAsTitle: 'toolName',
    },
    fields: [
      // Timing
      {
        name: 'timestamp',
        type: 'date',
        admin: {
          date: {
            displayFormat: 'yyyy-MM-dd HH:mm:ss',
          },
          description: 'When the action occurred',
        },
        index: true,
        required: true,
      },
      {
        name: 'requestId',
        type: 'text',
        admin: {
          description: 'Unique request identifier for correlation',
        },
        index: true,
      },

      // Identity
      {
        name: 'apiKeyId',
        type: 'text',
        admin: {
          description: 'ID of the API key used',
        },
        index: true,
        required: true,
      },
      {
        name: 'apiKeyLabel',
        type: 'text',
        admin: {
          description: 'Label of the API key for easy identification',
        },
      },
      {
        name: 'userId',
        type: 'text',
        admin: {
          description: 'ID of the user associated with the API key',
        },
        index: true,
        required: true,
      },
      {
        name: 'userEmail',
        type: 'email',
        admin: {
          description: 'Email of the user for easy identification',
        },
      },

      // Action details
      {
        name: 'toolName',
        type: 'text',
        admin: {
          description: 'Name of the tool executed',
        },
        index: true,
        required: true,
      },
      {
        name: 'toolCategory',
        type: 'select',
        admin: {
          description: 'Category of the tool',
        },
        options: [
          { label: 'Resource (CRUD)', value: 'resource' },
          { label: 'Collection Schema', value: 'collection' },
          { label: 'Config', value: 'config' },
          { label: 'Job', value: 'job' },
          { label: 'Auth', value: 'auth' },
          { label: 'Custom Tool', value: 'custom' },
        ],
        required: true,
      },
      {
        name: 'operation',
        type: 'select',
        admin: {
          description: 'Type of operation performed',
        },
        index: true,
        options: [
          { label: 'Find/Read', value: 'find' },
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
          { label: 'Delete', value: 'delete' },
          { label: 'Execute', value: 'execute' },
          { label: 'Other', value: 'other' },
        ],
        required: true,
      },

      // Resource context
      {
        name: 'collectionSlug',
        type: 'text',
        admin: {
          description: 'Collection affected (if applicable)',
        },
        index: true,
      },
      {
        name: 'documentId',
        type: 'text',
        admin: {
          description: 'Document ID affected (if applicable)',
        },
        index: true,
      },

      // Input/Output
      {
        name: 'parameters',
        type: 'json',
        admin: {
          description: 'Parameters passed to the tool (sanitized)',
        },
      },

      // Result
      {
        name: 'result',
        type: 'select',
        admin: {
          description: 'Result of the operation',
        },
        index: true,
        options: [
          { label: 'Success', value: 'success' },
          { label: 'Error', value: 'error' },
          { label: 'Denied', value: 'denied' },
          { label: 'Rate Limited', value: 'rate_limited' },
          { label: 'Pending Confirmation', value: 'pending_confirmation' },
        ],
        required: true,
      },
      {
        name: 'errorMessage',
        type: 'textarea',
        admin: {
          description: 'Error message if operation failed',
        },
      },
      {
        name: 'errorCode',
        type: 'text',
        admin: {
          description: 'Error code if operation failed',
        },
      },

      // Client info
      {
        name: 'ipAddress',
        type: 'text',
        admin: {
          description: 'Client IP address',
        },
      },
      {
        name: 'userAgent',
        type: 'text',
        admin: {
          description: 'Client user agent',
        },
      },

      // Performance
      {
        name: 'responseTimeMs',
        type: 'number',
        admin: {
          description: 'Response time in milliseconds',
        },
      },
      {
        name: 'tokensUsed',
        type: 'number',
        admin: {
          description: 'Tokens used (if tracked)',
        },
      },

      // Confirmation & Undo
      {
        name: 'confirmationRequired',
        type: 'checkbox',
        admin: {
          description: 'Whether this action required confirmation',
        },
        defaultValue: false,
      },
      {
        name: 'confirmationId',
        type: 'text',
        admin: {
          description: 'ID of the confirmation request',
        },
      },
      {
        name: 'undoAvailable',
        type: 'checkbox',
        admin: {
          description: 'Whether this action can be undone',
        },
        defaultValue: false,
      },
      {
        name: 'undoId',
        type: 'text',
        admin: {
          description: 'ID for undoing this action',
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
        fields: ['timestamp', 'apiKeyId'],
      },
      {
        fields: ['userId', 'timestamp'],
      },
      {
        fields: ['toolName', 'result'],
      },
    ],
    timestamps: true,
  }
}
