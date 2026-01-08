/**
 * HubSpot Lead Capture Plugin for Praxis CMS
 *
 * Captures leads from forms and syncs them to HubSpot CRM.
 */

import type { Config, Payload } from 'payload'

import { createLeadsCollection } from './collection.js'
import { createHubSpotEndpoints } from './endpoints.js'
import { HubSpotClient, HubSpotApiError, createHubSpotClient } from './client.js'
import type { HubSpotPluginConfig, LeadData, LeadSubmissionResult } from './types.js'

const clientInstances = new Map<string, HubSpotClient>()

/**
 * Get HubSpot client instance by collection slug
 */
export function getHubSpotClient(
  collectionSlug: string = 'hubspot-leads',
): HubSpotClient | undefined {
  return clientInstances.get(collectionSlug)
}

/**
 * HubSpot Lead Capture Plugin for Praxis CMS
 *
 * @example
 * ```ts
 * import { buildConfig } from 'payload'
 * import { hubspotPlugin } from '@payloadcms/plugin-hubspot'
 *
 * export default buildConfig({
 *   plugins: [
 *     hubspotPlugin({
 *       accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
 *       defaultLifecycleStage: 'lead',
 *       listIds: [123], // Optional: add contacts to specific lists
 *       propertyMappings: [
 *         { formField: 'industry', hubspotProperty: 'industry' },
 *       ],
 *       onLeadCaptured: async ({ lead, hubspotId }) => {
 *         console.log(`Lead captured: ${lead.email}, HubSpot ID: ${hubspotId}`)
 *       },
 *     }),
 *   ],
 * })
 * ```
 */
export function hubspotPlugin(pluginConfig: HubSpotPluginConfig) {
  const {
    accessToken,
    portalId,
    enabled = true,
    collectionSlug = 'hubspot-leads',
    storeLocally = true,
  } = pluginConfig

  return (incomingConfig: Config): Config => {
    if (!enabled) {
      return incomingConfig
    }

    if (!accessToken) {
      console.warn('[HubSpot Plugin] Access token not provided. Plugin will be disabled.')
      return incomingConfig
    }

    const collections = [...(incomingConfig.collections || [])]

    if (storeLocally) {
      collections.push(createLeadsCollection({ slug: collectionSlug }))
    }

    const config: Config = {
      ...incomingConfig,
      collections,
      onInit: async (payload: Payload) => {
        if (incomingConfig.onInit) {
          await incomingConfig.onInit(payload)
        }

        const client = createHubSpotClient({
          accessToken,
          portalId,
        })

        clientInstances.set(collectionSlug, client)

        try {
          const connected = await client.testConnection()
          if (connected) {
            const hubspotPortalId = await client.getPortalId()
            payload.logger.info(
              `[HubSpot Plugin] Connected to HubSpot (Portal: ${hubspotPortalId})`,
            )
          } else {
            payload.logger.warn(
              '[HubSpot Plugin] Failed to connect to HubSpot. Check your access token.',
            )
          }
        } catch (error) {
          payload.logger.warn(
            `[HubSpot Plugin] Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          )
        }
      },
    }

    const endpoints = createHubSpotEndpoints({
      getClient: () => clientInstances.get(collectionSlug),
      pluginConfig,
    })

    config.endpoints = [...(incomingConfig.endpoints || []), ...endpoints]

    return config
  }
}

export {
  createLeadsCollection,
  createHubSpotEndpoints,
  HubSpotClient,
  HubSpotApiError,
  createHubSpotClient,
}

export type { HubSpotPluginConfig, LeadData, LeadSubmissionResult }

export * from './types.js'
