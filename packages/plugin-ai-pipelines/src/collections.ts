/**
 * Pipeline Collections
 *
 * Collections for storing pipeline drafts and logs
 */

import type { CollectionConfig } from 'payload'

export interface PipelineCollectionsOptions {
  draftsSlug?: string
  logsSlug?: string
}

/**
 * Create pipeline drafts collection
 */
export function createPipelineDraftsCollection(
  options: { slug?: string } = {}
): CollectionConfig {
  const { slug = 'ai-pipeline-drafts' } = options

  return {
    slug,
    admin: {
      group: 'AI Pipelines',
      useAsTitle: 'collection',
      description: 'AI-generated content drafts pending review',
      defaultColumns: ['collection', 'status', 'createdAt'],
    },
    access: {
      read: ({ req: { user } }) => {
        if (!user) return false
        if ((user as any).roles?.includes('admin')) return true
        return {
          createdBy: { equals: user.id },
        }
      },
      create: ({ req: { user } }) => Boolean(user),
      update: ({ req: { user } }) => {
        if (!user) return false
        if ((user as any).roles?.includes('admin')) return true
        return {
          createdBy: { equals: user.id },
        }
      },
      delete: ({ req: { user } }) => {
        if (!user) return false
        return (user as any).roles?.includes('admin') || false
      },
    },
    fields: [
      {
        name: 'collection',
        type: 'text',
        required: true,
        index: true,
        admin: {
          description: 'Target collection for this draft',
        },
      },
      {
        name: 'data',
        type: 'json',
        required: true,
        admin: {
          description: 'Draft content data',
        },
      },
      {
        name: 'status',
        type: 'select',
        required: true,
        defaultValue: 'pending',
        options: [
          { label: 'Pending Review', value: 'pending' },
          { label: 'Approved', value: 'approved' },
          { label: 'Rejected', value: 'rejected' },
          { label: 'Published', value: 'published' },
        ],
        admin: {
          description: 'Draft status',
        },
      },
      {
        name: 'metadata',
        type: 'json',
        admin: {
          description: 'Additional metadata',
        },
      },
      {
        name: 'createdBy',
        type: 'relationship',
        relationTo: 'users',
        admin: {
          description: 'User who created or triggered this draft',
        },
      },
      {
        name: 'reviewedBy',
        type: 'relationship',
        relationTo: 'users',
        admin: {
          description: 'User who reviewed this draft',
        },
      },
      {
        name: 'reviewedAt',
        type: 'date',
        admin: {
          description: 'When the draft was reviewed',
        },
      },
      {
        name: 'publishedDocumentId',
        type: 'text',
        admin: {
          description: 'ID of the published document',
        },
      },
    ],
    timestamps: true,
  }
}

/**
 * Create pipeline logs collection
 */
export function createPipelineLogsCollection(
  options: { slug?: string } = {}
): CollectionConfig {
  const { slug = 'ai-pipeline-logs' } = options

  return {
    slug,
    admin: {
      group: 'AI Pipelines',
      useAsTitle: 'action',
      description: 'Pipeline execution logs',
      defaultColumns: ['action', 'resourceId', 'status', 'timestamp'],
    },
    access: {
      read: ({ req: { user } }) => {
        if (!user) return false
        return (user as any).roles?.includes('admin') || false
      },
      create: () => true, // System creates logs
      update: () => false, // Logs are immutable
      delete: ({ req: { user } }) => {
        if (!user) return false
        return (user as any).roles?.includes('admin') || false
      },
    },
    fields: [
      {
        name: 'timestamp',
        type: 'date',
        required: true,
        index: true,
        admin: {
          description: 'When this event occurred',
        },
      },
      {
        name: 'userId',
        type: 'text',
        index: true,
        admin: {
          description: 'User who triggered the action',
        },
      },
      {
        name: 'action',
        type: 'text',
        required: true,
        index: true,
        admin: {
          description: 'Action performed',
        },
      },
      {
        name: 'resource',
        type: 'text',
        required: true,
        admin: {
          description: 'Resource type',
        },
      },
      {
        name: 'resourceId',
        type: 'text',
        index: true,
        admin: {
          description: 'Resource identifier',
        },
      },
      {
        name: 'details',
        type: 'json',
        admin: {
          description: 'Additional event details',
        },
      },
      {
        name: 'status',
        type: 'select',
        required: true,
        options: [
          { label: 'Success', value: 'success' },
          { label: 'Error', value: 'error' },
          { label: 'Warning', value: 'warning' },
        ],
        admin: {
          description: 'Event status',
        },
      },
    ],
    timestamps: true,
  }
}
