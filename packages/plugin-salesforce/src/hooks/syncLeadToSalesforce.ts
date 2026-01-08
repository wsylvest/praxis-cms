import type { CollectionAfterChangeHook, Payload } from 'payload'

import type {
  LeadDocument,
  LeadFieldMapping,
  SalesforceLead,
  SalesforcePluginConfig,
} from '../types.js'

import { createSalesforceClient, SalesforceApiError } from '../api/client.js'

/**
 * Default field mappings from Praxis lead fields to Salesforce Lead fields
 */
const defaultFieldMappings: LeadFieldMapping[] = [
  { source: 'firstName', target: 'FirstName' },
  { source: 'lastName', target: 'LastName' },
  { source: 'email', target: 'Email' },
  { source: 'phone', target: 'Phone' },
  { source: 'company', target: 'Company' },
  { source: 'title', target: 'Title' },
  { source: 'street', target: 'Street' },
  { source: 'city', target: 'City' },
  { source: 'state', target: 'State' },
  { source: 'postalCode', target: 'PostalCode' },
  { source: 'country', target: 'Country' },
  { source: 'website', target: 'Website' },
  { source: 'description', target: 'Description' },
  { source: 'leadSource', target: 'LeadSource' },
  { source: 'industry', target: 'Industry' },
  { source: 'numberOfEmployees', target: 'NumberOfEmployees' },
  { source: 'annualRevenue', target: 'AnnualRevenue' },
]

/**
 * Map a Praxis lead document to a Salesforce Lead object
 */
function mapLeadToSalesforce(
  lead: LeadDocument,
  fieldMappings: LeadFieldMapping[],
  defaultLeadSource?: string,
): SalesforceLead {
  const salesforceLead: SalesforceLead = {
    Company: lead.company,
    LastName: lead.lastName,
  }

  for (const mapping of fieldMappings) {
    const value = lead[mapping.source]
    if (value !== undefined && value !== null && value !== '') {
      const transformedValue = mapping.transform ? mapping.transform(value) : value
      salesforceLead[mapping.target] = transformedValue as number | string
    }
  }

  // Set default lead source if not provided
  if (!salesforceLead.LeadSource && defaultLeadSource) {
    salesforceLead.LeadSource = defaultLeadSource
  }

  return salesforceLead
}

/**
 * Log sync operation to the sync logs collection
 */
async function logSyncOperation(
  payload: Payload,
  syncLogsSlug: string,
  data: {
    duration?: number
    error?: string
    errorCode?: string
    leadId: string
    operation: 'create' | 'delete' | 'update'
    requestPayload?: object
    responsePayload?: object
    salesforceId?: string
    status: 'failed' | 'pending' | 'skipped' | 'synced'
  },
): Promise<void> {
  try {
    await payload.create({
      collection: syncLogsSlug,
      data: {
        duration: data.duration,
        error: data.error,
        errorCode: data.errorCode,
        lead: data.leadId,
        operation: data.operation,
        requestPayload: data.requestPayload,
        responsePayload: data.responsePayload,
        salesforceId: data.salesforceId,
        status: data.status,
      },
    })
  } catch (error) {
    payload.logger.error({
      error,
      msg: 'Failed to create sync log entry',
    })
  }
}

/**
 * Sync a lead to Salesforce
 */
async function syncLead(
  payload: Payload,
  lead: LeadDocument,
  config: SalesforcePluginConfig,
  operation: 'create' | 'update',
): Promise<void> {
  const leadsSlug = config.leadsCollectionSlug || 'leads'
  const syncLogsSlug = config.syncLogsCollectionSlug || 'salesforce-sync-logs'
  const fieldMappings = config.fieldMappings || defaultFieldMappings
  const maxRetries = config.maxRetryAttempts || 3

  // Check if max retries exceeded
  if (lead.syncAttempts >= maxRetries) {
    payload.logger.warn({
      attempts: lead.syncAttempts,
      leadId: lead.id,
      msg: 'Max sync attempts exceeded for lead',
    })
    return
  }

  // Apply beforeSync callback if provided
  let leadToSync = lead
  if (config.beforeSync) {
    const result = await config.beforeSync(lead)
    if (result === null) {
      // Skip syncing this lead
      await payload.update({
        id: lead.id,
        collection: leadsSlug,
        data: {
          lastSyncAttempt: new Date(),
          syncStatus: 'skipped',
        },
      })
      await logSyncOperation(payload, syncLogsSlug, {
        leadId: lead.id,
        operation,
        status: 'skipped',
      })
      return
    }
    leadToSync = result
  }

  const client = createSalesforceClient(config.credentials)
  const salesforceLead = mapLeadToSalesforce(leadToSync, fieldMappings, config.defaultLeadSource)

  const startTime = Date.now()

  try {
    let salesforceId: string

    if (operation === 'create' || !lead.salesforceId) {
      // Create new lead in Salesforce
      const response = await client.createLead(salesforceLead)
      salesforceId = response.id
    } else {
      // Update existing lead in Salesforce
      await client.updateLead(lead.salesforceId, salesforceLead)
      salesforceId = lead.salesforceId
    }

    const duration = Date.now() - startTime

    // Update lead with sync status
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

    // Log successful sync
    await logSyncOperation(payload, syncLogsSlug, {
      duration,
      leadId: lead.id,
      operation,
      requestPayload: salesforceLead,
      salesforceId,
      status: 'synced',
    })

    // Call afterSync callback if provided
    if (config.afterSync) {
      await config.afterSync(leadToSync, salesforceId)
    }

    payload.logger.info({
      duration,
      leadId: lead.id,
      msg: 'Lead synced to Salesforce successfully',
      salesforceId,
    })
  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = error instanceof SalesforceApiError ? error.errorCode : undefined

    // Update lead with error status
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

    // Log failed sync
    await logSyncOperation(payload, syncLogsSlug, {
      duration,
      error: errorMessage,
      errorCode,
      leadId: lead.id,
      operation,
      requestPayload: salesforceLead,
      status: 'failed',
    })

    // Call onSyncError callback if provided
    if (config.onSyncError) {
      await config.onSyncError(leadToSync, error instanceof Error ? error : new Error(errorMessage))
    }

    payload.logger.error({
      error: errorMessage,
      errorCode,
      leadId: lead.id,
      msg: 'Failed to sync lead to Salesforce',
    })
  }
}

/**
 * Create the afterChange hook for syncing leads to Salesforce
 */
export function createSyncLeadHook(
  config: SalesforcePluginConfig,
): CollectionAfterChangeHook<LeadDocument> {
  return async ({ doc, operation, req }) => {
    // Skip if plugin is disabled
    if (config.enabled === false) {
      return doc
    }

    // Check if we should sync on this operation
    const shouldSync =
      (operation === 'create' && config.syncOnCreate !== false) ||
      (operation === 'update' && config.syncOnUpdate === true)

    if (!shouldSync) {
      return doc
    }

    // Sync in the background to not block the response
    setImmediate(() => {
      syncLead(req.payload, doc, config, operation).catch((error) => {
        req.payload.logger.error({
          error,
          msg: 'Background sync failed',
        })
      })
    })

    return doc
  }
}
