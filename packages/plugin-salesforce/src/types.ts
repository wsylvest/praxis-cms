import type { CollectionConfig, Field } from 'payload'

/**
 * Salesforce OAuth credentials configuration
 */
export type SalesforceCredentials = {
  /** Salesforce Client ID (Consumer Key) */
  clientId: string
  /** Salesforce Client Secret (Consumer Secret) */
  clientSecret: string
  /** Salesforce instance URL (e.g., https://yourorg.salesforce.com) */
  instanceUrl?: string
  /** Salesforce login URL (defaults to https://login.salesforce.com) */
  loginUrl?: string
  /** Salesforce password + security token for password flow */
  password?: string
  /** OAuth refresh token for token refresh */
  refreshToken?: string
  /** Salesforce username for password flow */
  username?: string
}

/**
 * Salesforce API authentication response
 */
export type SalesforceAuthResponse = {
  access_token: string
  id: string
  instance_url: string
  issued_at: string
  signature: string
  token_type: string
}

/**
 * Salesforce Lead object structure
 */
export type SalesforceLead = {
  [key: string]: unknown
  AnnualRevenue?: number
  City?: string
  Company: string
  Country?: string
  Description?: string
  Email?: string
  FirstName?: string
  Id?: string
  Industry?: string
  LastName: string
  LeadSource?: string
  NumberOfEmployees?: number
  Phone?: string
  PostalCode?: string
  State?: string
  Status?: string
  Street?: string
  Title?: string
  Website?: string
}

/**
 * Lead field mapping configuration
 */
export type LeadFieldMapping = {
  /** Praxis field name */
  source: string
  /** Salesforce Lead field name */
  target: string
  /** Optional transform function */
  transform?: (value: unknown) => unknown
}

/**
 * Sync status for lead records
 */
export type SyncStatus = 'failed' | 'pending' | 'skipped' | 'synced'

/**
 * Sync log entry
 */
export type SyncLogEntry = {
  attempts: number
  error?: string
  leadId: string
  salesforceId?: string
  status: SyncStatus
  syncedAt?: Date
}

/**
 * Plugin configuration options
 */
export type SalesforcePluginConfig = {
  /** Custom fields to add to the leads collection */
  additionalLeadFields?: Field[]

  /** Callback after successfully syncing a lead */
  afterSync?: (lead: LeadDocument, salesforceId: string) => Promise<void> | void

  /** Callback before syncing a lead to Salesforce */
  beforeSync?: (lead: LeadDocument) => LeadDocument | null | Promise<LeadDocument | null>

  /** Salesforce OAuth credentials */
  credentials: SalesforceCredentials

  /** Default lead source value in Salesforce */
  defaultLeadSource?: string

  /** Whether the plugin is enabled (default: true) */
  enabled?: boolean

  /** Field mappings from Praxis lead fields to Salesforce Lead fields */
  fieldMappings?: LeadFieldMapping[]

  /** Override leads collection configuration */
  leadsCollectionOverrides?: Partial<Omit<CollectionConfig, 'fields' | 'slug'>>

  /** Collection slug for storing leads (default: 'leads') */
  leadsCollectionSlug?: string

  /** Maximum retry attempts for failed syncs (default: 3) */
  maxRetryAttempts?: number

  /** Callback on sync error */
  onSyncError?: (lead: LeadDocument, error: Error) => Promise<void> | void

  /** Delay between retry attempts in milliseconds (default: 5000) */
  retryDelay?: number

  /** Override sync logs collection configuration */
  syncLogsCollectionOverrides?: Partial<Omit<CollectionConfig, 'fields' | 'slug'>>

  /** Collection slug for sync logs (default: 'salesforce-sync-logs') */
  syncLogsCollectionSlug?: string

  /** Whether to sync leads automatically on create (default: true) */
  syncOnCreate?: boolean

  /** Whether to sync leads automatically on update (default: false) */
  syncOnUpdate?: boolean

  /** Webhook secret for Salesforce outbound messages */
  webhookSecret?: string
}

/**
 * Lead document structure in Praxis
 */
export type LeadDocument = {
  [key: string]: unknown
  annualRevenue?: number
  city?: string
  company: string
  country?: string
  createdAt: Date
  description?: string
  email?: string
  firstName?: string
  id: string
  industry?: string
  lastName: string
  lastSyncAttempt?: Date
  lastSyncError?: string
  leadSource?: string
  numberOfEmployees?: number
  phone?: string
  postalCode?: string
  salesforceId?: string
  state?: string
  street?: string
  syncAttempts: number
  syncStatus: SyncStatus
  title?: string
  updatedAt: Date
  website?: string
}

/**
 * Salesforce API error response structure
 */
export type SalesforceApiErrorResponse = {
  errorCode: string
  fields?: string[]
  message: string
}

/**
 * Salesforce API create/update response
 */
export type SalesforceApiResponse = {
  errors: SalesforceApiErrorResponse[]
  id: string
  success: boolean
}

/**
 * Internal plugin state
 */
export type SalesforcePluginState = {
  accessToken?: string
  instanceUrl?: string
  tokenExpiresAt?: Date
}
