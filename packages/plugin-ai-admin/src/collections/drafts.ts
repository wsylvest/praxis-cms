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
    labels: {
      singular: 'AI Draft',
      plural: 'AI Drafts',
    },
    admin: {
      group: 'AI Admin',
      description: 'AI-generated content drafts awaiting review',
      defaultColumns: ['title', 'collection', 'status', 'createdAt'],
      useAsTitle: 'title',
    },
    access: {
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
        required: true,
        admin: {
          description: 'Draft title (auto-generated from content)',
        },
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
        required: true,
        index: true,
      },
      {
        name: 'conversationId',
        type: 'relationship',
        relationTo: 'ai-admin-conversations',
        admin: {
          description: 'Conversation that generated this draft',
        },
      },
      {
        name: 'collection',
        type: 'text',
        required: true,
        index: true,
        admin: {
          description: 'Target collection slug',
        },
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
        options: [
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
        ],
        required: true,
        defaultValue: 'create',
      },
      {
        name: 'content',
        type: 'json',
        required: true,
        admin: {
          description: 'Generated content to be applied',
        },
      },
      {
        name: 'prompt',
        type: 'textarea',
        required: true,
        admin: {
          description: 'Original prompt that generated this content',
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
          description: 'AI provider that generated this draft',
        },
      },
      {
        name: 'status',
        type: 'select',
        options: [
          { label: 'Draft', value: 'draft' },
          { label: 'Applied', value: 'applied' },
          { label: 'Discarded', value: 'discarded' },
          { label: 'Expired', value: 'expired' },
        ],
        defaultValue: 'draft',
        required: true,
        index: true,
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
        required: true,
        admin: {
          description: 'When the draft expires',
        },
      },
      {
        name: 'diff',
        type: 'json',
        admin: {
          description: 'Diff from original document (for updates)',
        },
      },
    ],
    timestamps: true,
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
  }

  return override ? override(config) : config
}
