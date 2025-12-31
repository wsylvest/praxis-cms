import type { CollectionConfig } from 'payload'

/**
 * AI Audit Logs Collection
 * Immutable log of all AI actions for security and compliance
 */
export const createAuditLogsCollection = (
  override?: (config: CollectionConfig) => CollectionConfig
): CollectionConfig => {
  const config: CollectionConfig = {
    slug: 'ai-admin-audit-logs',
    labels: {
      singular: 'Audit Log',
      plural: 'Audit Logs',
    },
    admin: {
      group: 'AI Admin',
      description: 'Immutable audit trail of all AI actions',
      defaultColumns: ['timestamp', 'userId', 'action', 'toolName', 'result'],
      pagination: {
        defaultLimit: 50,
      },
    },
    access: {
      // Only admins can read audit logs
      read: ({ req }) => {
        return (req.user as any)?.role === 'admin'
      },
      // Logs are created programmatically only
      create: () => false,
      // Logs are immutable
      update: () => false,
      delete: () => false,
    },
    fields: [
      {
        name: 'timestamp',
        type: 'date',
        required: true,
        admin: {
          date: {
            displayFormat: 'yyyy-MM-dd HH:mm:ss',
          },
        },
        index: true,
      },
      {
        name: 'userId',
        type: 'text',
        required: true,
        index: true,
        admin: {
          description: 'User who performed the action',
        },
      },
      {
        name: 'sessionId',
        type: 'text',
        required: true,
        index: true,
        admin: {
          description: 'Session identifier',
        },
      },
      {
        name: 'action',
        type: 'text',
        required: true,
        index: true,
        admin: {
          description: 'Action type (e.g., chat, tool_call, login)',
        },
      },
      {
        name: 'toolName',
        type: 'text',
        index: true,
        admin: {
          description: 'Name of the tool executed (if applicable)',
        },
      },
      {
        name: 'parameters',
        type: 'json',
        admin: {
          description: 'Parameters passed to the action/tool',
        },
      },
      {
        name: 'result',
        type: 'select',
        options: [
          { label: 'Success', value: 'success' },
          { label: 'Error', value: 'error' },
          { label: 'Denied', value: 'denied' },
          { label: 'Pending', value: 'pending' },
        ],
        required: true,
        index: true,
      },
      {
        name: 'errorMessage',
        type: 'text',
        admin: {
          description: 'Error message if action failed',
        },
      },
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
      {
        name: 'tokensUsed',
        type: 'number',
        admin: {
          description: 'Number of tokens consumed',
        },
      },
      {
        name: 'responseTimeMs',
        type: 'number',
        admin: {
          description: 'Response time in milliseconds',
        },
      },
      {
        name: 'provider',
        type: 'select',
        options: [
          { label: 'Claude', value: 'claude' },
          { label: 'OpenAI', value: 'openai' },
          { label: 'Gemini', value: 'gemini' },
          { label: 'Grok', value: 'grok' },
        ],
        admin: {
          description: 'AI provider used',
        },
      },
    ],
    timestamps: false, // We have our own timestamp field
  }

  return override ? override(config) : config
}
