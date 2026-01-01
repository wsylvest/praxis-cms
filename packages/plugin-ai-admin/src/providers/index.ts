import type {
  AICompletionOptions,
  AICompletionResponse,
  AIProvider,
  AIProviderConfig,
  AIStreamEvent,
  AITool,
} from '../types/index.js'
import type { BaseAIProvider } from './base.js'

import { ClaudeProvider } from './claude.js'
import { GeminiProvider } from './gemini.js'
import { OpenAIProvider } from './openai.js'

export { BaseAIProvider } from './base.js'
export { ClaudeProvider } from './claude.js'
export { GeminiProvider } from './gemini.js'
export { OpenAIProvider } from './openai.js'

/**
 * Provider Manager - Unified interface for multiple AI providers
 *
 * Supports:
 * - Claude (Anthropic)
 * - GPT-4/ChatGPT (OpenAI)
 * - Grok (xAI - uses OpenAI-compatible API)
 * - Gemini (Google)
 * - Ollama (local models via OpenAI-compatible API)
 */
export class ProviderManager {
  private defaultProvider: AIProvider
  private initialized: boolean = false
  private providers: Map<AIProvider, BaseAIProvider> = new Map()

  constructor(
    configs: AIProviderConfig[],
    defaultProvider: AIProvider
  ) {
    this.defaultProvider = defaultProvider

    for (const config of configs) {
      const provider = this.createProvider(config)
      if (provider) {
        this.providers.set(config.provider, provider)
      }
    }
  }

  private createProvider(config: AIProviderConfig): BaseAIProvider | null {
    switch (config.provider) {
      case 'claude':
        return new ClaudeProvider(config)
      case 'gemini':
        return new GeminiProvider(config)
      case 'grok':
        return new OpenAIProvider({ ...config, provider: 'grok' })
      case 'ollama':
        return new OpenAIProvider({
          ...config,
          baseURL: config.baseURL || 'http://localhost:11434/v1',
        })
      case 'openai':
        return new OpenAIProvider(config)
      default:
        console.warn(`Unknown AI provider: ${config.provider}`)
        return null
    }
  }

  /**
   * Complete with the default or specified provider
   */
  async complete(
    options: AICompletionOptions,
    providerName?: AIProvider
  ): Promise<AICompletionResponse> {
    await this.initialize()
    const provider = this.getProvider(providerName)
    return provider.complete(options)
  }

  /**
   * Format tools for a specific provider
   */
  formatTools(tools: AITool[], providerName?: AIProvider): unknown {
    const provider = this.getProvider(providerName)
    return provider.formatTools(tools)
  }

  /**
   * Get the default provider
   */
  getDefault(): BaseAIProvider {
    return this.getProvider(this.defaultProvider)
  }

  /**
   * Get a specific provider
   */
  getProvider(name?: AIProvider): BaseAIProvider {
    const providerName = name || this.defaultProvider
    const provider = this.providers.get(providerName)

    if (!provider) {
      throw new Error(`AI provider "${providerName}" not configured`)
    }

    return provider
  }

  /**
   * Get supported models for a provider
   */
  getSupportedModels(providerName?: AIProvider): string[] {
    const provider = this.getProvider(providerName)
    return provider.supportedModels
  }

  /**
   * Initialize all configured providers
   */
  async initialize(): Promise<void> {
    if (this.initialized) {return}

    const initPromises: Promise<void>[] = []

    for (const [name, provider] of this.providers) {
      if (provider.isConfigured()) {
        initPromises.push(
          provider.initialize().catch((err) => {
            console.error(`Failed to initialize ${name} provider:`, err)
          })
        )
      }
    }

    await Promise.all(initPromises)
    this.initialized = true
  }

  /**
   * Check if a provider is configured and ready
   */
  isAvailable(name: AIProvider): boolean {
    const provider = this.providers.get(name)
    return !!provider && provider.isConfigured()
  }

  /**
   * List all configured providers
   */
  listProviders(): AIProvider[] {
    return Array.from(this.providers.keys())
  }

  /**
   * Stream with the default or specified provider
   */
  async *stream(
    options: AICompletionOptions,
    providerName?: AIProvider
  ): AsyncGenerator<AIStreamEvent, void, unknown> {
    await this.initialize()
    const provider = this.getProvider(providerName)
    yield* provider.stream(options)
  }

  /**
   * Validate all provider configurations
   */
  validate(): { errors: Record<string, string[]>; valid: boolean } {
    const errors: Record<string, string[]> = {}
    let valid = true

    for (const [name, provider] of this.providers) {
      const result = provider.validate()
      if (!result.valid) {
        errors[name] = result.errors
        valid = false
      }
    }

    // Check default provider exists
    if (!this.providers.has(this.defaultProvider)) {
      errors['_default'] = [`Default provider "${this.defaultProvider}" is not configured`]
      valid = false
    }

    return { errors, valid }
  }
}

/**
 * Create a provider manager from plugin config
 */
export function createProviderManager(
  configs: AIProviderConfig[],
  defaultProvider: AIProvider
): ProviderManager {
  return new ProviderManager(configs, defaultProvider)
}
