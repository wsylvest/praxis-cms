import type { PayloadRequest } from 'payload'

import type { IPAllowlistConfig } from '../types/index.js'

/**
 * IP Allowlist middleware
 * Restricts access based on IP address or CIDR ranges
 */
export class IPAllowlist {
  private config: IPAllowlistConfig
  private allowedIPs: Set<string>
  private allowedCIDRs: CIDR[]

  constructor(config: IPAllowlistConfig) {
    this.config = config
    this.allowedIPs = new Set(config.allowedIPs || [])
    this.allowedCIDRs = (config.allowedCIDRs || []).map((cidr) => new CIDR(cidr))
  }

  /**
   * Get client IP from request
   */
  private getClientIP(req: PayloadRequest): string {
    // Check forwarded headers (reverse proxy)
    const forwarded = req.headers.get('x-forwarded-for')
    if (forwarded) {
      return forwarded.split(',')[0].trim()
    }

    const realIP = req.headers.get('x-real-ip')
    if (realIP) {
      return realIP.trim()
    }

    // Fallback
    return 'unknown'
  }

  /**
   * Check if an IP is allowed
   */
  isAllowed(req: PayloadRequest): boolean {
    if (!this.config.enabled) {
      return true
    }

    const clientIP = this.getClientIP(req)

    // Unknown IP handling
    if (clientIP === 'unknown') {
      return !this.config.denyByDefault
    }

    // Check exact IP match
    if (this.allowedIPs.has(clientIP)) {
      return true
    }

    // Check CIDR ranges
    for (const cidr of this.allowedCIDRs) {
      if (cidr.contains(clientIP)) {
        return true
      }
    }

    // If deny by default, reject; otherwise allow
    return !this.config.denyByDefault
  }

  /**
   * Add an IP to the allowlist
   */
  addIP(ip: string): void {
    this.allowedIPs.add(ip)
  }

  /**
   * Remove an IP from the allowlist
   */
  removeIP(ip: string): void {
    this.allowedIPs.delete(ip)
  }

  /**
   * Add a CIDR range to the allowlist
   */
  addCIDR(cidr: string): void {
    this.allowedCIDRs.push(new CIDR(cidr))
  }

  /**
   * Get current allowlist configuration
   */
  getConfig(): IPAllowlistConfig {
    return {
      ...this.config,
      allowedIPs: Array.from(this.allowedIPs),
      allowedCIDRs: this.allowedCIDRs.map((c) => c.toString()),
    }
  }
}

/**
 * CIDR range helper class
 */
class CIDR {
  private ip: number
  private mask: number
  private cidrString: string

  constructor(cidr: string) {
    this.cidrString = cidr
    const [ip, prefix] = cidr.split('/')
    this.ip = this.ipToNumber(ip)
    this.mask = prefix ? (-1 << (32 - parseInt(prefix, 10))) >>> 0 : 0xffffffff
  }

  private ipToNumber(ip: string): number {
    const parts = ip.split('.').map(Number)
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
  }

  contains(ip: string): boolean {
    const ipNum = this.ipToNumber(ip)
    return (ipNum & this.mask) === (this.ip & this.mask)
  }

  toString(): string {
    return this.cidrString
  }
}

/**
 * Create IP allowlist middleware
 */
export function createIPAllowlist(config: IPAllowlistConfig): IPAllowlist {
  return new IPAllowlist(config)
}

/**
 * Common allowlist presets
 */
export const IPAllowlistPresets = {
  /** Allow localhost only */
  localhost: {
    enabled: true,
    allowedIPs: ['127.0.0.1', '::1'],
    allowedCIDRs: [],
    denyByDefault: true,
  },

  /** Allow private networks */
  privateNetworks: {
    enabled: true,
    allowedIPs: ['127.0.0.1', '::1'],
    allowedCIDRs: [
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
    ],
    denyByDefault: true,
  },

  /** Disabled (allow all) */
  disabled: {
    enabled: false,
    allowedIPs: [],
    allowedCIDRs: [],
    denyByDefault: false,
  },
} as const
