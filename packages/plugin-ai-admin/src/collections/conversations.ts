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
    access: {
      // Users can only read their own conversations
      create: ({ req }) => !!req.user,
      delete: ({ req }) => {
        if (!req.user) {return false}
        if ((req.user as any).role === 'admin') {return true}
        return {
          user: { equals: req.user.id },
        }
      },
      read: ({ req }) => {
        if (!req.user) {return false}
        if ((req.user as any).role === 'admin') {return true}
        return {
          user: { equals: req.user.id },
        }
      },
      update: ({ req }) => {
        if (!req.user) {return false}
        if ((req.user as any).role === 'admin') {return true}
        return {
          user: { equals: req.user.id },
        }
      },
    },
    admin: {
      defaultColumns: ['title', 'user', 'messageCount', 'updatedAt'],
      description: 'AI conversation history with multi-turn memory',
      group: 'AI Admin',
      useAsTitle: 'title',
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
        admin: {
          description: 'User who owns this conversation',
        },
        relationTo: 'users',
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
        name: 'provider',
        type: 'select',
        admin: {
          description: 'AI provider used for this conversation',
        },
        defaultValue: 'claude',
        options: [
          { label: 'Claude', value: 'claude' },
          { label: 'OpenAI', value: 'openai' },
          { label: 'Gemini', value: 'gemini' },
          { label: 'Grok', value: 'grok' },
        ],
      },
      {
        name: 'messages',
        type: 'json',
        admin: {
          description: 'Array of conversation messages',
        },
        defaultValue: [],
        required: true,
      },
      {
        name: 'messageCount',
        type: 'number',
        admin: {
          description: 'Total number of messages',
          readOnly: true,
        },
        defaultValue: 0,
      },
      {
        name: 'toolHistory',
        type: 'json',
        admin: {
          description: 'History of tool executions in this conversation',
        },
        defaultValue: [],
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
            admin: {
              description: 'Selected document IDs',
            },
            defaultValue: [],
          },
          {
            name: 'metadata',
            type: 'json',
            admin: {
              description: 'Additional context metadata',
            },
            defaultValue: {},
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
        admin: {
          description: 'Conversation status',
        },
        defaultValue: 'active',
        options: [
          { label: 'Active', value: 'active' },
          { label: 'Archived', value: 'archived' },
        ],
      },
    ],
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
    labels: {
      plural: 'Conversations',
      singular: 'Conversation',
    },
    timestamps: true,
  }

  return override ? override(config) : config
}
