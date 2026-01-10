/**
 * HubSpot Lead Capture Endpoints
 *
 * Handles lead submission, sync, and management
 */

import type { Endpoint, PayloadRequest } from 'payload'

import type { HubSpotClient } from './client.js'
import type { HubSpotPluginConfig, LeadData, HubSpotPropertyMapping } from './types.js'

export type HubSpotEndpointsConfig = {
  getClient: () => HubSpotClient | undefined
  pluginConfig: HubSpotPluginConfig
}

const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string, limit: number): boolean {
  const now = Date.now()
  const entry = rateLimitStore.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + 60000 })
    return true
  }

  if (entry.count >= limit) {
    return false
  }

  entry.count++
  return true
}

function getClientIp(req: PayloadRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = req.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }
  return 'unknown'
}

function mapLeadToHubSpotProperties(
  lead: LeadData,
  customMappings?: HubSpotPropertyMapping[],
): Record<string, string> {
  const properties: Record<string, string> = {}

  const defaultMappings: Record<string, string> = {
    email: 'email',
    firstName: 'firstname',
    lastName: 'lastname',
    phone: 'phone',
    company: 'company',
    jobTitle: 'jobtitle',
    website: 'website',
    message: 'message',
    utmSource: 'hs_analytics_source',
    utmMedium: 'utm_medium',
    utmCampaign: 'utm_campaign',
    utmTerm: 'utm_term',
    utmContent: 'utm_content',
  }

  for (const [leadField, hubspotProp] of Object.entries(defaultMappings)) {
    const value = lead[leadField as keyof LeadData]
    if (value !== undefined && value !== null && value !== '') {
      properties[hubspotProp] = String(value)
    }
  }

  if (customMappings) {
    for (const mapping of customMappings) {
      const value =
        lead.customFields?.[mapping.formField] ?? lead[mapping.formField as keyof LeadData]
      if (value !== undefined && value !== null && value !== '') {
        const transformedValue = mapping.transform ? mapping.transform(value) : value
        properties[mapping.hubspotProperty] = String(transformedValue)
      }
    }
  }

  return properties
}

export function createHubSpotEndpoints(config: HubSpotEndpointsConfig): Endpoint[] {
  const { getClient, pluginConfig } = config
  const {
    basePath = '/api/hubspot',
    collectionSlug = 'hubspot-leads',
    storeLocally = true,
    syncImmediately = true,
    propertyMappings,
    defaultLifecycleStage = 'lead',
    defaultLeadStatus,
    listIds,
    updateExisting = true,
    captureUtmParams = true,
    capturePageMetadata = true,
    allowedOrigins = [],
    rateLimit = 60,
    honeypotField = 'website_url_confirm',
    requiredFields = ['email'],
    validateLead,
    onLeadCaptured,
    onSyncFailed,
  } = pluginConfig

  function getCorsHeaders(origin: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }

    if (allowedOrigins.length === 0) {
      headers['Access-Control-Allow-Origin'] = '*'
    } else if (origin && allowedOrigins.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin
    }

    return headers
  }

  return [
    /**
     * OPTIONS - CORS preflight
     */
    {
      path: `${basePath}/submit`,
      method: 'options',
      handler: async (req: PayloadRequest) => {
        const origin = req.headers.get('origin')
        return new Response(null, {
          status: 204,
          headers: getCorsHeaders(origin),
        })
      },
    },

    /**
     * POST /api/hubspot/submit
     * Submit a new lead
     */
    {
      path: `${basePath}/submit`,
      method: 'post',
      handler: async (req: PayloadRequest) => {
        const origin = req.headers.get('origin')
        const corsHeaders = getCorsHeaders(origin)

        const clientIp = getClientIp(req)
        if (!checkRateLimit(clientIp, rateLimit)) {
          return Response.json(
            { error: 'Rate limit exceeded. Please try again later.' },
            { status: 429, headers: corsHeaders },
          )
        }

        let body: Record<string, unknown>
        try {
          if (typeof req.json !== 'function') {
            return Response.json(
              { error: 'Invalid request' },
              { status: 400, headers: corsHeaders },
            )
          }
          body = (await req.json()) as Record<string, unknown>
        } catch {
          return Response.json(
            { error: 'Invalid JSON body' },
            { status: 400, headers: corsHeaders },
          )
        }

        if (honeypotField && body[honeypotField]) {
          return Response.json(
            { success: true, message: 'Thank you for your submission.' },
            { status: 200, headers: corsHeaders },
          )
        }

        for (const field of requiredFields) {
          if (!body[field]) {
            return Response.json(
              { error: `Missing required field: ${field}` },
              { status: 400, headers: corsHeaders },
            )
          }
        }

        const lead: LeadData = {
          email: String(body.email || ''),
          firstName: body.firstName ? String(body.firstName) : undefined,
          lastName: body.lastName ? String(body.lastName) : undefined,
          phone: body.phone ? String(body.phone) : undefined,
          company: body.company ? String(body.company) : undefined,
          jobTitle: body.jobTitle ? String(body.jobTitle) : undefined,
          website: body.website ? String(body.website) : undefined,
          message: body.message ? String(body.message) : undefined,
          source: body.source ? String(body.source) : undefined,
        }

        if (captureUtmParams) {
          lead.utmSource = body.utmSource ? String(body.utmSource) : undefined
          lead.utmMedium = body.utmMedium ? String(body.utmMedium) : undefined
          lead.utmCampaign = body.utmCampaign ? String(body.utmCampaign) : undefined
          lead.utmTerm = body.utmTerm ? String(body.utmTerm) : undefined
          lead.utmContent = body.utmContent ? String(body.utmContent) : undefined
        }

        if (capturePageMetadata) {
          lead.pageUrl = body.pageUrl ? String(body.pageUrl) : undefined
          lead.referrer = body.referrer ? String(body.referrer) : undefined
          lead.ipAddress = clientIp
          lead.userAgent = req.headers.get('user-agent') || undefined
        }

        const knownFields = [
          'email',
          'firstName',
          'lastName',
          'phone',
          'company',
          'jobTitle',
          'website',
          'message',
          'source',
          'utmSource',
          'utmMedium',
          'utmCampaign',
          'utmTerm',
          'utmContent',
          'pageUrl',
          'referrer',
          honeypotField,
        ]
        const customFields: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(body)) {
          if (!knownFields.includes(key)) {
            customFields[key] = value
          }
        }
        if (Object.keys(customFields).length > 0) {
          lead.customFields = customFields
        }

        if (validateLead) {
          const validationResult = await validateLead(lead)
          if (validationResult !== true) {
            const errorMessage =
              typeof validationResult === 'string' ? validationResult : 'Lead validation failed'
            return Response.json({ error: errorMessage }, { status: 400, headers: corsHeaders })
          }
        }

        let localLeadId: string | undefined
        let hubspotContactId: string | undefined

        try {
          if (storeLocally) {
            const created = await req.payload.create({
              collection: collectionSlug,
              data: {
                ...lead,
                syncStatus: 'pending',
              },
            })
            localLeadId = created.id as string
          }

          if (syncImmediately) {
            const client = getClient()
            if (client) {
              try {
                const properties = mapLeadToHubSpotProperties(lead, propertyMappings)

                if (defaultLifecycleStage) {
                  properties.lifecyclestage = defaultLifecycleStage
                }
                if (defaultLeadStatus) {
                  properties.hs_lead_status = defaultLeadStatus
                }

                let result: { contact: { id: string }; isNew: boolean }

                if (updateExisting) {
                  result = await client.upsertContact(lead.email, properties)
                } else {
                  const contact = await client.createContact({ properties })
                  result = { contact, isNew: true }
                }

                hubspotContactId = result.contact.id

                if (listIds && listIds.length > 0) {
                  await client.addContactToLists(listIds, lead.email)
                }

                if (storeLocally && localLeadId) {
                  await req.payload.update({
                    collection: collectionSlug,
                    id: localLeadId,
                    data: {
                      syncStatus: 'synced',
                      hubspotContactId,
                      syncedAt: new Date().toISOString(),
                    },
                  })
                }
              } catch (syncError) {
                console.error('HubSpot sync error:', syncError)

                if (storeLocally && localLeadId) {
                  await req.payload.update({
                    collection: collectionSlug,
                    id: localLeadId,
                    data: {
                      syncStatus: 'failed',
                      syncError: syncError instanceof Error ? syncError.message : 'Unknown error',
                      syncAttempts: 1,
                    },
                  })
                }

                if (onSyncFailed) {
                  await onSyncFailed({
                    lead,
                    error: syncError instanceof Error ? syncError : new Error('Unknown error'),
                    req,
                  })
                }
              }
            }
          }

          if (onLeadCaptured) {
            await onLeadCaptured({
              lead,
              hubspotId: hubspotContactId,
              req,
            })
          }

          return Response.json(
            {
              success: true,
              leadId: localLeadId,
              hubspotId: hubspotContactId,
            },
            { status: 200, headers: corsHeaders },
          )
        } catch (error) {
          console.error('Lead submission error:', error)
          return Response.json(
            { error: 'Failed to process lead submission' },
            { status: 500, headers: corsHeaders },
          )
        }
      },
    },

    /**
     * POST /api/hubspot/sync/:id
     * Manually sync a lead to HubSpot
     */
    {
      path: `${basePath}/sync/:id`,
      method: 'post',
      handler: async (req: PayloadRequest) => {
        if (!req.user) {
          return Response.json({ error: 'Authentication required' }, { status: 401 })
        }

        const leadId = req.routeParams?.id as string
        if (!leadId) {
          return Response.json({ error: 'Lead ID required' }, { status: 400 })
        }

        const client = getClient()
        if (!client) {
          return Response.json({ error: 'HubSpot client not initialized' }, { status: 503 })
        }

        try {
          const leadDoc = await req.payload.findByID({
            collection: collectionSlug,
            id: leadId,
          })

          if (!leadDoc) {
            return Response.json({ error: 'Lead not found' }, { status: 404 })
          }

          const lead: LeadData = {
            email: leadDoc.email as string,
            firstName: leadDoc.firstName as string | undefined,
            lastName: leadDoc.lastName as string | undefined,
            phone: leadDoc.phone as string | undefined,
            company: leadDoc.company as string | undefined,
            jobTitle: leadDoc.jobTitle as string | undefined,
            website: leadDoc.website as string | undefined,
            message: leadDoc.message as string | undefined,
            source: leadDoc.source as string | undefined,
            utmSource: leadDoc.utmSource as string | undefined,
            utmMedium: leadDoc.utmMedium as string | undefined,
            utmCampaign: leadDoc.utmCampaign as string | undefined,
            utmTerm: leadDoc.utmTerm as string | undefined,
            utmContent: leadDoc.utmContent as string | undefined,
            customFields: leadDoc.customFields as Record<string, unknown> | undefined,
          }

          const properties = mapLeadToHubSpotProperties(lead, propertyMappings)

          if (defaultLifecycleStage) {
            properties.lifecyclestage = defaultLifecycleStage
          }
          if (defaultLeadStatus) {
            properties.hs_lead_status = defaultLeadStatus
          }

          const result = updateExisting
            ? await client.upsertContact(lead.email, properties)
            : { contact: await client.createContact({ properties }), isNew: true }

          if (listIds && listIds.length > 0) {
            await client.addContactToLists(listIds, lead.email)
          }

          await req.payload.update({
            collection: collectionSlug,
            id: leadId,
            data: {
              syncStatus: 'synced',
              hubspotContactId: result.contact.id,
              syncedAt: new Date().toISOString(),
              syncError: null,
              syncAttempts: ((leadDoc.syncAttempts as number) || 0) + 1,
            },
          })

          return Response.json({
            success: true,
            hubspotId: result.contact.id,
            isNew: result.isNew,
          })
        } catch (error) {
          console.error('Manual sync error:', error)

          await req.payload
            .update({
              collection: collectionSlug,
              id: leadId,
              data: {
                syncStatus: 'failed',
                syncError: error instanceof Error ? error.message : 'Unknown error',
                syncAttempts: { increment: 1 },
              },
            })
            .catch(() => {
              // Ignore update errors
            })

          return Response.json(
            { error: error instanceof Error ? error.message : 'Sync failed' },
            { status: 500 },
          )
        }
      },
    },

    /**
     * POST /api/hubspot/sync-all
     * Sync all pending leads to HubSpot
     */
    {
      path: `${basePath}/sync-all`,
      method: 'post',
      handler: async (req: PayloadRequest) => {
        if (!req.user) {
          return Response.json({ error: 'Authentication required' }, { status: 401 })
        }

        const client = getClient()
        if (!client) {
          return Response.json({ error: 'HubSpot client not initialized' }, { status: 503 })
        }

        try {
          const pendingLeads = await req.payload.find({
            collection: collectionSlug,
            where: {
              syncStatus: { in: ['pending', 'failed'] },
            },
            limit: 100,
          })

          const results = {
            total: pendingLeads.docs.length,
            synced: 0,
            failed: 0,
            errors: [] as Array<{ id: string; error: string }>,
          }

          for (const leadDoc of pendingLeads.docs) {
            try {
              const lead: LeadData = {
                email: leadDoc.email as string,
                firstName: leadDoc.firstName as string | undefined,
                lastName: leadDoc.lastName as string | undefined,
                phone: leadDoc.phone as string | undefined,
                company: leadDoc.company as string | undefined,
                jobTitle: leadDoc.jobTitle as string | undefined,
                website: leadDoc.website as string | undefined,
                message: leadDoc.message as string | undefined,
                source: leadDoc.source as string | undefined,
                utmSource: leadDoc.utmSource as string | undefined,
                utmMedium: leadDoc.utmMedium as string | undefined,
                utmCampaign: leadDoc.utmCampaign as string | undefined,
                utmTerm: leadDoc.utmTerm as string | undefined,
                utmContent: leadDoc.utmContent as string | undefined,
                customFields: leadDoc.customFields as Record<string, unknown> | undefined,
              }

              const properties = mapLeadToHubSpotProperties(lead, propertyMappings)

              if (defaultLifecycleStage) {
                properties.lifecyclestage = defaultLifecycleStage
              }
              if (defaultLeadStatus) {
                properties.hs_lead_status = defaultLeadStatus
              }

              const result = updateExisting
                ? await client.upsertContact(lead.email, properties)
                : { contact: await client.createContact({ properties }), isNew: true }

              if (listIds && listIds.length > 0) {
                await client.addContactToLists(listIds, lead.email)
              }

              await req.payload.update({
                collection: collectionSlug,
                id: leadDoc.id as string,
                data: {
                  syncStatus: 'synced',
                  hubspotContactId: result.contact.id,
                  syncedAt: new Date().toISOString(),
                  syncError: null,
                  syncAttempts: ((leadDoc.syncAttempts as number) || 0) + 1,
                },
              })

              results.synced++
            } catch (error) {
              results.failed++
              results.errors.push({
                id: leadDoc.id as string,
                error: error instanceof Error ? error.message : 'Unknown error',
              })

              await req.payload
                .update({
                  collection: collectionSlug,
                  id: leadDoc.id as string,
                  data: {
                    syncStatus: 'failed',
                    syncError: error instanceof Error ? error.message : 'Unknown error',
                    syncAttempts: ((leadDoc.syncAttempts as number) || 0) + 1,
                  },
                })
                .catch(() => {
                  // Ignore update errors
                })
            }
          }

          return Response.json(results)
        } catch (error) {
          console.error('Sync all error:', error)
          return Response.json(
            { error: error instanceof Error ? error.message : 'Sync failed' },
            { status: 500 },
          )
        }
      },
    },

    /**
     * GET /api/hubspot/status
     * Check HubSpot connection status
     */
    {
      path: `${basePath}/status`,
      method: 'get',
      handler: async (req: PayloadRequest) => {
        if (!req.user) {
          return Response.json({ error: 'Authentication required' }, { status: 401 })
        }

        const client = getClient()
        if (!client) {
          return Response.json({
            connected: false,
            error: 'HubSpot client not initialized',
          })
        }

        try {
          const connected = await client.testConnection()
          const portalId = connected ? await client.getPortalId() : undefined

          return Response.json({
            connected,
            portalId,
          })
        } catch (error) {
          return Response.json({
            connected: false,
            error: error instanceof Error ? error.message : 'Connection test failed',
          })
        }
      },
    },

    /**
     * GET /api/hubspot/stats
     * Get lead capture statistics
     */
    {
      path: `${basePath}/stats`,
      method: 'get',
      handler: async (req: PayloadRequest) => {
        if (!req.user) {
          return Response.json({ error: 'Authentication required' }, { status: 401 })
        }

        try {
          const [total, pending, synced, failed] = await Promise.all([
            req.payload.count({ collection: collectionSlug }),
            req.payload.count({
              collection: collectionSlug,
              where: { syncStatus: { equals: 'pending' } },
            }),
            req.payload.count({
              collection: collectionSlug,
              where: { syncStatus: { equals: 'synced' } },
            }),
            req.payload.count({
              collection: collectionSlug,
              where: { syncStatus: { equals: 'failed' } },
            }),
          ])

          return Response.json({
            total: total.totalDocs,
            pending: pending.totalDocs,
            synced: synced.totalDocs,
            failed: failed.totalDocs,
          })
        } catch (error) {
          console.error('Stats error:', error)
          return Response.json({ error: 'Failed to fetch statistics' }, { status: 500 })
        }
      },
    },
  ]
}
