import type { CollectionConfig } from 'payload'

/**
 * AI Generated Drafts Collection
 * Stores AI-generated content before it's applied to documents
 */
export const createDraftsCollection = (
  override?: (config: CollectionConfig) => CollectionConfig
): CollectionConfig => {
  const config: CollectionConfig = {
    slug: 'ai-admin-drafts',
    access: {
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
      defaultColumns: ['title', 'collection', 'status', 'createdAt'],
      description: 'AI-generated content drafts awaiting review',
      group: 'AI Admin',
      useAsTitle: 'title',
    },
    fields: [
      {
        name: 'title',
        type: 'text',
        admin: {
          description: 'Draft title (auto-generated from content)',
        },
        required: true,
      },
      {
        name: 'user',
        type: 'relationship',
        relationTo: 'users',
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
        type: 'relationship',
        admin: {
          description: 'Conversation that generated this draft',
        },
        relationTo: 'ai-admin-conversations',
      },
      {
        name: 'collection',
        type: 'text',
        admin: {
          description: 'Target collection slug',
        },
        index: true,
        required: true,
      },
      {
        name: 'documentId',
        type: 'text',
        admin: {
          description: 'Target document ID (for updates)',
        },
      },
      {
        name: 'operation',
        type: 'select',
        defaultValue: 'create',
        options: [
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
        ],
        required: true,
      },
      {
        name: 'content',
        type: 'json',
        admin: {
          description: 'Generated content to be applied',
        },
        required: true,
      },
      {
        name: 'prompt',
        type: 'textarea',
        admin: {
          description: 'Original prompt that generated this content',
        },
        required: true,
      },
      {
        name: 'provider',
        type: 'select',
        admin: {
          description: 'AI provider that generated this draft',
        },
        options: [
          { label: 'Claude', value: 'claude' },
          { label: 'OpenAI', value: 'openai' },
          { label: 'Gemini', value: 'gemini' },
          { label: 'Grok', value: 'grok' },
        ],
      },
      {
        name: 'status',
        type: 'select',
        defaultValue: 'draft',
        index: true,
        options: [
          { label: 'Draft', value: 'draft' },
          { label: 'Applied', value: 'applied' },
          { label: 'Discarded', value: 'discarded' },
          { label: 'Expired', value: 'expired' },
        ],
        required: true,
      },
      {
        name: 'appliedAt',
        type: 'date',
        admin: {
          description: 'When the draft was applied',
        },
      },
      {
        name: 'appliedDocumentId',
        type: 'text',
        admin: {
          description: 'ID of the created/updated document',
        },
      },
      {
        name: 'expiresAt',
        type: 'date',
        admin: {
          description: 'When the draft expires',
        },
        required: true,
      },
      {
        name: 'diff',
        type: 'json',
        admin: {
          description: 'Diff from original document (for updates)',
        },
      },
    ],
    hooks: {
      beforeChange: [
        ({ data, operation }) => {
          // Set expiration to 24 hours from now if not set
          if (operation === 'create' && !data.expiresAt) {
            data.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          }

          // Generate title from content if not set
          if (!data.title && data.content) {
            const content = data.content
            data.title =
              content.title ||
              content.name ||
              `Draft for ${data.collection}`
          }

          return data
        },
      ],
    },
    labels: {
      plural: 'AI Drafts',
      singular: 'AI Draft',
    },
    timestamps: true,
  }

  return override ? override(config) : config
}
