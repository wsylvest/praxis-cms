/**
 * HubSpot Leads Collection
 *
 * Stores lead submissions locally for tracking and sync management
 */

import type { CollectionConfig } from 'payload'

import type { LeadsCollectionOptions } from './types.js'

export function createLeadsCollection(options: LeadsCollectionOptions = {}): CollectionConfig {
  const { slug = 'hubspot-leads' } = options

  return {
    slug,
    admin: {
      group: 'Marketing',
      useAsTitle: 'email',
      description: 'Lead submissions captured for HubSpot',
      defaultColumns: ['email', 'firstName', 'lastName', 'source', 'syncStatus', 'createdAt'],
    },
    access: {
      read: ({ req: { user } }) => {
        if (!user) return false
        return true
      },
      create: () => true,
      update: ({ req: { user } }) => Boolean(user),
      delete: ({ req: { user } }) => {
        if (!user) return false
        return (user as { roles?: string[] }).roles?.includes('admin') ?? false
      },
    },
    fields: [
      {
        name: 'email',
        type: 'email',
        required: true,
        index: true,
        admin: {
          description: 'Lead email address',
        },
      },
      {
        name: 'firstName',
        type: 'text',
        admin: {
          description: 'First name',
        },
      },
      {
        name: 'lastName',
        type: 'text',
        admin: {
          description: 'Last name',
        },
      },
      {
        name: 'phone',
        type: 'text',
        admin: {
          description: 'Phone number',
        },
      },
      {
        name: 'company',
        type: 'text',
        admin: {
          description: 'Company name',
        },
      },
      {
        name: 'jobTitle',
        type: 'text',
        admin: {
          description: 'Job title',
        },
      },
      {
        name: 'website',
        type: 'text',
        admin: {
          description: 'Website URL',
        },
      },
      {
        name: 'message',
        type: 'textarea',
        admin: {
          description: 'Message or notes',
        },
      },
      {
        name: 'source',
        type: 'text',
        index: true,
        admin: {
          description: 'Lead source (form name, page, etc.)',
        },
      },
      {
        type: 'collapsible',
        label: 'UTM Parameters',
        admin: {
          initCollapsed: true,
        },
        fields: [
          {
            name: 'utmSource',
            type: 'text',
            admin: {
              description: 'UTM Source',
            },
          },
          {
            name: 'utmMedium',
            type: 'text',
            admin: {
              description: 'UTM Medium',
            },
          },
          {
            name: 'utmCampaign',
            type: 'text',
            admin: {
              description: 'UTM Campaign',
            },
          },
          {
            name: 'utmTerm',
            type: 'text',
            admin: {
              description: 'UTM Term',
            },
          },
          {
            name: 'utmContent',
            type: 'text',
            admin: {
              description: 'UTM Content',
            },
          },
        ],
      },
      {
        type: 'collapsible',
        label: 'Page Metadata',
        admin: {
          initCollapsed: true,
        },
        fields: [
          {
            name: 'pageUrl',
            type: 'text',
            admin: {
              description: 'Page URL where form was submitted',
            },
          },
          {
            name: 'referrer',
            type: 'text',
            admin: {
              description: 'Referrer URL',
            },
          },
          {
            name: 'ipAddress',
            type: 'text',
            admin: {
              description: 'IP address',
            },
          },
          {
            name: 'userAgent',
            type: 'text',
            admin: {
              description: 'User agent string',
            },
          },
        ],
      },
      {
        name: 'customFields',
        type: 'json',
        admin: {
          description: 'Additional custom fields',
        },
      },
      {
        type: 'collapsible',
        label: 'HubSpot Sync',
        fields: [
          {
            name: 'syncStatus',
            type: 'select',
            defaultValue: 'pending',
            index: true,
            options: [
              { label: 'Pending', value: 'pending' },
              { label: 'Synced', value: 'synced' },
              { label: 'Failed', value: 'failed' },
              { label: 'Skipped', value: 'skipped' },
            ],
            admin: {
              description: 'HubSpot sync status',
            },
          },
          {
            name: 'hubspotContactId',
            type: 'text',
            index: true,
            admin: {
              description: 'HubSpot contact ID after sync',
            },
          },
          {
            name: 'syncedAt',
            type: 'date',
            admin: {
              description: 'When the lead was synced to HubSpot',
              date: {
                pickerAppearance: 'dayAndTime',
              },
            },
          },
          {
            name: 'syncError',
            type: 'textarea',
            admin: {
              description: 'Error message if sync failed',
            },
          },
          {
            name: 'syncAttempts',
            type: 'number',
            defaultValue: 0,
            admin: {
              description: 'Number of sync attempts',
            },
          },
        ],
      },
    ],
    timestamps: true,
  }
}
