import type {
  SalesforceApiErrorResponse,
  SalesforceApiResponse,
  SalesforceAuthResponse,
  SalesforceCredentials,
  SalesforceLead,
  SalesforcePluginState,
} from '../types.js'

const DEFAULT_LOGIN_URL = 'https://login.salesforce.com'
const TOKEN_ENDPOINT = '/services/oauth2/token'
const API_VERSION = 'v59.0'

export class SalesforceApiError extends Error {
  public readonly errorCode: string
  public readonly fields?: string[]

  constructor(message: string, errorCode: string, fields?: string[]) {
    super(message)
    this.name = 'SalesforceApiError'
    this.errorCode = errorCode
    this.fields = fields
  }
}

export class SalesforceClient {
  private credentials: SalesforceCredentials
  private state: SalesforcePluginState = {}

  constructor(credentials: SalesforceCredentials) {
    this.credentials = credentials
    if (credentials.instanceUrl) {
      this.state.instanceUrl = credentials.instanceUrl
    }
  }

  /**
   * Make an authenticated API request
   */
  private async apiRequest<T>(method: string, endpoint: string, body?: object): Promise<T> {
    await this.ensureAuthenticated()

    const url = `${this.getApiBaseUrl()}${endpoint}`

    const response = await fetch(url, {
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        Authorization: `Bearer ${this.state.accessToken}`,
        'Content-Type': 'application/json',
      },
      method,
    })

    if (response.status === 401) {
      // Token expired, re-authenticate and retry
      await this.authenticate()
      return this.apiRequest<T>(method, endpoint, body)
    }

    if (!response.ok) {
      const errorData = (await response.json().catch(() => [])) as SalesforceApiErrorResponse[]
      const firstError = errorData[0]
      if (firstError) {
        throw new SalesforceApiError(firstError.message, firstError.errorCode, firstError.fields)
      }
      throw new Error(`Salesforce API error: ${response.statusText}`)
    }

    if (response.status === 204) {
      return {} as T
    }

    return response.json() as Promise<T>
  }

  /**
   * Ensure we have a valid access token
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.state.accessToken) {
      await this.authenticate()
    }
  }

  /**
   * Get the base URL for REST API calls
   */
  private getApiBaseUrl(): string {
    if (!this.state.instanceUrl) {
      throw new Error('Instance URL not available. Please authenticate first.')
    }
    return `${this.state.instanceUrl}/services/data/${API_VERSION}`
  }

  /**
   * Authenticate with Salesforce using OAuth 2.0 password flow
   */
  async authenticate(): Promise<void> {
    const loginUrl = this.credentials.loginUrl || DEFAULT_LOGIN_URL
    const tokenUrl = `${loginUrl}${TOKEN_ENDPOINT}`

    const params = new URLSearchParams()
    params.append('grant_type', 'password')
    params.append('client_id', this.credentials.clientId)
    params.append('client_secret', this.credentials.clientSecret)

    if (this.credentials.username && this.credentials.password) {
      params.append('username', this.credentials.username)
      params.append('password', this.credentials.password)
    } else if (this.credentials.refreshToken) {
      params.set('grant_type', 'refresh_token')
      params.append('refresh_token', this.credentials.refreshToken)
    } else {
      throw new Error('Either username/password or refreshToken is required for authentication')
    }

    const response = await fetch(tokenUrl, {
      body: params.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        `Salesforce authentication failed: ${errorData.error_description || response.statusText}`,
      )
    }

    const data = (await response.json()) as SalesforceAuthResponse
    this.state.accessToken = data.access_token
    this.state.instanceUrl = data.instance_url
  }

  /**
   * Create a new Lead in Salesforce
   */
  async createLead(lead: SalesforceLead): Promise<SalesforceApiResponse> {
    return this.apiRequest<SalesforceApiResponse>('POST', '/sobjects/Lead', lead)
  }

  /**
   * Delete a Lead from Salesforce
   */
  async deleteLead(salesforceId: string): Promise<void> {
    await this.apiRequest<void>('DELETE', `/sobjects/Lead/${salesforceId}`)
  }

  /**
   * Check if a Lead exists by email
   */
  async findLeadByEmail(email: string): Promise<null | SalesforceLead> {
    const escapedEmail = email.replace(/'/g, "\\'")
    const result = await this.queryLeads(
      `SELECT Id, FirstName, LastName, Email, Company FROM Lead WHERE Email = '${escapedEmail}' LIMIT 1`,
    )
    return result.records[0] || null
  }

  /**
   * Get the current access token (for debugging/testing)
   */
  getAccessToken(): string | undefined {
    return this.state.accessToken
  }

  /**
   * Get the current instance URL
   */
  getInstanceUrl(): string | undefined {
    return this.state.instanceUrl
  }

  /**
   * Get a Lead by ID from Salesforce
   */
  async getLead(salesforceId: string): Promise<SalesforceLead> {
    return this.apiRequest<SalesforceLead>('GET', `/sobjects/Lead/${salesforceId}`)
  }

  /**
   * Query Leads using SOQL
   */
  async queryLeads(soql: string): Promise<{ records: SalesforceLead[]; totalSize: number }> {
    const encodedQuery = encodeURIComponent(soql)
    return this.apiRequest<{ records: SalesforceLead[]; totalSize: number }>(
      'GET',
      `/query?q=${encodedQuery}`,
    )
  }

  /**
   * Update an existing Lead in Salesforce
   */
  async updateLead(salesforceId: string, lead: Partial<SalesforceLead>): Promise<void> {
    await this.apiRequest<void>('PATCH', `/sobjects/Lead/${salesforceId}`, lead)
  }
}

/**
 * Create a new Salesforce client instance
 */
export function createSalesforceClient(credentials: SalesforceCredentials): SalesforceClient {
  return new SalesforceClient(credentials)
}
