import { describe, it, expect, beforeEach } from 'vitest'
import { IPAllowlist } from './ipAllowlist.js'

// Mock PayloadRequest for testing
const createMockRequest = (ip: string) => ({
  headers: new Map([
    ['x-forwarded-for', ip],
  ]) as unknown as Headers,
} as any)

describe('IPAllowlist', () => {
  describe('with allowlist disabled', () => {
    it('should allow all IPs when disabled', () => {
      const allowlist = new IPAllowlist({ enabled: false })
      expect(allowlist.isAllowed(createMockRequest('192.168.1.1'))).toBe(true)
      expect(allowlist.isAllowed(createMockRequest('10.0.0.1'))).toBe(true)
      expect(allowlist.isAllowed(createMockRequest('8.8.8.8'))).toBe(true)
    })
  })

  describe('with specific IPs', () => {
    let allowlist: IPAllowlist

    beforeEach(() => {
      allowlist = new IPAllowlist({
        enabled: true,
        allowedIPs: ['192.168.1.1', '10.0.0.5'],
        denyByDefault: true,
      })
    })

    it('should allow listed IPs', () => {
      expect(allowlist.isAllowed(createMockRequest('192.168.1.1'))).toBe(true)
      expect(allowlist.isAllowed(createMockRequest('10.0.0.5'))).toBe(true)
    })

    it('should deny unlisted IPs', () => {
      expect(allowlist.isAllowed(createMockRequest('192.168.1.2'))).toBe(false)
      expect(allowlist.isAllowed(createMockRequest('8.8.8.8'))).toBe(false)
    })
  })

  describe('with CIDR ranges', () => {
    let allowlist: IPAllowlist

    beforeEach(() => {
      allowlist = new IPAllowlist({
        enabled: true,
        allowedCIDRs: ['192.168.1.0/24', '10.0.0.0/8'],
        denyByDefault: true,
      })
    })

    it('should allow IPs within CIDR range', () => {
      expect(allowlist.isAllowed(createMockRequest('192.168.1.1'))).toBe(true)
      expect(allowlist.isAllowed(createMockRequest('192.168.1.255'))).toBe(true)
      expect(allowlist.isAllowed(createMockRequest('10.0.0.1'))).toBe(true)
      expect(allowlist.isAllowed(createMockRequest('10.255.255.255'))).toBe(true)
    })

    it('should deny IPs outside CIDR range', () => {
      expect(allowlist.isAllowed(createMockRequest('192.168.2.1'))).toBe(false)
      expect(allowlist.isAllowed(createMockRequest('11.0.0.1'))).toBe(false)
    })
  })

  describe('with mixed IPs and CIDRs', () => {
    let allowlist: IPAllowlist

    beforeEach(() => {
      allowlist = new IPAllowlist({
        enabled: true,
        allowedIPs: ['1.2.3.4'],
        allowedCIDRs: ['192.168.0.0/16'],
        denyByDefault: true,
      })
    })

    it('should allow both specific IPs and CIDR ranges', () => {
      expect(allowlist.isAllowed(createMockRequest('1.2.3.4'))).toBe(true)
      expect(allowlist.isAllowed(createMockRequest('192.168.100.50'))).toBe(true)
    })
  })

  describe('denyByDefault: false', () => {
    it('should allow all IPs when denyByDefault is false', () => {
      const allowlist = new IPAllowlist({
        enabled: true,
        allowedIPs: ['192.168.1.1'],
        denyByDefault: false,
      })

      // The allowlist becomes a "recommendation" rather than a block
      expect(allowlist.isAllowed(createMockRequest('192.168.1.1'))).toBe(true)
      expect(allowlist.isAllowed(createMockRequest('8.8.8.8'))).toBe(true)
    })
  })

  describe('dynamic updates', () => {
    it('should allow adding IPs dynamically', () => {
      const allowlist = new IPAllowlist({
        enabled: true,
        denyByDefault: true,
      })

      expect(allowlist.isAllowed(createMockRequest('192.168.1.1'))).toBe(false)

      allowlist.addIP('192.168.1.1')
      expect(allowlist.isAllowed(createMockRequest('192.168.1.1'))).toBe(true)
    })

    it('should allow removing IPs dynamically', () => {
      const allowlist = new IPAllowlist({
        enabled: true,
        allowedIPs: ['192.168.1.1'],
        denyByDefault: true,
      })

      expect(allowlist.isAllowed(createMockRequest('192.168.1.1'))).toBe(true)

      allowlist.removeIP('192.168.1.1')
      expect(allowlist.isAllowed(createMockRequest('192.168.1.1'))).toBe(false)
    })

    it('should allow adding CIDR ranges dynamically', () => {
      const allowlist = new IPAllowlist({
        enabled: true,
        denyByDefault: true,
      })

      expect(allowlist.isAllowed(createMockRequest('10.0.0.5'))).toBe(false)

      allowlist.addCIDR('10.0.0.0/8')
      expect(allowlist.isAllowed(createMockRequest('10.0.0.5'))).toBe(true)
    })
  })

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const allowlist = new IPAllowlist({
        enabled: true,
        allowedIPs: ['1.2.3.4'],
        allowedCIDRs: ['10.0.0.0/8'],
        denyByDefault: true,
      })

      const config = allowlist.getConfig()
      expect(config.enabled).toBe(true)
      expect(config.allowedIPs).toContain('1.2.3.4')
      expect(config.allowedCIDRs).toContain('10.0.0.0/8')
    })
  })
})
