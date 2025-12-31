import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SessionManager } from './sessionManager.js'

describe('SessionManager', () => {
  let sessionManager: SessionManager

  beforeEach(() => {
    sessionManager = new SessionManager()
  })

  afterEach(() => {
    sessionManager.destroy()
  })

  describe('create', () => {
    it('should create a new session with default values', () => {
      const session = sessionManager.create('user-1')

      expect(session.id).toBeDefined()
      expect(session.userId).toBe('user-1')
      expect(session.createdAt).toBeInstanceOf(Date)
      expect(session.expiresAt).toBeInstanceOf(Date)
    })

    it('should create session with metadata', () => {
      const session = sessionManager.create('user-1', {
        source: 'web',
        version: '1.0',
      })

      expect(session.metadata?.source).toBe('web')
      expect(session.metadata?.version).toBe('1.0')
    })
  })

  describe('get', () => {
    it('should return existing session', () => {
      const created = sessionManager.create('user-1')
      const retrieved = sessionManager.get(created.id)

      expect(retrieved?.id).toEqual(created.id)
    })

    it('should return undefined for non-existent session', () => {
      const session = sessionManager.get('non-existent')
      expect(session).toBeUndefined()
    })
  })

  describe('getOrCreate', () => {
    it('should return existing session if valid', () => {
      const created = sessionManager.create('user-1')
      const retrieved = sessionManager.getOrCreate(created.id, 'user-1')

      expect(retrieved.id).toBe(created.id)
    })

    it('should create new session if session ID is undefined', () => {
      const session = sessionManager.getOrCreate(undefined, 'user-1')
      expect(session.id).toBeDefined()
      expect(session.userId).toBe('user-1')
    })

    it('should create new session if existing session is for different user', () => {
      const created = sessionManager.create('user-1')
      const retrieved = sessionManager.getOrCreate(created.id, 'user-2')

      expect(retrieved.id).not.toBe(created.id)
      expect(retrieved.userId).toBe('user-2')
    })
  })

  describe('update', () => {
    it('should update session context', () => {
      const session = sessionManager.create('user-1')

      sessionManager.update(session.id, {
        currentCollection: 'posts',
      })

      const updated = sessionManager.get(session.id)
      expect(updated?.currentCollection).toBe('posts')
    })

    it('should return undefined for non-existent session', () => {
      const result = sessionManager.update('non-existent', {
        currentCollection: 'posts',
      })
      expect(result).toBeUndefined()
    })
  })

  describe('setCollection', () => {
    it('should set current collection', () => {
      const session = sessionManager.create('user-1')
      sessionManager.setCollection(session.id, 'pages')

      const updated = sessionManager.get(session.id)
      expect(updated?.currentCollection).toBe('pages')
    })
  })

  describe('setSelectedDocuments', () => {
    it('should set selected documents', () => {
      const session = sessionManager.create('user-1')
      sessionManager.setSelectedDocuments(session.id, ['doc-1', 'doc-2'])

      const updated = sessionManager.get(session.id)
      expect(updated?.selectedDocuments).toEqual(['doc-1', 'doc-2'])
    })
  })

  describe('setConversation', () => {
    it('should set conversation ID', () => {
      const session = sessionManager.create('user-1')
      sessionManager.setConversation(session.id, 'conv-123')

      const updated = sessionManager.get(session.id)
      expect(updated?.conversationId).toBe('conv-123')
    })
  })

  describe('extend', () => {
    it('should extend session expiration', () => {
      const session = sessionManager.create('user-1')
      const originalExpiry = session.expiresAt.getTime()

      // Wait a bit
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          sessionManager.extend(session.id)
          const extended = sessionManager.get(session.id)
          expect(extended?.expiresAt.getTime()).toBeGreaterThanOrEqual(originalExpiry)
          resolve()
        }, 10)
      })
    })
  })

  describe('delete', () => {
    it('should delete existing session', () => {
      const session = sessionManager.create('user-1')
      expect(sessionManager.get(session.id)).toBeDefined()

      sessionManager.delete(session.id)
      expect(sessionManager.get(session.id)).toBeUndefined()
    })

    it('should return false for non-existent session', () => {
      const result = sessionManager.delete('non-existent')
      expect(result).toBe(false)
    })
  })

  describe('getUserSessions', () => {
    it('should return all sessions for a user', () => {
      sessionManager.create('user-1')
      sessionManager.create('user-1')
      sessionManager.create('user-2')

      const user1Sessions = sessionManager.getUserSessions('user-1')
      expect(user1Sessions.length).toBe(2)

      const user2Sessions = sessionManager.getUserSessions('user-2')
      expect(user2Sessions.length).toBe(1)
    })

    it('should return empty array for user with no sessions', () => {
      const sessions = sessionManager.getUserSessions('no-sessions')
      expect(sessions).toEqual([])
    })
  })

  describe('deleteUserSessions', () => {
    it('should delete all sessions for a user', () => {
      sessionManager.create('user-1')
      sessionManager.create('user-1')
      sessionManager.create('user-2')

      const deleted = sessionManager.deleteUserSessions('user-1')
      expect(deleted).toBe(2)

      expect(sessionManager.getUserSessions('user-1').length).toBe(0)
      expect(sessionManager.getUserSessions('user-2').length).toBe(1)
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      sessionManager.create('user-1')
      sessionManager.create('user-2')
      sessionManager.create('user-2')

      const stats = sessionManager.getStats()
      expect(stats.totalSessions).toBe(3)
      expect(stats.activeUsers).toBe(2)
      expect(stats.averageSessionAge).toBeGreaterThanOrEqual(0)
    })
  })

  describe('max sessions per user', () => {
    it('should enforce max sessions limit', () => {
      const manager = new SessionManager({ maxSessionsPerUser: 2 })

      manager.create('user-1')
      manager.create('user-1')
      manager.create('user-1') // This should cause oldest to be deleted

      const sessions = manager.getUserSessions('user-1')
      expect(sessions.length).toBe(2)

      manager.destroy()
    })
  })
})
