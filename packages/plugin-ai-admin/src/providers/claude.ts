import Anthropic from '@anthropic-ai/sdk'

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
 * Anthropic Claude Provider
 */
export class ClaudeProvider extends BaseAIProvider {
  private client: Anthropic | null = null

  async complete(options: AICompletionOptions): Promise<AICompletionResponse> {
    if (!this.client) {
      throw new Error('Claude provider not initialized')
    }

    const systemPrompt = options.systemPrompt ||
      options.messages.find((m) => m.role === 'system')?.content

    const response = await this.client.messages.create({
      max_tokens: options.maxTokens || this.config.maxTokens || 4096,
      messages: this.formatMessages(options.messages),
      model: this.config.model || this.getDefaultModel(),
      system: systemPrompt,
      temperature: options.temperature ?? this.config.temperature,
      tools: options.tools ? this.formatTools(options.tools) : undefined,
    })

    // Extract content and tool calls
    let textContent = ''
    const toolCalls: AIToolCall[] = []

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        })
      }
    }

    return {
      content: textContent,
      stopReason:
        response.stop_reason === 'tool_use'
          ? 'tool_use'
          : response.stop_reason === 'max_tokens'
            ? 'max_tokens'
            : 'end_turn',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    }
  }

  formatMessages(messages: AIMessage[]): Anthropic.MessageParam[] {
    const formatted: Anthropic.MessageParam[] = []

    for (const msg of messages) {
      if (msg.role === 'system') {continue} // System handled separately

      if (msg.role === 'user') {
        const content: Anthropic.ContentBlockParam[] = []

        // Add text content
        if (msg.content) {
          content.push({ type: 'text', text: msg.content })
        }

        // Add tool results if present
        if (msg.toolResults) {
          for (const result of msg.toolResults) {
            content.push({
              type: 'tool_result',
              content: result.error || JSON.stringify(result.result),
              is_error: !!result.error,
              tool_use_id: result.toolCallId,
            })
          }
        }

        formatted.push({ content, role: 'user' })
      } else if (msg.role === 'assistant') {
        const content: Anthropic.ContentBlockParam[] = []

        // Add text content
        if (msg.content) {
          content.push({ type: 'text', text: msg.content })
        }

        // Add tool calls if present
        if (msg.toolCalls) {
          for (const call of msg.toolCalls) {
            content.push({
              id: call.id,
              name: call.name,
              type: 'tool_use',
              input: call.arguments,
            })
          }
        }

        formatted.push({ content, role: 'assistant' })
      }
    }

    return formatted
  }

  formatTools(tools: AITool[]): Anthropic.Tool[] {
    return tools.map((tool) => {
      const def = toolToStandardDefinition(tool)
      return {
        name: def.name,
        description: def.description,
        input_schema: def.inputSchema as Anthropic.Tool['input_schema'],
      }
    })
  }

  initialize(): Promise<void> {
    if (this.initialized) {
      return Promise.resolve()
    }

    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    })

    this.initialized = true
    return Promise.resolve()
  }

  async *stream(
    options: AICompletionOptions
  ): AsyncGenerator<AIStreamEvent, void, unknown> {
    if (!this.client) {
      throw new Error('Claude provider not initialized')
    }

    const systemPrompt = options.systemPrompt ||
      options.messages.find((m) => m.role === 'system')?.content

    const stream = this.client.messages.stream({
      max_tokens: options.maxTokens || this.config.maxTokens || 4096,
      messages: this.formatMessages(options.messages),
      model: this.config.model || this.getDefaultModel(),
      system: systemPrompt,
      temperature: options.temperature ?? this.config.temperature,
      tools: options.tools ? this.formatTools(options.tools) : undefined,
    })

    let currentToolCall: null | Partial<AIToolCall> = null

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          currentToolCall = {
            id: event.content_block.id,
            name: event.content_block.name,
            arguments: {},
          }
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text_delta', content: event.delta.text }
        } else if (event.delta.type === 'input_json_delta' && currentToolCall) {
          // Accumulate JSON for tool input
          // Note: In practice you'd parse this incrementally
        }
      } else if (event.type === 'content_block_stop') {
        if (currentToolCall && currentToolCall.id && currentToolCall.name) {
          yield {
            type: 'tool_use',
            toolCall: currentToolCall as AIToolCall,
          }
          currentToolCall = null
        }
      } else if (event.type === 'message_stop') {
        yield { type: 'complete' }
      }
    }
  }

  get name(): string {
    return 'claude'
  }

  get supportedModels(): string[] {
    return [
      'claude-opus-4-20250514',
      'claude-sonnet-4-20250514',
      'claude-3-5-haiku-20241022',
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
    ]
  }
}
