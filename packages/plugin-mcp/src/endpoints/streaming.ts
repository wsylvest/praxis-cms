/**
 * MCP Streaming Endpoint
 *
 * Server-Sent Events (SSE) endpoint for real-time feedback during MCP operations.
 * Allows AI agents to receive progress updates for long-running operations.
 */

import type { PayloadHandler, PayloadRequest } from 'payload'

export interface StreamEvent {
  data: unknown
  id?: string
  timestamp: Date
  type: 'confirmation' | 'error' | 'heartbeat' | 'progress' | 'result' | 'undo'
}

export interface StreamSession {
  apiKeyId: string
  controller: null | ReadableStreamDefaultController
  id: string
  lastEventAt: Date
  startedAt: Date
  userId: string
}

// In-memory store for active stream sessions
const activeSessions = new Map<string, StreamSession>()

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `mcp-stream-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Format event for SSE
 */
function formatSSE(event: StreamEvent): string {
  const lines: string[] = []

  if (event.id) {
    lines.push(`id: ${event.id}`)
  }

  lines.push(`event: ${event.type}`)
  lines.push(`data: ${JSON.stringify(event.data)}`)
  lines.push('')

  return lines.join('\n') + '\n'
}

/**
 * Create the streaming endpoint handler
 */
export function createStreamingEndpoint(): PayloadHandler {
  return (req: PayloadRequest) => {
    const { user } = req

    // Validate authentication
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    // Get API key ID from header
    const apiKeyId = req.headers.get('x-mcp-api-key-id') || 'unknown'

    // Create stream session
    const sessionId = generateSessionId()
    const session: StreamSession = {
      id: sessionId,
      apiKeyId,
      controller: null,
      lastEventAt: new Date(),
      startedAt: new Date(),
      userId: String(user.id),
    }

    // Create SSE stream
    const stream = new ReadableStream({
      start(controller) {
        session.controller = controller

        // Store session
        activeSessions.set(sessionId, session)

        // Send initial connection event
        const connectEvent: StreamEvent = {
          id: `${sessionId}-0`,
          type: 'progress',
          data: {
            message: 'Connected to MCP stream',
            sessionId,
          },
          timestamp: new Date(),
        }
        controller.enqueue(new TextEncoder().encode(formatSSE(connectEvent)))

        // Setup heartbeat to keep connection alive
        const heartbeatInterval = setInterval(() => {
          if (session.controller) {
            const heartbeat: StreamEvent = {
              type: 'heartbeat',
              data: { timestamp: new Date().toISOString() },
              timestamp: new Date(),
            }
            try {
              controller.enqueue(new TextEncoder().encode(formatSSE(heartbeat)))
              session.lastEventAt = new Date()
            } catch {
              clearInterval(heartbeatInterval)
            }
          } else {
            clearInterval(heartbeatInterval)
          }
        }, 30000) // 30 second heartbeat

        // Cleanup on close
        req.signal?.addEventListener('abort', () => {
          clearInterval(heartbeatInterval)
          activeSessions.delete(sessionId)
          try {
            controller.close()
          } catch {
            // Already closed
          }
        })
      },

      cancel() {
        activeSessions.delete(sessionId)
      },
    })

    return new Response(stream, {
      headers: {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream',
        'X-MCP-Session-Id': sessionId,
      },
    })
  }
}

/**
 * Send an event to a specific session
 */
export function sendToSession(sessionId: string, event: Omit<StreamEvent, 'timestamp'>): boolean {
  const session = activeSessions.get(sessionId)
  if (!session || !session.controller) {
    return false
  }

  const fullEvent: StreamEvent = {
    ...event,
    timestamp: new Date(),
  }

  try {
    session.controller.enqueue(new TextEncoder().encode(formatSSE(fullEvent)))
    session.lastEventAt = new Date()
    return true
  } catch {
    // Session may be closed
    activeSessions.delete(sessionId)
    return false
  }
}

/**
 * Send an event to all sessions for a user
 */
export function sendToUser(userId: string, event: Omit<StreamEvent, 'timestamp'>): number {
  let sent = 0
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.userId === userId) {
      if (sendToSession(sessionId, event)) {
        sent++
      }
    }
  }
  return sent
}

/**
 * Send an event to all sessions for an API key
 */
export function sendToApiKey(apiKeyId: string, event: Omit<StreamEvent, 'timestamp'>): number {
  let sent = 0
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.apiKeyId === apiKeyId) {
      if (sendToSession(sessionId, event)) {
        sent++
      }
    }
  }
  return sent
}

/**
 * Close a specific session
 */
export function closeSession(sessionId: string): boolean {
  const session = activeSessions.get(sessionId)
  if (!session) {
    return false
  }

  try {
    session.controller?.close()
  } catch {
    // Already closed
  }

  activeSessions.delete(sessionId)
  return true
}

/**
 * Get active sessions count
 */
export function getActiveSessionCount(): number {
  return activeSessions.size
}

/**
 * Get active sessions for a user
 */
export function getUserSessions(userId: string): StreamSession[] {
  const sessions: StreamSession[] = []
  for (const session of activeSessions.values()) {
    if (session.userId === userId) {
      sessions.push({ ...session, controller: null })
    }
  }
  return sessions
}

/**
 * Cleanup stale sessions (no activity for timeout period)
 */
export function cleanupStaleSessions(timeoutMs: number = 5 * 60 * 1000): number {
  const now = Date.now()
  let cleaned = 0

  for (const [sessionId, session] of activeSessions.entries()) {
    if (now - session.lastEventAt.getTime() > timeoutMs) {
      closeSession(sessionId)
      cleaned++
    }
  }

  return cleaned
}

/**
 * Stream manager for use in tool handlers
 */
export const streamManager = {
  cleanupStaleSessions,
  closeSession,
  getActiveSessionCount,
  getUserSessions,
  sendToApiKey,
  sendToSession,
  sendToUser,

  /**
   * Send progress update
   */
  sendProgress(
    sessionId: string,
    message: string,
    progress?: { current: number; total: number },
  ): boolean {
    return sendToSession(sessionId, {
      type: 'progress',
      data: { message, progress },
    })
  },

  /**
   * Send result
   */
  sendResult(sessionId: string, result: unknown): boolean {
    return sendToSession(sessionId, {
      type: 'result',
      data: result,
    })
  },

  /**
   * Send error
   */
  sendError(sessionId: string, error: string, code?: string): boolean {
    return sendToSession(sessionId, {
      type: 'error',
      data: { code, error },
    })
  },

  /**
   * Send confirmation request
   */
  sendConfirmationRequest(
    sessionId: string,
    confirmationId: string,
    message: string,
    operation: string,
  ): boolean {
    return sendToSession(sessionId, {
      id: confirmationId,
      type: 'confirmation',
      data: { confirmationId, message, operation },
    })
  },

  /**
   * Send undo available notification
   */
  sendUndoAvailable(
    sessionId: string,
    undoId: string,
    operation: string,
    expiresAt: Date,
  ): boolean {
    return sendToSession(sessionId, {
      id: undoId,
      type: 'undo',
      data: { expiresAt: expiresAt.toISOString(), operation, undoId },
    })
  },
}

export type StreamManager = typeof streamManager
