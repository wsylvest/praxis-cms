import type {
  AICompletionOptions,
  AICompletionResponse,
  AIMessage,
  AIProviderConfig,
  AIStreamEvent,
  AITool,
} from '../types/index.js'

/**
 * Base AI Provider Interface
 * All AI providers must implement this interface for multi-model support
 */
export abstract class BaseAIProvider {
  protected config: AIProviderConfig
  protected initialized: boolean = false

  constructor(config: AIProviderConfig) {
    this.config = config
  }

  abstract get name(): string
  abstract get supportedModels(): string[]

  /**
   * Initialize the provider (validate API key, setup client)
   */
  abstract initialize(): Promise<void>

  /**
   * Generate a completion (non-streaming)
   */
  abstract complete(options: AICompletionOptions): Promise<AICompletionResponse>

  /**
   * Generate a streaming completion
   */
  abstract stream(
    options: AICompletionOptions
  ): AsyncGenerator<AIStreamEvent, void, unknown>

  /**
   * Convert tools to provider-specific format
   */
  abstract formatTools(tools: AITool[]): unknown

  /**
   * Convert messages to provider-specific format
   */
  abstract formatMessages(messages: AIMessage[]): unknown

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean {
    return !!this.config.apiKey || !!this.config.baseURL
  }

  /**
   * Get the default model for this provider
   */
  getDefaultModel(): string {
    return this.config.model || this.supportedModels[0]
  }

  /**
   * Validate the configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!this.config.apiKey && !this.config.baseURL) {
      errors.push(`${this.name}: API key or base URL is required`)
    }

    if (this.config.model && !this.supportedModels.includes(this.config.model)) {
      errors.push(
        `${this.name}: Unknown model "${this.config.model}". Supported: ${this.supportedModels.join(', ')}`
      )
    }

    return { valid: errors.length === 0, errors }
  }
}

/**
 * Standard interface for tool definitions across providers
 */
export interface StandardToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

/**
 * Convert Zod schema to JSON Schema for tool definitions
 */
export function zodToJsonSchema(schema: unknown): Record<string, unknown> {
  if (schema && typeof schema === 'object' && '_def' in schema) {
    const def = (schema as any)._def

    switch (def.typeName) {
      case 'ZodString':
        return { type: 'string', description: def.description }
      case 'ZodNumber':
        return { type: 'number', description: def.description }
      case 'ZodBoolean':
        return { type: 'boolean', description: def.description }
      case 'ZodArray':
        return {
          type: 'array',
          items: zodToJsonSchema(def.type),
          description: def.description,
        }
      case 'ZodObject': {
        const properties: Record<string, unknown> = {}
        const required: string[] = []

        for (const [key, value] of Object.entries(def.shape())) {
          properties[key] = zodToJsonSchema(value)
          if (!(value as any)._def.isOptional) {
            required.push(key)
          }
        }

        return {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined,
          description: def.description,
        }
      }
      case 'ZodEnum':
        return {
          type: 'string',
          enum: def.values,
          description: def.description,
        }
      case 'ZodOptional':
        return zodToJsonSchema(def.innerType)
      case 'ZodDefault':
        return {
          ...zodToJsonSchema(def.innerType),
          default: def.defaultValue(),
        }
      default:
        return { type: 'string' }
    }
  }

  return { type: 'string' }
}

/**
 * Convert AITool to StandardToolDefinition
 */
export function toolToStandardDefinition(tool: AITool): StandardToolDefinition {
  const schema = zodToJsonSchema(tool.parameters)

  return {
    name: tool.name,
    description: tool.description,
    inputSchema: schema as StandardToolDefinition['inputSchema'],
  }
}
