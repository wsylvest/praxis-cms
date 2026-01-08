/**
 * HubSpot API Client
 *
 * Provides methods for interacting with the HubSpot CRM API
 */

import type {
  HubSpotClientOptions,
  HubSpotContactResponse,
  HubSpotErrorResponse,
  CreateContactOptions,
  UpdateContactOptions,
  SearchContactsOptions,
} from './types.js'

const HUBSPOT_API_BASE = 'https://api.hubapi.com'

export class HubSpotApiError extends Error {
  status: number
  correlationId?: string
  category?: string

  constructor(message: string, status: number, correlationId?: string, category?: string) {
    super(message)
    this.name = 'HubSpotApiError'
    this.status = status
    this.correlationId = correlationId
    this.category = category
  }
}

/**
 * HubSpot API Client
 */
export class HubSpotClient {
  private accessToken: string
  private portalId?: string

  constructor(options: HubSpotClientOptions) {
    this.accessToken = options.accessToken
    this.portalId = options.portalId
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${HUBSPOT_API_BASE}${endpoint}`

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      let errorData: HubSpotErrorResponse | undefined
      try {
        errorData = (await response.json()) as HubSpotErrorResponse
      } catch {
        // Response body may not be JSON
      }

      throw new HubSpotApiError(
        errorData?.message || `HubSpot API error: ${response.status}`,
        response.status,
        errorData?.correlationId,
        errorData?.category,
      )
    }

    return response.json() as Promise<T>
  }

  /**
   * Create a new contact in HubSpot
   */
  async createContact(options: CreateContactOptions): Promise<HubSpotContactResponse> {
    return this.request<HubSpotContactResponse>('/crm/v3/objects/contacts', {
      method: 'POST',
      body: JSON.stringify(options),
    })
  }

  /**
   * Update an existing contact in HubSpot
   */
  async updateContact(options: UpdateContactOptions): Promise<HubSpotContactResponse> {
    return this.request<HubSpotContactResponse>(`/crm/v3/objects/contacts/${options.contactId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: options.properties }),
    })
  }

  /**
   * Get a contact by ID
   */
  async getContact(contactId: string, properties?: string[]): Promise<HubSpotContactResponse> {
    const params = new URLSearchParams()
    if (properties?.length) {
      params.set('properties', properties.join(','))
    }
    const query = params.toString()
    return this.request<HubSpotContactResponse>(
      `/crm/v3/objects/contacts/${contactId}${query ? `?${query}` : ''}`,
    )
  }

  /**
   * Search for contacts
   */
  async searchContacts(
    options: SearchContactsOptions,
  ): Promise<{ total: number; results: HubSpotContactResponse[] }> {
    return this.request('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify(options),
    })
  }

  /**
   * Find a contact by email
   */
  async findContactByEmail(email: string): Promise<HubSpotContactResponse | null> {
    try {
      const result = await this.searchContacts({
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'email',
                operator: 'EQ',
                value: email,
              },
            ],
          },
        ],
        properties: ['email', 'firstname', 'lastname', 'phone', 'company'],
        limit: 1,
      })

      return result.results[0] || null
    } catch (error) {
      if (error instanceof HubSpotApiError && error.status === 404) {
        return null
      }
      throw error
    }
  }

  /**
   * Create or update a contact by email
   */
  async upsertContact(
    email: string,
    properties: Record<string, string | number | boolean>,
  ): Promise<{ contact: HubSpotContactResponse; isNew: boolean }> {
    const existingContact = await this.findContactByEmail(email)

    if (existingContact) {
      const updated = await this.updateContact({
        contactId: existingContact.id,
        properties,
      })
      return { contact: updated, isNew: false }
    }

    const created = await this.createContact({
      properties: { ...properties, email },
    })
    return { contact: created, isNew: true }
  }

  /**
   * Add a contact to a list
   */
  async addContactToList(listId: number, contactEmail: string): Promise<void> {
    await this.request(`/contacts/v1/lists/${listId}/add`, {
      method: 'POST',
      body: JSON.stringify({
        emails: [contactEmail],
      }),
    })
  }

  /**
   * Add contacts to multiple lists
   */
  async addContactToLists(listIds: number[], contactEmail: string): Promise<void> {
    await Promise.all(listIds.map((listId) => this.addContactToList(listId, contactEmail)))
  }

  /**
   * Test the connection to HubSpot
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request('/crm/v3/objects/contacts?limit=1')
      return true
    } catch {
      return false
    }
  }

  /**
   * Get portal ID (if not provided, fetch from API)
   */
  async getPortalId(): Promise<string> {
    if (this.portalId) {
      return this.portalId
    }

    const accountInfo = await this.request<{ portalId: number }>('/account-info/v3/details')
    this.portalId = String(accountInfo.portalId)
    return this.portalId
  }
}

/**
 * Create a HubSpot client instance
 */
export function createHubSpotClient(options: HubSpotClientOptions): HubSpotClient {
  return new HubSpotClient(options)
}
