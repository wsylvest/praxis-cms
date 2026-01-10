/**
 * HubSpot Lead Capture Plugin Types
 */

import type { PayloadRequest } from 'payload'

/**
 * HubSpot contact property mapping
 */
export type HubSpotPropertyMapping = {
  /**
   * The field name from the form submission
   */
  formField: string

  /**
   * The HubSpot contact property name
   */
  hubspotProperty: string

  /**
   * Optional transform function for the value
   */
  transform?: (value: unknown) => unknown
}

/**
 * HubSpot sync status
 */
export type HubSpotSyncStatus = 'pending' | 'synced' | 'failed' | 'skipped'

/**
 * Lead data structure
 */
export type LeadData = {
  email: string
  firstName?: string
  lastName?: string
  phone?: string
  company?: string
  jobTitle?: string
  website?: string
  message?: string
  source?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  pageUrl?: string
  referrer?: string
  ipAddress?: string
  userAgent?: string
  customFields?: Record<string, unknown>
}

/**
 * Lead submission result
 */
export type LeadSubmissionResult = {
  success: boolean
  leadId?: string
  hubspotId?: string
  error?: string
}

/**
 * HubSpot API response for contact creation
 */
export type HubSpotContactResponse = {
  id: string
  properties: Record<string, string>
  createdAt: string
  updatedAt: string
  archived: boolean
}

/**
 * HubSpot API error response
 */
export type HubSpotErrorResponse = {
  status: string
  message: string
  correlationId: string
  category: string
}

/**
 * Configuration for the HubSpot lead capture plugin
 */
export type HubSpotPluginConfig = {
  /**
   * HubSpot Private App access token
   * Required for API access
   */
  accessToken: string

  /**
   * HubSpot portal ID (optional, used for forms API)
   */
  portalId?: string

  /**
   * Whether to enable the plugin (default: true)
   */
  enabled?: boolean

  /**
   * Collection slug for storing leads locally (default: 'hubspot-leads')
   */
  collectionSlug?: string

  /**
   * Base path for API endpoints (default: '/api/hubspot')
   */
  basePath?: string

  /**
   * Whether to store leads locally before syncing to HubSpot (default: true)
   */
  storeLocally?: boolean

  /**
   * Whether to sync leads to HubSpot immediately (default: true)
   */
  syncImmediately?: boolean

  /**
   * Custom property mappings from form fields to HubSpot properties
   */
  propertyMappings?: HubSpotPropertyMapping[]

  /**
   * Default lifecycle stage for new contacts (default: 'lead')
   */
  defaultLifecycleStage?:
    | 'subscriber'
    | 'lead'
    | 'marketingqualifiedlead'
    | 'salesqualifiedlead'
    | 'opportunity'
    | 'customer'
    | 'evangelist'
    | 'other'

  /**
   * Default lead status for new contacts
   */
  defaultLeadStatus?: string

  /**
   * HubSpot list IDs to add new contacts to
   */
  listIds?: number[]

  /**
   * Whether to update existing contacts if found by email (default: true)
   */
  updateExisting?: boolean

  /**
   * Whether to capture UTM parameters (default: true)
   */
  captureUtmParams?: boolean

  /**
   * Whether to capture page metadata (URL, referrer) (default: true)
   */
  capturePageMetadata?: boolean

  /**
   * Callback after a lead is captured
   */
  onLeadCaptured?: (args: {
    lead: LeadData
    hubspotId?: string
    req: PayloadRequest
  }) => Promise<void> | void

  /**
   * Callback after a lead sync fails
   */
  onSyncFailed?: (args: {
    lead: LeadData
    error: Error
    req: PayloadRequest
  }) => Promise<void> | void

  /**
   * Allowed origins for CORS (empty array = all origins)
   */
  allowedOrigins?: string[]

  /**
   * Rate limiting: max requests per minute per IP (default: 60)
   */
  rateLimit?: number

  /**
   * Honeypot field name for spam protection (default: 'website_url_confirm')
   */
  honeypotField?: string

  /**
   * Required fields that must be present in submissions
   */
  requiredFields?: string[]

  /**
   * Custom validation function for lead data
   */
  validateLead?: (lead: LeadData) => Promise<boolean | string> | boolean | string
}

/**
 * HubSpot client options
 */
export type HubSpotClientOptions = {
  accessToken: string
  portalId?: string
}

/**
 * Options for creating a contact in HubSpot
 */
export type CreateContactOptions = {
  properties: Record<string, string | number | boolean>
  associations?: Array<{
    to: { id: string }
    types: Array<{
      associationCategory: string
      associationTypeId: number
    }>
  }>
}

/**
 * Options for updating a contact in HubSpot
 */
export type UpdateContactOptions = {
  contactId: string
  properties: Record<string, string | number | boolean>
}

/**
 * Options for searching contacts in HubSpot
 */
export type SearchContactsOptions = {
  filterGroups: Array<{
    filters: Array<{
      propertyName: string
      operator: string
      value: string
    }>
  }>
  properties?: string[]
  limit?: number
}

/**
 * Collection options for leads
 */
export type LeadsCollectionOptions = {
  slug?: string
}
