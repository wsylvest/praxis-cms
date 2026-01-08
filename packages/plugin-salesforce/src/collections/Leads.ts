import type { CollectionConfig, Field } from 'payload'

import type { SalesforcePluginConfig } from '../types.js'

const baseLeadFields: Field[] = [
  {
    name: 'firstName',
    type: 'text',
    label: 'First Name',
  },
  {
    name: 'lastName',
    type: 'text',
    label: 'Last Name',
    required: true,
  },
  {
    name: 'email',
    type: 'email',
    index: true,
    label: 'Email',
  },
  {
    name: 'phone',
    type: 'text',
    label: 'Phone',
  },
  {
    name: 'company',
    type: 'text',
    label: 'Company',
    required: true,
  },
  {
    name: 'title',
    type: 'text',
    label: 'Title',
  },
  {
    type: 'collapsible',
    fields: [
      {
        name: 'street',
        type: 'text',
        label: 'Street',
      },
      {
        type: 'row',
        fields: [
          {
            name: 'city',
            type: 'text',
            label: 'City',
          },
          {
            name: 'state',
            type: 'text',
            label: 'State/Province',
          },
        ],
      },
      {
        type: 'row',
        fields: [
          {
            name: 'postalCode',
            type: 'text',
            label: 'Postal Code',
          },
          {
            name: 'country',
            type: 'text',
            label: 'Country',
          },
        ],
      },
    ],
    label: 'Address',
  },
  {
    name: 'website',
    type: 'text',
    label: 'Website',
  },
  {
    name: 'description',
    type: 'textarea',
    label: 'Description',
  },
  {
    name: 'leadSource',
    type: 'text',
    admin: {
      description: 'Source of the lead (e.g., Web, Referral, Campaign)',
    },
    label: 'Lead Source',
  },
  {
    name: 'industry',
    type: 'text',
    label: 'Industry',
  },
  {
    name: 'numberOfEmployees',
    type: 'number',
    label: 'Number of Employees',
  },
  {
    name: 'annualRevenue',
    type: 'number',
    label: 'Annual Revenue',
  },
]

const salesforceSyncFields: Field[] = [
  {
    name: 'salesforceId',
    type: 'text',
    admin: {
      description: 'The ID of this lead in Salesforce',
      position: 'sidebar',
      readOnly: true,
    },
    index: true,
    label: 'Salesforce ID',
  },
  {
    name: 'syncStatus',
    type: 'select',
    admin: {
      position: 'sidebar',
      readOnly: true,
    },
    defaultValue: 'pending',
    index: true,
    label: 'Sync Status',
    options: [
      { label: 'Pending', value: 'pending' },
      { label: 'Synced', value: 'synced' },
      { label: 'Failed', value: 'failed' },
      { label: 'Skipped', value: 'skipped' },
    ],
  },
  {
    name: 'lastSyncAttempt',
    type: 'date',
    admin: {
      date: {
        displayFormat: 'MMM d, yyyy HH:mm',
      },
      position: 'sidebar',
      readOnly: true,
    },
    label: 'Last Sync Attempt',
  },
  {
    name: 'lastSyncError',
    type: 'text',
    admin: {
      position: 'sidebar',
      readOnly: true,
    },
    label: 'Last Sync Error',
  },
  {
    name: 'syncAttempts',
    type: 'number',
    admin: {
      position: 'sidebar',
      readOnly: true,
    },
    defaultValue: 0,
    label: 'Sync Attempts',
  },
]

export function generateLeadsCollection(config: SalesforcePluginConfig): CollectionConfig {
  const slug = config.leadsCollectionSlug || 'leads'

  const fields: Field[] = [
    ...baseLeadFields,
    ...(config.additionalLeadFields || []),
    ...salesforceSyncFields,
  ]

  return {
    slug,
    admin: {
      defaultColumns: ['email', 'firstName', 'lastName', 'company', 'syncStatus'],
      description: 'Leads captured for Salesforce integration',
      group: 'Salesforce',
      useAsTitle: 'email',
    },
    fields,
    timestamps: true,
    ...config.leadsCollectionOverrides,
  }
}
