import OpenAI from 'openai'

import type {
  AICompletionOptions,
  AICompletionResponse,
  AIMessage,
  AIProviderConfig,
  AIStreamEvent,
  AITool,
  AIToolCall,
} from '../types/index.js'
import { BaseAIProvider, toolToStandardDefinition } from './base.js'

/**
 * OpenAI Provider (ChatGPT, GPT-4, etc.)
 * Also works for Grok (via xAI API) with baseURL override
 */
export class OpenAIProvider extends BaseAIProvider {
  private client: OpenAI | null = null

  get name(): string {
    return this.config.provider === 'grok' ? 'grok' : 'openai'
  }

  get supportedModels(): string[] {
    if (this.config.provider === 'grok') {
      return ['grok-2', 'grok-2-mini', 'grok-beta']
    }
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o1-preview',
      'o1-mini',
    ]
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    const baseURL = this.config.baseURL ||
      (this.config.provider === 'grok' ? 'https://api.x.ai/v1' : undefined)

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL,
    })

    this.initialized = true
  }

  formatTools(tools: AITool[]): OpenAI.ChatCompletionTool[] {
    return tools.map((tool) => {
      const def = toolToStandardDefinition(tool)
      return {
        type: 'function' as const,
        function: {
          name: def.name,
          description: def.description,
          parameters: def.inputSchema,
        },
      }
    })
  }

  formatMessages(messages: AIMessage[]): OpenAI.ChatCompletionMessageParam[] {
    const formatted: OpenAI.ChatCompletionMessageParam[] = []

    for (const msg of messages) {
      if (msg.role === 'system') {
        formatted.push({ role: 'system', content: msg.content })
      } else if (msg.role === 'user') {
        // Handle tool results
        if (msg.toolResults && msg.toolResults.length > 0) {
          for (const result of msg.toolResults) {
            formatted.push({
              role: 'tool',
              tool_call_id: result.toolCallId,
              content: result.error || JSON.stringify(result.result),
            })
          }
        } else {
          formatted.push({ role: 'user', content: msg.content })
        }
      } else if (msg.role === 'assistant') {
        const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
          role: 'assistant',
          content: msg.content || null,
        }

        if (msg.toolCalls && msg.toolCalls.length > 0) {
          assistantMsg.tool_calls = msg.toolCalls.map((call) => ({
            id: call.id,
            type: 'function' as const,
            function: {
              name: call.name,
              arguments: JSON.stringify(call.arguments),
            },
          }))
        }

        formatted.push(assistantMsg)
      }
    }

    return formatted
  }

  async complete(options: AICompletionOptions): Promise<AICompletionResponse> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized')
    }

    const messages = this.formatMessages(options.messages)

    // Add system prompt if provided and not already in messages
    if (options.systemPrompt && messages[0]?.role !== 'system') {
      messages.unshift({ role: 'system', content: options.systemPrompt })
    }

    const response = await this.client.chat.completions.create({
      model: this.config.model || this.getDefaultModel(),
      max_tokens: options.maxTokens || this.config.maxTokens || 4096,
      temperature: options.temperature ?? this.config.temperature,
      messages,
      tools: options.tools ? this.formatTools(options.tools) : undefined,
    })

    const choice = response.choices[0]
    const message = choice.message

    const toolCalls: AIToolCall[] = message.tool_calls?.map((call) => ({
      id: call.id,
      name: call.function.name,
      arguments: JSON.parse(call.function.arguments),
    })) || []

    return {
      content: message.content || '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
          }
        : undefined,
      stopReason:
        choice.finish_reason === 'tool_calls'
          ? 'tool_use'
          : choice.finish_reason === 'length'
            ? 'max_tokens'
            : 'end_turn',
    }
  }

  async *stream(
    options: AICompletionOptions
  ): AsyncGenerator<AIStreamEvent, void, unknown> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized')
    }

    const messages = this.formatMessages(options.messages)

    if (options.systemPrompt && messages[0]?.role !== 'system') {
      messages.unshift({ role: 'system', content: options.systemPrompt })
    }

    const stream = await this.client.chat.completions.create({
      model: this.config.model || this.getDefaultModel(),
      max_tokens: options.maxTokens || this.config.maxTokens || 4096,
      temperature: options.temperature ?? this.config.temperature,
      messages,
      tools: options.tools ? this.formatTools(options.tools) : undefined,
      stream: true,
    })

    const toolCallAccumulators: Map<number, {
      id: string
      name: string
      arguments: string
    }> = new Map()

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta

      if (!delta) continue

      // Handle text content
      if (delta.content) {
        yield { type: 'text_delta', content: delta.content }
      }

      // Handle tool calls
      if (delta.tool_calls) {
        for (const toolCall of delta.tool_calls) {
          const index = toolCall.index

          if (!toolCallAccumulators.has(index)) {
            toolCallAccumulators.set(index, {
              id: toolCall.id || '',
              name: toolCall.function?.name || '',
              arguments: '',
            })
          }

          const acc = toolCallAccumulators.get(index)!

          if (toolCall.id) acc.id = toolCall.id
          if (toolCall.function?.name) acc.name = toolCall.function.name
          if (toolCall.function?.arguments) {
            acc.arguments += toolCall.function.arguments
          }
        }
      }

      // Check for completion
      if (chunk.choices[0]?.finish_reason) {
        // Emit accumulated tool calls
        for (const [, acc] of toolCallAccumulators) {
          if (acc.id && acc.name) {
            yield {
              type: 'tool_use',
              toolCall: {
                id: acc.id,
                name: acc.name,
                arguments: acc.arguments ? JSON.parse(acc.arguments) : {},
              },
            }
          }
        }

        yield { type: 'complete' }
      }
    }
  }
}
