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
    access: {
      // Only admins can read audit logs
      read: ({ req }) => {
        return (req.user as any)?.role === 'admin'
      },
      // Logs are created programmatically only
      create: () => false,
      // Logs are immutable
      delete: () => false,
      update: () => false,
    },
    admin: {
      defaultColumns: ['timestamp', 'userId', 'action', 'toolName', 'result'],
      description: 'Immutable audit trail of all AI actions',
      group: 'AI Admin',
      pagination: {
        defaultLimit: 50,
      },
    },
    fields: [
      {
        name: 'timestamp',
        type: 'date',
        admin: {
          date: {
            displayFormat: 'yyyy-MM-dd HH:mm:ss',
          },
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
      {
        name: 'sessionId',
        type: 'text',
        admin: {
          description: 'Session identifier',
        },
        index: true,
        required: true,
      },
      {
        name: 'action',
        type: 'text',
        admin: {
          description: 'Action type (e.g., chat, tool_call, login)',
        },
        index: true,
        required: true,
      },
      {
        name: 'toolName',
        type: 'text',
        admin: {
          description: 'Name of the tool executed (if applicable)',
        },
        index: true,
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
        index: true,
        options: [
          { label: 'Success', value: 'success' },
          { label: 'Error', value: 'error' },
          { label: 'Denied', value: 'denied' },
          { label: 'Pending', value: 'pending' },
        ],
        required: true,
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
        admin: {
          description: 'AI provider used',
        },
        options: [
          { label: 'Claude', value: 'claude' },
          { label: 'OpenAI', value: 'openai' },
          { label: 'Gemini', value: 'gemini' },
          { label: 'Grok', value: 'grok' },
        ],
      },
    ],
    labels: {
      plural: 'Audit Logs',
      singular: 'Audit Log',
    },
    timestamps: false, // We have our own timestamp field
  }

  return override ? override(config) : config
}
