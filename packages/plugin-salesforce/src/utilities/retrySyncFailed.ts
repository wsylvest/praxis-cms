import type { Payload } from 'payload'

import type { LeadDocument, SalesforcePluginConfig } from '../types.js'

import { createSalesforceClient } from '../api/client.js'

/**
 * Retry syncing failed leads to Salesforce
 * This can be called from a scheduled job or manually triggered
 */
export async function retrySyncFailedLeads(
  payload: Payload,
  config: SalesforcePluginConfig,
): Promise<{ failed: number; retried: number; succeeded: number }> {
  const leadsSlug = config.leadsCollectionSlug || 'leads'
  const maxRetries = config.maxRetryAttempts || 3

  // Find all failed leads that haven't exceeded max retries
  const { docs: failedLeads } = await payload.find({
    collection: leadsSlug,
    limit: 100,
    where: {
      and: [{ syncStatus: { equals: 'failed' } }, { syncAttempts: { less_than: maxRetries } }],
    },
  })

  const results = {
    failed: 0,
    retried: failedLeads.length,
    succeeded: 0,
  }

  if (failedLeads.length === 0) {
    payload.logger.info({ msg: 'No failed leads to retry' })
    return results
  }

  const client = createSalesforceClient(config.credentials)

  for (const lead of failedLeads as LeadDocument[]) {
    try {
      // Wait for configured delay between retries
      if (config.retryDelay) {
        await new Promise((resolve) => setTimeout(resolve, config.retryDelay))
      }

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
      payload.logger.info({
        leadId: lead.id,
        msg: 'Lead retry sync succeeded',
        salesforceId,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      await payload.update({
        id: lead.id,
        collection: leadsSlug,
        data: {
          lastSyncAttempt: new Date(),
          lastSyncError: errorMessage,
          syncAttempts: lead.syncAttempts + 1,
          syncStatus: 'failed',
        },
      })

      results.failed++
      payload.logger.error({
        err: errorMessage,
        leadId: lead.id,
        msg: 'Lead retry sync failed',
      })
    }
  }

  payload.logger.info({
    msg: 'Retry sync completed',
    ...results,
  })

  return results
}
