import type { Endpoint, PayloadRequest } from 'payload'

import type { LeadDocument, SalesforcePluginConfig } from '../types.js'

import { createSalesforceClient, SalesforceApiError } from '../api/client.js'

/**
 * Create endpoint handler for manually syncing a lead to Salesforce
 */
export function createSyncEndpoint(config: SalesforcePluginConfig): Endpoint {
  const leadsSlug = config.leadsCollectionSlug || 'leads'

  return {
    handler: async (req: PayloadRequest) => {
      const { payload, routeParams } = req
      const leadId = routeParams?.id as string

      if (!leadId) {
        return Response.json({ message: 'Lead ID is required', success: false }, { status: 400 })
      }

      try {
        // Fetch the lead
        const lead = (await payload.findByID({
          id: leadId,
          collection: leadsSlug,
        })) as LeadDocument

        if (!lead) {
          return Response.json({ message: 'Lead not found', success: false }, { status: 404 })
        }

        // Create Salesforce client
        const client = createSalesforceClient(config.credentials)

        // Map lead fields to Salesforce format
        const salesforceLead = {
          AnnualRevenue: lead.annualRevenue,
          City: lead.city,
          Company: lead.company,
          Country: lead.country,
          Description: lead.description,
          Email: lead.email,
          FirstName: lead.firstName,
          Industry: lead.industry,
          LastName: lead.lastName,
          LeadSource: lead.leadSource || config.defaultLeadSource,
          NumberOfEmployees: lead.numberOfEmployees,
          Phone: lead.phone,
          PostalCode: lead.postalCode,
          State: lead.state,
          Street: lead.street,
          Title: lead.title,
          Website: lead.website,
        }

        let salesforceId: string

        if (lead.salesforceId) {
          // Update existing lead
          await client.updateLead(lead.salesforceId, salesforceLead)
          salesforceId = lead.salesforceId
        } else {
          // Create new lead
          const response = await client.createLead(salesforceLead)
          salesforceId = response.id
        }

        // Update local lead with sync status
        await payload.update({
          id: leadId,
          collection: leadsSlug,
          data: {
            lastSyncAttempt: new Date(),
            lastSyncError: null,
            salesforceId,
            syncAttempts: (lead.syncAttempts || 0) + 1,
            syncStatus: 'synced',
          },
        })

        return Response.json({
          message: 'Lead synced successfully',
          salesforceId,
          success: true,
        })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        const errorCode = err instanceof SalesforceApiError ? err.errorCode : undefined

        // Update lead with error status
        try {
          await payload.update({
            id: leadId,
            collection: leadsSlug,
            data: {
              lastSyncAttempt: new Date(),
              lastSyncError: errorMessage,
              syncStatus: 'failed',
            },
          })
        } catch {
          // Ignore update errors in error handler
        }

        payload.logger.error({
          err: errorMessage,
          errorCode,
          leadId,
          msg: 'Manual sync failed',
        })

        return Response.json(
          {
            errorCode,
            message: errorMessage,
            success: false,
          },
          { status: 500 },
        )
      }
    },
    method: 'post',
    path: '/salesforce/sync/:id',
  }
}

/**
 * Create endpoint handler for retrying all failed syncs
 */
export function createRetrySyncEndpoint(config: SalesforcePluginConfig): Endpoint {
  const leadsSlug = config.leadsCollectionSlug || 'leads'
  const maxRetries = config.maxRetryAttempts || 3

  return {
    handler: async (req: PayloadRequest) => {
      const { payload } = req

      try {
        // Find all failed leads
        const { docs: failedLeads } = await payload.find({
          collection: leadsSlug,
          limit: 100,
          where: {
            and: [{ syncStatus: { equals: 'failed' } }, { syncAttempts: { less_than: maxRetries } }],
          },
        })

        if (failedLeads.length === 0) {
          return Response.json({
            failed: 0,
            message: 'No failed leads to retry',
            retried: 0,
            succeeded: 0,
            success: true,
          })
        }

        const client = createSalesforceClient(config.credentials)
        const results = { failed: 0, retried: failedLeads.length, succeeded: 0 }

        for (const lead of failedLeads as LeadDocument[]) {
          try {
            const salesforceLead = {
              AnnualRevenue: lead.annualRevenue,
              City: lead.city,
              Company: lead.company,
              Country: lead.country,
              Description: lead.description,
              Email: lead.email,
              FirstName: lead.firstName,
              Industry: lead.industry,
              LastName: lead.lastName,
              LeadSource: lead.leadSource || config.defaultLeadSource,
              NumberOfEmployees: lead.numberOfEmployees,
              Phone: lead.phone,
              PostalCode: lead.postalCode,
              State: lead.state,
              Street: lead.street,
              Title: lead.title,
              Website: lead.website,
            }

            let salesforceId: string

            if (lead.salesforceId) {
              await client.updateLead(lead.salesforceId, salesforceLead)
              salesforceId = lead.salesforceId
            } else {
              const response = await client.createLead(salesforceLead)
              salesforceId = response.id
            }

            await payload.update({
              id: lead.id,
              collection: leadsSlug,
              data: {
                lastSyncAttempt: new Date(),
                lastSyncError: null,
                salesforceId,
                syncAttempts: lead.syncAttempts + 1,
                syncStatus: 'synced',
              },
            })

            results.succeeded++
          } catch {
            results.failed++
          }
        }

        return Response.json({
          ...results,
          message: `Retry completed: ${results.succeeded} succeeded, ${results.failed} failed`,
          success: true,
        })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)

        payload.logger.error({
          err: errorMessage,
          msg: 'Bulk retry sync failed',
        })

        return Response.json(
          {
            message: errorMessage,
            success: false,
          },
          { status: 500 },
        )
      }
    },
    method: 'post',
    path: '/salesforce/retry-failed',
  }
}
