import type { CollectionConfig } from 'payload'

/**
 * AI Conversations Collection
 * Stores multi-turn conversation history for each session
 */
export const createConversationsCollection = (
  override?: (config: CollectionConfig) => CollectionConfig
): CollectionConfig => {
  const config: CollectionConfig = {
    slug: 'ai-admin-conversations',
    labels: {
      singular: 'Conversation',
      plural: 'Conversations',
    },
    admin: {
      group: 'AI Admin',
      description: 'AI conversation history with multi-turn memory',
      defaultColumns: ['title', 'user', 'messageCount', 'updatedAt'],
      useAsTitle: 'title',
    },
    access: {
      // Users can only read their own conversations
      read: ({ req }) => {
        if (!req.user) return false
        if ((req.user as any).role === 'admin') return true
        return {
          user: { equals: req.user.id },
        }
      },
      create: ({ req }) => !!req.user,
      update: ({ req }) => {
        if (!req.user) return false
        if ((req.user as any).role === 'admin') return true
        return {
          user: { equals: req.user.id },
        }
      },
      delete: ({ req }) => {
        if (!req.user) return false
        if ((req.user as any).role === 'admin') return true
        return {
          user: { equals: req.user.id },
        }
      },
    },
    fields: [
      {
        name: 'title',
        type: 'text',
        admin: {
          description: 'Auto-generated title from first message',
        },
      },
      {
        name: 'user',
        type: 'relationship',
        relationTo: 'users',
        required: true,
        admin: {
          description: 'User who owns this conversation',
        },
      },
      {
        name: 'sessionId',
        type: 'text',
        required: true,
        admin: {
          description: 'Session identifier',
        },
        index: true,
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
        defaultValue: 'claude',
        admin: {
          description: 'AI provider used for this conversation',
        },
      },
      {
        name: 'messages',
        type: 'json',
        required: true,
        defaultValue: [],
        admin: {
          description: 'Array of conversation messages',
        },
      },
      {
        name: 'messageCount',
        type: 'number',
        defaultValue: 0,
        admin: {
          description: 'Total number of messages',
          readOnly: true,
        },
      },
      {
        name: 'toolHistory',
        type: 'json',
        defaultValue: [],
        admin: {
          description: 'History of tool executions in this conversation',
        },
      },
      {
        name: 'context',
        type: 'group',
        admin: {
          description: 'Context metadata for the conversation',
        },
        fields: [
          {
            name: 'collection',
            type: 'text',
            admin: {
              description: 'Current collection being worked on',
            },
          },
          {
            name: 'documentIds',
            type: 'json',
            defaultValue: [],
            admin: {
              description: 'Selected document IDs',
            },
          },
          {
            name: 'metadata',
            type: 'json',
            defaultValue: {},
            admin: {
              description: 'Additional context metadata',
            },
          },
        ],
      },
      {
        name: 'tokenUsage',
        type: 'group',
        admin: {
          description: 'Token usage statistics',
        },
        fields: [
          {
            name: 'input',
            type: 'number',
            defaultValue: 0,
          },
          {
            name: 'output',
            type: 'number',
            defaultValue: 0,
          },
          {
            name: 'total',
            type: 'number',
            defaultValue: 0,
          },
        ],
      },
      {
        name: 'status',
        type: 'select',
        options: [
          { label: 'Active', value: 'active' },
          { label: 'Archived', value: 'archived' },
        ],
        defaultValue: 'active',
        admin: {
          description: 'Conversation status',
        },
      },
    ],
    timestamps: true,
    hooks: {
      beforeChange: [
        ({ data, operation }) => {
          // Auto-generate title from first user message
          if (operation === 'create' || !data.title) {
            const messages = data.messages || []
            const firstUserMessage = messages.find(
              (m: { role: string }) => m.role === 'user'
            )
            if (firstUserMessage?.content) {
              data.title = firstUserMessage.content.slice(0, 100) +
                (firstUserMessage.content.length > 100 ? '...' : '')
            } else {
              data.title = 'New Conversation'
            }
          }

          // Update message count
          data.messageCount = (data.messages || []).length

          return data
        },
      ],
    },
  }

  return override ? override(config) : config
}
