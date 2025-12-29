/**
 * MCP API Key Enhancements
 *
 * Adds expiration, rotation, and IP allowlist capabilities to API keys.
 */

import type { Field, Payload } from 'payload'

import crypto from 'crypto'

export interface ApiKeyEnhancementsConfig {
  /**
   * Default expiration time in days
   * @default 365
   */
  defaultExpirationDays?: number

  /**
   * Enable key expiration
   * @default true
   */
  enableExpiration?: boolean

  /**
   * Enable IP allowlist
   * @default true
   */
  enableIpAllowlist?: boolean

  /**
   * Enable key rotation tracking
   * @default true
   */
  enableRotation?: boolean

  /**
   * Enable usage tracking
   * @default true
   */
  enableUsageTracking?: boolean

  /**
   * Warning days before expiration
   * @default 30
   */
  expirationWarningDays?: number

  /**
   * Grace period after rotation in hours (old key still works)
   * @default 24
   */
  rotationGracePeriodHours?: number
}

/**
 * Enhanced API key fields to add to the collection
 */
export function getEnhancedApiKeyFields(config: ApiKeyEnhancementsConfig = {}): Field[] {
  const {
    defaultExpirationDays = 365,
    enableExpiration = true,
    enableIpAllowlist = true,
    enableRotation = true,
    enableUsageTracking = true,
  } = config

  const fields: Field[] = []

  // Expiration fields
  if (enableExpiration) {
    fields.push({
      type: 'collapsible',
      admin: {
        description: 'Configure key expiration settings',
        position: 'sidebar',
      },
      fields: [
        {
          name: 'expiresAt',
          type: 'date',
          admin: {
            date: {
              displayFormat: 'yyyy-MM-dd HH:mm:ss',
            },
            description: 'When the API key expires (leave empty for no expiration)',
          },
          index: true,
        },
        {
          name: 'neverExpires',
          type: 'checkbox',
          admin: {
            description: 'If checked, this key will never expire',
          },
          defaultValue: false,
        },
        {
          name: 'expirationNotificationSent',
          type: 'checkbox',
          admin: {
            description: 'Whether expiration warning notification was sent',
            readOnly: true,
          },
          defaultValue: false,
        },
      ],
      label: 'Expiration',
    })
  }

  // IP Allowlist fields
  if (enableIpAllowlist) {
    fields.push({
      type: 'collapsible',
      admin: {
        description: 'Restrict key usage to specific IP addresses',
        position: 'sidebar',
      },
      fields: [
        {
          name: 'ipAllowlistEnabled',
          type: 'checkbox',
          admin: {
            description: 'Enable IP address restrictions',
          },
          defaultValue: false,
        },
        {
          name: 'ipAllowlist',
          type: 'array',
          admin: {
            condition: (data) => data?.ipAllowlistEnabled === true,
            description: 'IP addresses or CIDR ranges allowed to use this key',
          },
          fields: [
            {
              name: 'ip',
              type: 'text',
              admin: {
                description: 'IP address (e.g., 192.168.1.1) or CIDR range (e.g., 10.0.0.0/8)',
              },
              required: true,
            },
            {
              name: 'label',
              type: 'text',
              admin: {
                description: 'Optional label for this IP/range',
              },
            },
          ],
        },
      ],
      label: 'IP Restrictions',
    })
  }

  // Rotation fields
  if (enableRotation) {
    fields.push({
      type: 'collapsible',
      admin: {
        description: 'Key rotation settings',
        position: 'sidebar',
      },
      fields: [
        {
          name: 'rotatedAt',
          type: 'date',
          admin: {
            description: 'When the key was last rotated',
            readOnly: true,
          },
        },
        {
          name: 'previousKeyHash',
          type: 'text',
          admin: {
            description: 'Hash of the previous key (for grace period)',
            hidden: true,
            readOnly: true,
          },
        },
        {
          name: 'previousKeyExpiresAt',
          type: 'date',
          admin: {
            description: 'When the previous key grace period expires',
            readOnly: true,
          },
        },
        {
          name: 'rotationCount',
          type: 'number',
          admin: {
            description: 'Number of times this key has been rotated',
            readOnly: true,
          },
          defaultValue: 0,
        },
      ],
      label: 'Rotation',
    })
  }

  // Usage tracking fields
  if (enableUsageTracking) {
    fields.push({
      type: 'collapsible',
      admin: {
        description: 'Key usage statistics',
        position: 'sidebar',
      },
      fields: [
        {
          name: 'lastUsedAt',
          type: 'date',
          admin: {
            description: 'When the key was last used',
            readOnly: true,
          },
        },
        {
          name: 'lastUsedFromIp',
          type: 'text',
          admin: {
            description: 'IP address of last request',
            readOnly: true,
          },
        },
        {
          name: 'totalRequests',
          type: 'number',
          admin: {
            description: 'Total number of requests made with this key',
            readOnly: true,
          },
          defaultValue: 0,
        },
        {
          name: 'requestsToday',
          type: 'number',
          admin: {
            description: 'Requests made today',
            readOnly: true,
          },
          defaultValue: 0,
        },
        {
          name: 'requestsResetAt',
          type: 'date',
          admin: {
            description: 'When daily request counter was last reset',
            hidden: true,
          },
        },
      ],
      label: 'Usage Statistics',
    })
  }

  // Status field
  fields.push({
    name: 'status',
    type: 'select',
    admin: {
      description: 'Current status of the API key',
      position: 'sidebar',
    },
    defaultValue: 'active',
    index: true,
    options: [
      { label: 'Active', value: 'active' },
      { label: 'Inactive', value: 'inactive' },
      { label: 'Expired', value: 'expired' },
      { label: 'Revoked', value: 'revoked' },
    ],
  })

  // Revocation fields
  fields.push({
    type: 'collapsible',
    admin: {
      condition: (data) => data?.status === 'revoked',
      description: 'Revocation details',
      position: 'sidebar',
    },
    fields: [
      {
        name: 'revokedAt',
        type: 'date',
        admin: {
          description: 'When the key was revoked',
          readOnly: true,
        },
      },
      {
        name: 'revokedBy',
        type: 'text',
        admin: {
          description: 'Who revoked the key',
          readOnly: true,
        },
      },
      {
        name: 'revocationReason',
        type: 'text',
        admin: {
          description: 'Reason for revocation',
        },
      },
    ],
    label: 'Revocation',
  })

  return fields
}

/**
 * Create API key manager for enhanced operations
 */
export function createApiKeyManager(config: ApiKeyEnhancementsConfig = {}) {
  const { expirationWarningDays = 30, rotationGracePeriodHours = 24 } = config

  return {
    /**
     * Validate if an API key is currently valid
     */
    async validateKey(
      payload: Payload,
      apiKeyId: string,
      clientIp?: string,
    ): Promise<{
      apiKey?: any
      reason?: string
      valid: boolean
    }> {
      try {
        const apiKey = await payload.findByID({
          id: apiKeyId,
          collection: 'payload-mcp-api-keys',
        })

        if (!apiKey) {
          return { reason: 'API key not found', valid: false }
        }

        // Check status
        if (apiKey.status === 'inactive') {
          return { apiKey, reason: 'API key is inactive', valid: false }
        }
        if (apiKey.status === 'revoked') {
          return { apiKey, reason: 'API key has been revoked', valid: false }
        }
        if (apiKey.status === 'expired') {
          return { apiKey, reason: 'API key has expired', valid: false }
        }

        // Check expiration
        if (!apiKey.neverExpires && apiKey.expiresAt) {
          if (new Date(apiKey.expiresAt) < new Date()) {
            // Update status to expired
            await payload.update({
              id: apiKeyId,
              collection: 'payload-mcp-api-keys',
              data: { status: 'expired' },
            })
            return { apiKey, reason: 'API key has expired', valid: false }
          }
        }

        // Check IP allowlist
        if (apiKey.ipAllowlistEnabled && apiKey.ipAllowlist?.length > 0 && clientIp) {
          const isAllowed = this.isIpAllowed(clientIp, apiKey.ipAllowlist)
          if (!isAllowed) {
            return { apiKey, reason: 'IP address not in allowlist', valid: false }
          }
        }

        return { apiKey, valid: true }
      } catch {
        return { reason: 'Failed to validate API key', valid: false }
      }
    },

    /**
     * Check if IP is in allowlist
     */
    isIpAllowed(clientIp: string, allowlist: Array<{ ip: string }>): boolean {
      for (const entry of allowlist) {
        if (this.ipMatches(clientIp, entry.ip)) {
          return true
        }
      }
      return false
    },

    /**
     * Check if IP matches pattern (exact or CIDR)
     */
    ipMatches(clientIp: string, pattern: string): boolean {
      // Exact match
      if (clientIp === pattern) {
        return true
      }

      // CIDR match
      if (pattern.includes('/')) {
        return this.ipInCidr(clientIp, pattern)
      }

      return false
    },

    /**
     * Check if IP is in CIDR range
     */
    ipInCidr(ip: string, cidr: string): boolean {
      const parts = cidr.split('/')
      const range = parts[0] || ''
      const bits = parts[1] || '32'
      const mask = parseInt(bits, 10)

      const ipNum = this.ipToNumber(ip)
      const rangeNum = this.ipToNumber(range)
      const maskNum = (-1 << (32 - mask)) >>> 0

      return (ipNum & maskNum) === (rangeNum & maskNum)
    },

    /**
     * Convert IP to number
     */
    ipToNumber(ip: string): number {
      return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
    },

    /**
     * Rotate an API key
     */
    async rotateKey(
      payload: Payload,
      apiKeyId: string,
      rotatedBy: string,
    ): Promise<{
      error?: string
      newKey?: string
      success: boolean
    }> {
      try {
        const apiKey = await payload.findByID({
          id: apiKeyId,
          collection: 'payload-mcp-api-keys',
        })

        if (!apiKey) {
          return { error: 'API key not found', success: false }
        }

        // Generate new API key
        const newApiKey = this.generateApiKey()
        const newKeyHash = this.hashApiKey(newApiKey)

        // Store previous key hash for grace period
        const previousKeyExpiresAt = new Date()
        previousKeyExpiresAt.setHours(previousKeyExpiresAt.getHours() + rotationGracePeriodHours)

        await payload.update({
          id: apiKeyId,
          collection: 'payload-mcp-api-keys',
          data: {
            apiKey: newApiKey, // Payload will hash this
            previousKeyExpiresAt,
            previousKeyHash: apiKey.apiKey, // Store the old hash
            rotatedAt: new Date(),
            rotationCount: (apiKey.rotationCount || 0) + 1,
          },
        })

        return { newKey: newApiKey, success: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return { error: message, success: false }
      }
    },

    /**
     * Generate a new API key
     */
    generateApiKey(): string {
      return crypto.randomBytes(32).toString('hex')
    },

    /**
     * Hash an API key
     */
    hashApiKey(key: string): string {
      return crypto.createHash('sha256').update(key).digest('hex')
    },

    /**
     * Record API key usage
     */
    async recordUsage(payload: Payload, apiKeyId: string, clientIp: string): Promise<void> {
      try {
        const apiKey = await payload.findByID({
          id: apiKeyId,
          collection: 'payload-mcp-api-keys',
        })

        if (!apiKey) {
          return
        }

        const now = new Date()
        let requestsToday = apiKey.requestsToday || 0
        let requestsResetAt = apiKey.requestsResetAt ? new Date(apiKey.requestsResetAt) : now

        // Reset daily counter if it's a new day
        if (!requestsResetAt || now.toDateString() !== requestsResetAt.toDateString()) {
          requestsToday = 0
          requestsResetAt = now
        }

        await payload.update({
          id: apiKeyId,
          collection: 'payload-mcp-api-keys',
          data: {
            lastUsedAt: now,
            lastUsedFromIp: clientIp,
            requestsResetAt,
            requestsToday: requestsToday + 1,
            totalRequests: (apiKey.totalRequests || 0) + 1,
          },
        })
      } catch {
        // Don't fail requests if usage tracking fails
      }
    },

    /**
     * Revoke an API key
     */
    async revokeKey(
      payload: Payload,
      apiKeyId: string,
      revokedBy: string,
      reason?: string,
    ): Promise<boolean> {
      try {
        await payload.update({
          id: apiKeyId,
          collection: 'payload-mcp-api-keys',
          data: {
            revocationReason: reason,
            revokedAt: new Date(),
            revokedBy,
            status: 'revoked',
          },
        })
        return true
      } catch {
        return false
      }
    },

    /**
     * Get keys expiring soon
     */
    async getExpiringKeys(
      payload: Payload,
      daysUntilExpiration: number = expirationWarningDays,
    ): Promise<any[]> {
      const warningDate = new Date()
      warningDate.setDate(warningDate.getDate() + daysUntilExpiration)

      const result = await payload.find({
        collection: 'payload-mcp-api-keys',
        where: {
          expirationNotificationSent: { not_equals: true },
          expiresAt: {
            greater_than: new Date(),
            less_than: warningDate,
          },
          neverExpires: { not_equals: true },
          status: { equals: 'active' },
        },
      })

      return result.docs
    },

    /**
     * Expire old keys
     */
    async expireKeys(payload: Payload): Promise<number> {
      const result = await payload.update({
        collection: 'payload-mcp-api-keys',
        data: {
          status: 'expired',
        },
        where: {
          expiresAt: { less_than: new Date() },
          neverExpires: { not_equals: true },
          status: { equals: 'active' },
        },
      })

      return Array.isArray(result.docs) ? result.docs.length : 0
    },

    /**
     * Get usage statistics for a key
     */
    async getKeyStats(
      payload: Payload,
      apiKeyId: string,
    ): Promise<{
      daysUntilExpiration: null | number
      lastUsedAt: Date | null
      requestsToday: number
      rotationCount: number
      totalRequests: number
    } | null> {
      try {
        const apiKey = await payload.findByID({
          id: apiKeyId,
          collection: 'payload-mcp-api-keys',
        })

        if (!apiKey) {
          return null
        }

        let daysUntilExpiration: null | number = null
        if (!apiKey.neverExpires && apiKey.expiresAt) {
          const expiresAt = new Date(apiKey.expiresAt)
          const now = new Date()
          daysUntilExpiration = Math.ceil(
            (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          )
        }

        return {
          daysUntilExpiration,
          lastUsedAt: apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt) : null,
          requestsToday: apiKey.requestsToday || 0,
          rotationCount: apiKey.rotationCount || 0,
          totalRequests: apiKey.totalRequests || 0,
        }
      } catch {
        return null
      }
    },
  }
}

export type ApiKeyManager = ReturnType<typeof createApiKeyManager>
