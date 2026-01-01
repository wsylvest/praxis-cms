import OpenAI from 'openai'

import type {
  AICompletionOptions,
  AICompletionResponse,
  AIMessage,
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
  private client: null | OpenAI = null

  async complete(options: AICompletionOptions): Promise<AICompletionResponse> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized')
    }

    const messages = this.formatMessages(options.messages)

    // Add system prompt if provided and not already in messages
    if (options.systemPrompt && messages[0]?.role !== 'system') {
      messages.unshift({ content: options.systemPrompt, role: 'system' })
    }

    const response = await this.client.chat.completions.create({
      max_tokens: options.maxTokens || this.config.maxTokens || 4096,
      messages,
      model: this.config.model || this.getDefaultModel(),
      temperature: options.temperature ?? this.config.temperature,
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
      stopReason:
        choice.finish_reason === 'tool_calls'
          ? 'tool_use'
          : choice.finish_reason === 'length'
            ? 'max_tokens'
            : 'end_turn',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
          }
        : undefined,
    }
  }

  formatMessages(messages: AIMessage[]): OpenAI.ChatCompletionMessageParam[] {
    const formatted: OpenAI.ChatCompletionMessageParam[] = []

    for (const msg of messages) {
      if (msg.role === 'system') {
        formatted.push({ content: msg.content, role: 'system' })
      } else if (msg.role === 'user') {
        // Handle tool results
        if (msg.toolResults && msg.toolResults.length > 0) {
          for (const result of msg.toolResults) {
            formatted.push({
              content: result.error || JSON.stringify(result.result),
              role: 'tool',
              tool_call_id: result.toolCallId,
            })
          }
        } else {
          formatted.push({ content: msg.content, role: 'user' })
        }
      } else if (msg.role === 'assistant') {
        const assistantMsg: OpenAI.ChatCompletionAssistantMessageParam = {
          content: msg.content || null,
          role: 'assistant',
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

  initialize(): Promise<void> {
    if (this.initialized) {
      return Promise.resolve()
    }

    const baseURL = this.config.baseURL ||
      (this.config.provider === 'grok' ? 'https://api.x.ai/v1' : undefined)

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL,
    })

    this.initialized = true
    return Promise.resolve()
  }

  async *stream(
    options: AICompletionOptions
  ): AsyncGenerator<AIStreamEvent, void, unknown> {
    if (!this.client) {
      throw new Error('OpenAI provider not initialized')
    }

    const messages = this.formatMessages(options.messages)

    if (options.systemPrompt && messages[0]?.role !== 'system') {
      messages.unshift({ content: options.systemPrompt, role: 'system' })
    }

    const stream = await this.client.chat.completions.create({
      max_tokens: options.maxTokens || this.config.maxTokens || 4096,
      messages,
      model: this.config.model || this.getDefaultModel(),
      stream: true,
      temperature: options.temperature ?? this.config.temperature,
      tools: options.tools ? this.formatTools(options.tools) : undefined,
    })

    const toolCallAccumulators: Map<number, {
      arguments: string
      id: string
      name: string
    }> = new Map()

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta

      if (!delta) {continue}

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

          if (toolCall.id) {acc.id = toolCall.id}
          if (toolCall.function?.name) {acc.name = toolCall.function.name}
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
}
