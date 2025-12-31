import type { PayloadHandler } from 'payload'

import type { AIController } from '../controller/AIController.js'
import { getRateLimitHeaders } from '../middleware/rateLimiter.js'

/**
 * Create chat endpoint handler
 */
export function createChatEndpoint(controller: AIController): PayloadHandler {
  return async (req) => {
    try {
      // Parse request body
      const body = await req.json?.() || {}
      const { message, sessionId, conversationId, provider } = body

      if (!message || typeof message !== 'string') {
        return Response.json(
          { error: 'Message is required' },
          { status: 400 }
        )
      }

      // Process chat
      const response = await controller.chat(req, message, {
        sessionId,
        conversationId,
        provider,
      })

      return Response.json({
        content: response.content,
        toolCalls: response.toolCalls,
        usage: response.usage,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal error'

      // Handle rate limiting
      if (message === 'Rate limit exceeded') {
        return Response.json(
          { error: message },
          { status: 429 }
        )
      }

      // Handle auth errors
      if (message === 'Authentication required' || message === 'Access denied') {
        return Response.json(
          { error: message },
          { status: 401 }
        )
      }

      console.error('Chat error:', error)
      return Response.json(
        { error: message },
        { status: 500 }
      )
    }
  }
}

/**
 * Create streaming chat endpoint handler
 */
export function createStreamingChatEndpoint(controller: AIController): PayloadHandler {
  return async (req) => {
    try {
      // Parse request body
      const body = await req.json?.() || {}
      const { message, sessionId, conversationId, provider } = body

      if (!message || typeof message !== 'string') {
        return Response.json(
          { error: 'Message is required' },
          { status: 400 }
        )
      }

      // Create readable stream
      const stream = new ReadableStream({
        async start(streamController) {
          const encoder = new TextEncoder()

          try {
            const generator = controller.streamChat(req, message, {
              sessionId,
              conversationId,
              provider,
            })

            for await (const event of generator) {
              const data = JSON.stringify(event)
              streamController.enqueue(encoder.encode(`data: ${data}\n\n`))

              // Send heartbeat comment
              if (event.type === 'complete') {
                streamController.close()
                return
              }
            }

            streamController.close()
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Stream error'
            const errorEvent = JSON.stringify({ type: 'error', error: errorMessage })
            streamController.enqueue(encoder.encode(`data: ${errorEvent}\n\n`))
            streamController.close()
          }
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal error'
      console.error('Stream error:', error)
      return Response.json(
        { error: message },
        { status: 500 }
      )
    }
  }
}

/**
 * Create confirmation endpoint handler
 */
export function createConfirmationEndpoint(controller: AIController): PayloadHandler {
  return async (req) => {
    try {
      const body = await req.json?.() || {}
      const { confirmationId, action } = body

      if (!confirmationId || !action) {
        return Response.json(
          { error: 'confirmationId and action are required' },
          { status: 400 }
        )
      }

      let success: boolean

      if (action === 'approve') {
        success = controller.approveConfirmation(confirmationId)
      } else if (action === 'deny') {
        success = controller.denyConfirmation(confirmationId)
      } else {
        return Response.json(
          { error: 'Invalid action. Use "approve" or "deny"' },
          { status: 400 }
        )
      }

      if (!success) {
        return Response.json(
          { error: 'Confirmation not found or already processed' },
          { status: 404 }
        )
      }

      return Response.json({ success: true, action })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal error'
      console.error('Confirmation error:', error)
      return Response.json(
        { error: message },
        { status: 500 }
      )
    }
  }
}

/**
 * Create session endpoint handler
 */
export function createSessionEndpoint(controller: AIController): PayloadHandler {
  return async (req) => {
    try {
      const url = new URL(req.url || '', 'http://localhost')
      const sessionId = url.searchParams.get('sessionId')

      if (req.method === 'GET') {
        // Get session
        if (!sessionId) {
          return Response.json(
            { error: 'sessionId is required' },
            { status: 400 }
          )
        }

        const session = controller.getSession(sessionId)
        if (!session) {
          return Response.json(
            { error: 'Session not found' },
            { status: 404 }
          )
        }

        // Get pending confirmations
        const pendingConfirmations = controller.getPendingConfirmations(sessionId)

        return Response.json({
          session,
          pendingConfirmations,
        })
      }

      if (req.method === 'PATCH') {
        // Update session
        if (!sessionId) {
          return Response.json(
            { error: 'sessionId is required' },
            { status: 400 }
          )
        }

        const body = await req.json?.() || {}
        const { currentCollection, selectedDocuments, metadata } = body

        const updated = controller.updateSession(sessionId, {
          currentCollection,
          selectedDocuments,
          metadata,
        })

        if (!updated) {
          return Response.json(
            { error: 'Session not found' },
            { status: 404 }
          )
        }

        return Response.json({ session: updated })
      }

      return Response.json(
        { error: 'Method not allowed' },
        { status: 405 }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal error'
      console.error('Session error:', error)
      return Response.json(
        { error: message },
        { status: 500 }
      )
    }
  }
}
