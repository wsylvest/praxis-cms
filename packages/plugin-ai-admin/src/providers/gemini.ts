import type {
  AICompletionOptions,
  AICompletionResponse,
  AIMessage,
  AIStreamEvent,
  AITool,
  AIToolCall,
} from '../types/index.js'

import { BaseAIProvider, toolToStandardDefinition } from './base.js'

interface GeminiContent {
  parts: GeminiPart[]
  role: 'model' | 'user'
}

interface GeminiPart {
  functionCall?: {
    args: Record<string, unknown>
    name: string
  }
  functionResponse?: {
    name: string
    response: Record<string, unknown>
  }
  text?: string
}

interface GeminiFunctionDeclaration {
  description: string
  name: string
  parameters: Record<string, unknown>
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: GeminiPart[]
      role: string
    }
    finishReason: string
  }>
  usageMetadata?: {
    candidatesTokenCount: number
    promptTokenCount: number
  }
}

/**
 * Google Gemini Provider
 */
export class GeminiProvider extends BaseAIProvider {
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta'

  private async makeRequest(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<Response> {
    const model = this.config.model || this.getDefaultModel()
    const url = `${this.config.baseURL || this.baseUrl}/models/${model}:${endpoint}?key=${this.config.apiKey}`

    return fetch(url, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    })
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResponse> {
    const contents = this.formatMessages(options.messages)
    const systemInstruction = options.systemPrompt ||
      options.messages.find((m) => m.role === 'system')?.content

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: options.maxTokens || this.config.maxTokens || 4096,
        temperature: options.temperature ?? this.config.temperature,
      },
    }

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] }
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = [this.formatTools(options.tools)]
    }

    const response = await this.makeRequest('generateContent', body)

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gemini API error: ${error}`)
    }

    const data = (await response.json()) as GeminiResponse

    const candidate = data.candidates[0]
    let textContent = ''
    const toolCalls: AIToolCall[] = []

    for (const part of candidate.content.parts) {
      if (part.text) {
        textContent += part.text
      } else if (part.functionCall) {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args,
        })
      }
    }

    return {
      content: textContent,
      stopReason:
        candidate.finishReason === 'TOOL_CODE'
          ? 'tool_use'
          : candidate.finishReason === 'MAX_TOKENS'
            ? 'max_tokens'
            : 'end_turn',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: data.usageMetadata
        ? {
            inputTokens: data.usageMetadata.promptTokenCount,
            outputTokens: data.usageMetadata.candidatesTokenCount,
          }
        : undefined,
    }
  }

  formatMessages(messages: AIMessage[]): GeminiContent[] {
    const formatted: GeminiContent[] = []
    for (const msg of messages) {
      if (msg.role === 'system') {
        // System messages are handled separately via systemInstruction in the API call
        continue
      }

      const parts: GeminiPart[] = []

      if (msg.role === 'user') {
        if (msg.content) {
          parts.push({ text: msg.content })
        }

        // Add function responses
        if (msg.toolResults) {
          for (const result of msg.toolResults) {
            parts.push({
              functionResponse: {
                name: result.toolCallId, // Gemini uses function name, not ID
                response: { error: result.error, result: result.result },
              },
            })
          }
        }

        if (parts.length > 0) {
          formatted.push({ parts, role: 'user' })
        }
      } else if (msg.role === 'assistant') {
        if (msg.content) {
          parts.push({ text: msg.content })
        }

        if (msg.toolCalls) {
          for (const call of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: call.name,
                args: call.arguments,
              },
            })
          }
        }

        if (parts.length > 0) {
          formatted.push({ parts, role: 'model' })
        }
      }
    }

    return formatted
  }

  formatTools(tools: AITool[]): { functionDeclarations: GeminiFunctionDeclaration[] } {
    return {
      functionDeclarations: tools.map((tool) => {
        const def = toolToStandardDefinition(tool)
        return {
          name: def.name,
          description: def.description,
          parameters: def.inputSchema,
        }
      }),
    }
  }

  initialize(): Promise<void> {
    if (this.initialized) {
      return Promise.resolve()
    }

    if (!this.config.apiKey) {
      return Promise.reject(new Error('Gemini API key is required'))
    }

    this.initialized = true
    return Promise.resolve()
  }

  async *stream(
    options: AICompletionOptions
  ): AsyncGenerator<AIStreamEvent, void, unknown> {
    const contents = this.formatMessages(options.messages)
    const systemInstruction = options.systemPrompt ||
      options.messages.find((m) => m.role === 'system')?.content

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: options.maxTokens || this.config.maxTokens || 4096,
        temperature: options.temperature ?? this.config.temperature,
      },
    }

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] }
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = [this.formatTools(options.tools)]
    }

    const response = await this.makeRequest('streamGenerateContent', body)

    if (!response.ok) {
      const error = await response.text()
      yield { type: 'error', error: `Gemini API error: ${error}` }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      yield { type: 'error', error: 'No response body' }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {break}

        buffer += decoder.decode(value, { stream: true })

        // Parse JSON chunks (Gemini streams JSON objects)
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim() || line.trim() === '[' || line.trim() === ']' || line.trim() === ',') {
            continue
          }

          try {
            const cleanLine = line.trim().replace(/^,/, '')
            const chunk = JSON.parse(cleanLine) as GeminiResponse

            if (chunk.candidates?.[0]?.content?.parts) {
              for (const part of chunk.candidates[0].content.parts) {
                if (part.text) {
                  yield { type: 'text_delta', content: part.text }
                } else if (part.functionCall) {
                  yield {
                    type: 'tool_use',
                    toolCall: {
                      id: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                      name: part.functionCall.name,
                      arguments: part.functionCall.args,
                    },
                  }
                }
              }
            }
          } catch {
            // Skip invalid JSON chunks
          }
        }
      }

      yield { type: 'complete' }
    } finally {
      reader.releaseLock()
    }
  }

  get name(): string {
    return 'gemini'
  }

  get supportedModels(): string[] {
    return [
      'gemini-2.0-flash-exp',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      'gemini-pro',
    ]
  }
}
