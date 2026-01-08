import type { CollectionConfig } from 'payload'

import type { SalesforcePluginConfig } from '../types.js'

export function generateSyncLogsCollection(config: SalesforcePluginConfig): CollectionConfig {
  const slug = config.syncLogsCollectionSlug || 'salesforce-sync-logs'
  const leadsSlug = config.leadsCollectionSlug || 'leads'

  return {
    slug,
    admin: {
      defaultColumns: ['lead', 'status', 'salesforceId', 'createdAt'],
      description: 'Sync logs for Salesforce lead integration',
      group: 'Salesforce',
      useAsTitle: 'id',
    },
    fields: [
      {
        name: 'lead',
        type: 'relationship',
        admin: {
          description: 'The lead that was synced',
        },
        index: true,
        relationTo: leadsSlug,
        required: true,
      },
      {
        name: 'salesforceId',
        type: 'text',
        admin: {
          description: 'The Salesforce Lead ID after successful sync',
        },
        index: true,
        label: 'Salesforce ID',
      },
      {
        name: 'status',
        type: 'select',
        index: true,
        options: [
          { label: 'Pending', value: 'pending' },
          { label: 'Synced', value: 'synced' },
          { label: 'Failed', value: 'failed' },
          { label: 'Skipped', value: 'skipped' },
        ],
        required: true,
      },
      {
        name: 'operation',
        type: 'select',
        options: [
          { label: 'Create', value: 'create' },
          { label: 'Update', value: 'update' },
          { label: 'Delete', value: 'delete' },
        ],
        required: true,
      },
      {
        name: 'error',
        type: 'textarea',
        admin: {
          description: 'Error message if sync failed',
        },
        label: 'Error Message',
      },
      {
        name: 'errorCode',
        type: 'text',
        admin: {
          description: 'Salesforce error code if sync failed',
        },
        label: 'Error Code',
      },
      {
        name: 'requestPayload',
        type: 'json',
        admin: {
          description: 'The data sent to Salesforce',
        },
        label: 'Request Payload',
      },
      {
        name: 'responsePayload',
        type: 'json',
        admin: {
          description: 'The response received from Salesforce',
        },
        label: 'Response Payload',
      },
      {
        name: 'duration',
        type: 'number',
        admin: {
          description: 'Time taken for the sync operation in milliseconds',
        },
        label: 'Duration (ms)',
      },
    ],
    timestamps: true,
    ...config.syncLogsCollectionOverrides,
  }
}
