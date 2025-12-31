'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { AIMessage, AIStreamEvent, PendingConfirmation } from '../types/index.js'

interface AIChatPanelProps {
  position?: 'sidebar' | 'drawer' | 'modal'
  defaultOpen?: boolean
  onClose?: () => void
  baseURL?: string
}

interface Message extends AIMessage {
  id: string
  isStreaming?: boolean
  error?: string
}

/**
 * AI Chat Panel Component
 * Provides a chat interface for AI-powered CMS administration
 */
export const AIChatPanel: React.FC<AIChatPanelProps> = ({
  position = 'sidebar',
  defaultOpen = false,
  onClose,
  baseURL = '/api',
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
    }
  }, [isOpen])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    onClose?.()
  }, [onClose])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setError(null)

    // Create assistant message placeholder for streaming
    const assistantMessageId = `msg_${Date.now()}_assistant`
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    }
    setMessages((prev) => [...prev, assistantMessage])

    try {
      // Use streaming endpoint
      const response = await fetch(`${baseURL}/ai/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          message: userMessage.content,
          sessionId,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send message')
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No response body')
      }

      const decoder = new TextDecoder()
      let accumulatedContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event: AIStreamEvent = JSON.parse(line.slice(6))

              if (event.type === 'text_delta' && event.content) {
                accumulatedContent += event.content
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: accumulatedContent }
                      : m
                  )
                )
              } else if (event.type === 'tool_use' && event.toolCall) {
                // Show tool usage
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          content:
                            accumulatedContent +
                            `\n\n_Using tool: ${event.toolCall!.name}_`,
                          toolCalls: [...(m.toolCalls || []), event.toolCall!],
                        }
                      : m
                  )
                )
              } else if (event.type === 'tool_result' && event.toolResult) {
                // Show tool result
                if (event.toolResult.error) {
                  accumulatedContent += `\n\n_Tool error: ${event.toolResult.error}_`
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: accumulatedContent }
                      : m
                  )
                )
              } else if (event.type === 'complete') {
                // Mark as complete
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, isStreaming: false }
                      : m
                  )
                )
              } else if (event.type === 'error') {
                throw new Error(event.error || 'Stream error')
              }
            } catch (parseError) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)

      // Update assistant message with error
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, isStreaming: false, error: errorMessage }
            : m
        )
      )
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, sessionId, baseURL])

  const handleConfirmation = useCallback(
    async (action: 'approve' | 'deny') => {
      if (!pendingConfirmation) return

      try {
        const response = await fetch(`${baseURL}/ai/confirmation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            confirmationId: pendingConfirmation.id,
            action,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Confirmation failed')
        }

        setPendingConfirmation(null)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Confirmation error'
        setError(errorMessage)
      }
    },
    [pendingConfirmation, baseURL]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
      }
    },
    [sendMessage]
  )

  // Render based on position
  const panelContent = (
    <div className="ai-chat-panel">
      {/* Header */}
      <div className="ai-chat-header">
        <h3>AI Assistant</h3>
        <button onClick={handleClose} className="ai-chat-close">
          &times;
        </button>
      </div>

      {/* Messages */}
      <div className="ai-chat-messages">
        {messages.length === 0 && (
          <div className="ai-chat-empty">
            <p>How can I help you today?</p>
            <p className="ai-chat-suggestions">
              Try: "Create a new blog post about..."
              <br />
              Or: "Find all draft posts from this week"
            </p>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`ai-chat-message ai-chat-message-${message.role}`}
          >
            <div className="ai-chat-message-content">
              {message.content}
              {message.isStreaming && (
                <span className="ai-chat-typing">▊</span>
              )}
              {message.error && (
                <div className="ai-chat-error">{message.error}</div>
              )}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Confirmation Dialog */}
      {pendingConfirmation && (
        <div className="ai-chat-confirmation">
          <p>{pendingConfirmation.message}</p>
          <div className="ai-chat-confirmation-actions">
            <button
              onClick={() => handleConfirmation('approve')}
              className="ai-chat-btn-approve"
            >
              Approve
            </button>
            <button
              onClick={() => handleConfirmation('deny')}
              className="ai-chat-btn-deny"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="ai-chat-error-banner">
          {error}
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {/* Input */}
      <div className="ai-chat-input-container">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything..."
          disabled={isLoading}
          rows={1}
          className="ai-chat-input"
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
          className="ai-chat-send"
        >
          {isLoading ? '...' : 'Send'}
        </button>
      </div>
    </div>
  )

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="ai-chat-toggle"
        title="Open AI Assistant"
      >
        AI
      </button>
    )
  }

  if (position === 'modal') {
    return (
      <div className="ai-chat-modal-overlay" onClick={handleClose}>
        <div
          className="ai-chat-modal"
          onClick={(e) => e.stopPropagation()}
        >
          {panelContent}
        </div>
      </div>
    )
  }

  if (position === 'drawer') {
    return <div className="ai-chat-drawer">{panelContent}</div>
  }

  // Default: sidebar
  return <div className="ai-chat-sidebar">{panelContent}</div>
}

export default AIChatPanel
