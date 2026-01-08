import type { Config } from 'payload'

import type { SalesforcePluginConfig } from './types.js'

import { generateLeadsCollection } from './collections/Leads.js'
import { generateSyncLogsCollection } from './collections/SyncLogs.js'
import { createSyncLeadHook } from './hooks/syncLeadToSalesforce.js'

export { createSalesforceClient, SalesforceApiError, SalesforceClient } from './api/client.js'
export type {
  LeadDocument,
  LeadFieldMapping,
  SalesforceCredentials,
  SalesforceLead,
  SalesforcePluginConfig,
  SyncStatus,
} from './types.js'
export { retrySyncFailedLeads } from './utilities/retrySyncFailed.js'

/**
 * Salesforce Lead Capture Plugin for Praxis CMS
 *
 * This plugin provides integration with Salesforce for capturing and syncing leads.
 *
 * Features:
 * - Automatic lead sync to Salesforce on create/update
 * - Configurable field mappings
 * - Sync status tracking and error logging
 * - Retry mechanism for failed syncs
 * - Customizable callbacks for sync lifecycle
 *
 * @example
 * ```typescript
 * import { buildConfig } from 'praxis'
 * import { salesforcePlugin } from '@praxiscms/plugin-salesforce'
 *
 * export default buildConfig({
 *   plugins: [
 *     salesforcePlugin({
 *       credentials: {
 *         clientId: process.env.SF_CLIENT_ID,
 *         clientSecret: process.env.SF_CLIENT_SECRET,
 *         username: process.env.SF_USERNAME,
 *         password: process.env.SF_PASSWORD,
 *       },
 *       defaultLeadSource: 'Website',
 *       syncOnCreate: true,
 *       syncOnUpdate: false,
 *     }),
 *   ],
 * })
 * ```
 */
export const salesforcePlugin =
  (pluginConfig: SalesforcePluginConfig) =>
  (config: Config): Config => {
    // Return unchanged config if plugin is disabled
    if (pluginConfig.enabled === false) {
      return config
    }

    const leadsSlug = pluginConfig.leadsCollectionSlug || 'leads'

    // Generate collections
    const leadsCollection = generateLeadsCollection(pluginConfig)
    const syncLogsCollection = generateSyncLogsCollection(pluginConfig)

    // Add the sync hook to the leads collection
    const syncHook = createSyncLeadHook(pluginConfig)
    leadsCollection.hooks = {
      ...leadsCollection.hooks,
      afterChange: [...(leadsCollection.hooks?.afterChange || []), syncHook],
    }

    // Check if leads collection already exists in config
    const existingCollections = config.collections || []
    const existingLeadsIndex = existingCollections.findIndex((c) => c.slug === leadsSlug)

    let collections
    if (existingLeadsIndex >= 0) {
      // Merge with existing leads collection
      const existingLeads = existingCollections[existingLeadsIndex]
      const mergedLeads = {
        ...existingLeads,
        ...leadsCollection,
        fields: [...(existingLeads.fields || []), ...(leadsCollection.fields || [])],
        hooks: {
          ...existingLeads.hooks,
          ...leadsCollection.hooks,
          afterChange: [
            ...(existingLeads.hooks?.afterChange || []),
            ...(leadsCollection.hooks?.afterChange || []),
          ],
        },
      }
      collections = [
        ...existingCollections.slice(0, existingLeadsIndex),
        mergedLeads,
        ...existingCollections.slice(existingLeadsIndex + 1),
        syncLogsCollection,
      ]
    } else {
      collections = [...existingCollections, leadsCollection, syncLogsCollection]
    }

    return {
      ...config,
      collections,
    }
  }
