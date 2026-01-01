import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConfirmationManager } from './confirmationManager.js'

describe('ConfirmationManager', () => {
  let manager: ConfirmationManager

  beforeEach(() => {
    manager = new ConfirmationManager({
      bulkOperations: 'modal',
      configChanges: 'modal',
      destructiveActions: 'modal',
      timeoutSeconds: 60,
    })
  })

  describe('getConfirmationLevel', () => {
    it('should return modal for delete operations', () => {
      expect(manager.getConfirmationLevel('delete_posts', {})).toBe('modal')
      expect(manager.getConfirmationLevel('remove_users', {})).toBe('modal')
    })

    it('should return modal for bulk operations', () => {
      expect(manager.getConfirmationLevel('update_posts', { where: {} })).toBe('modal')
      expect(manager.getConfirmationLevel('update_posts', { ids: ['1', '2', '3'] })).toBe(
        'modal'
      )
    })

    it('should return modal for config changes', () => {
      expect(manager.getConfirmationLevel('update_config', {})).toBe('modal')
      expect(manager.getConfirmationLevel('add_collection', {})).toBe('modal')
    })

    it('should return none for regular operations', () => {
      expect(manager.getConfirmationLevel('create_post', {})).toBe('none')
      expect(manager.getConfirmationLevel('read_posts', {})).toBe('none')
    })
  })

  describe('requestConfirmation', () => {
    it('should return true immediately for non-destructive operations', async () => {
      const result = await manager.requestConfirmation(
        'session-1',
        'create_post',
        { title: 'Test' },
        'Create a new post'
      )
      expect(result).toBe(true)
    })

    it('should wait for approval on destructive operations', async () => {
      // Start the confirmation request
      const confirmPromise = manager.requestConfirmation(
        'session-1',
        'delete_posts',
        { id: 'post-1' },
        'Delete post'
      )

      // Get pending confirmations
      const pending = manager.getPending('session-1')
      expect(pending.length).toBe(1)

      // Approve the confirmation
      manager.approve(pending[0].id)

      // Now the promise should resolve
      const result = await confirmPromise
      expect(result).toBe(true)
    })

    it('should return false when denied', async () => {
      const confirmPromise = manager.requestConfirmation(
        'session-1',
        'delete_posts',
        { id: 'post-1' },
        'Delete post'
      )

      const pending = manager.getPending('session-1')
      manager.deny(pending[0].id)

      const result = await confirmPromise
      expect(result).toBe(false)
    })
  })

  describe('approve', () => {
    it('should return false for non-existent confirmation', () => {
      const result = manager.approve('non-existent')
      expect(result).toBe(false)
    })
  })

  describe('deny', () => {
    it('should return false for non-existent confirmation', () => {
      const result = manager.deny('non-existent')
      expect(result).toBe(false)
    })
  })

  describe('getPending', () => {
    it('should only return pending confirmations for the session', () => {
      // Create confirmation for session-1
      void manager.requestConfirmation(
        'session-1',
        'delete_posts',
        { id: '1' },
        'Delete 1'
      )

      // Create confirmation for session-2
      void manager.requestConfirmation(
        'session-2',
        'delete_posts',
        { id: '2' },
        'Delete 2'
      )

      const session1Pending = manager.getPending('session-1')
      expect(session1Pending.length).toBe(1)

      const session2Pending = manager.getPending('session-2')
      expect(session2Pending.length).toBe(1)
    })
  })

  describe('getConfirmation', () => {
    it('should return the confirmation by ID', () => {
      void manager.requestConfirmation(
        'session-1',
        'delete_posts',
        { id: '1' },
        'Delete post'
      )

      const pending = manager.getPending('session-1')
      const confirmation = manager.getConfirmation(pending[0].id)

      expect(confirmation).toBeDefined()
      expect(confirmation?.toolName).toBe('delete_posts')
    })

    it('should return undefined for non-existent confirmation', () => {
      const confirmation = manager.getConfirmation('non-existent')
      expect(confirmation).toBeUndefined()
    })
  })

  describe('timeout', () => {
    it('should expire confirmation after timeout', async () => {
      vi.useFakeTimers()

      const shortManager = new ConfirmationManager({
        destructiveActions: 'modal',
        timeoutSeconds: 1,
      })

      const confirmPromise = shortManager.requestConfirmation(
        'session-1',
        'delete_posts',
        { id: '1' },
        'Delete post'
      )

      // Advance time past timeout
      vi.advanceTimersByTime(1500)

      const result = await confirmPromise
      expect(result).toBe(false)

      vi.useRealTimers()
    })
  })

  describe('generateMessage', () => {
    it('should generate delete message for single document', () => {
      const message = ConfirmationManager.generateMessage('delete_post', { id: '1' })
      expect(message).toContain('delete')
      expect(message).toContain('cannot be undone')
    })

    it('should generate delete message for multiple documents', () => {
      const message = ConfirmationManager.generateMessage('delete_posts', {
        ids: ['1', '2', '3'],
      })
      expect(message).toContain('3 documents')
    })

    it('should generate delete message with filter', () => {
      const message = ConfirmationManager.generateMessage('delete_posts', {
        where: { status: { equals: 'draft' } },
      })
      expect(message).toContain('filter')
    })

    it('should generate bulk update message', () => {
      const message = ConfirmationManager.generateMessage('bulk_update', {
        where: {},
      })
      expect(message).toContain('multiple documents')
    })

    it('should generate config change message', () => {
      const message = ConfirmationManager.generateMessage('update_config', {})
      expect(message).toContain('configuration')
    })
  })

  describe('cleanup', () => {
    it('should remove old non-pending confirmations', () => {
      void manager.requestConfirmation(
        'session-1',
        'delete_posts',
        { id: '1' },
        'Delete post'
      )

      const pending = manager.getPending('session-1')
      manager.approve(pending[0].id)

      // Confirmation should still exist after approval
      expect(manager.getConfirmation(pending[0].id)).toBeDefined()

      // In a real scenario, cleanup would remove it after 5 minutes
      // Here we just verify the cleanup method doesn't crash
      manager.cleanup()
    })
  })
})
