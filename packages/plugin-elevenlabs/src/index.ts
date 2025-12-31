/**
 * ElevenLabs Plugin for Payload CMS
 *
 * Provides voice capabilities including:
 * - Text-to-speech via ElevenLabs API
 * - Speech-to-text via Web Speech API (client-side)
 * - REST endpoints for TTS generation
 * - Streaming audio support
 */

import type { Config, Endpoint, PayloadRequest } from 'payload'

import {
  createElevenLabsClient,
  ElevenLabsClient,
} from './elevenlabs.js'

// Re-export client classes and utilities
export {
  createElevenLabsClient,
  ElevenLabsClient,
  VoiceModels,
  VoicePresets,
} from './elevenlabs.js'

export type {
  ElevenLabsConfig,
  StreamingOptions,
  TextToSpeechOptions,
  Voice,
  VoiceSettings,
} from './elevenlabs.js'

/**
 * Plugin configuration
 */
export interface ElevenLabsPluginConfig {
  /**
   * ElevenLabs API key
   */
  apiKey: string

  /**
   * Default voice ID to use
   */
  defaultVoiceId?: string

  /**
   * Default model ID
   */
  modelId?: string

  /**
   * Voice stability (0-1)
   */
  stability?: number

  /**
   * Voice similarity boost (0-1)
   */
  similarityBoost?: number

  /**
   * Enable REST endpoints
   * @default true
   */
  enableEndpoints?: boolean

  /**
   * Base path for endpoints
   * @default '/api/voice'
   */
  basePath?: string

  /**
   * Require authentication for endpoints
   * @default true
   */
  requireAuth?: boolean
}

// Singleton client instance
let clientInstance: ElevenLabsClient | null = null

/**
 * Get the ElevenLabs client instance
 */
export function getElevenLabsClient(): ElevenLabsClient | null {
  return clientInstance
}

/**
 * Create voice endpoints
 */
function createVoiceEndpoints(
  client: ElevenLabsClient,
  config: ElevenLabsPluginConfig
): Endpoint[] {
  const basePath = config.basePath || '/api/voice'
  const requireAuth = config.requireAuth !== false

  return [
    /**
     * GET /api/voice/voices
     * List available voices
     */
    {
      path: `${basePath}/voices`,
      method: 'get',
      handler: async (req: PayloadRequest) => {
        if (requireAuth && !req.user) {
          return Response.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        }

        try {
          const voices = await client.getVoices()
          return Response.json({ voices })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Failed to get voices' },
            { status: 500 }
          )
        }
      },
    },

    /**
     * GET /api/voice/voices/:voiceId
     * Get a specific voice
     */
    {
      path: `${basePath}/voices/:voiceId`,
      method: 'get',
      handler: async (req: PayloadRequest) => {
        if (requireAuth && !req.user) {
          return Response.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        }

        const voiceId = req.routeParams?.voiceId as string

        try {
          const voice = await client.getVoice(voiceId)
          return Response.json({ voice })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Failed to get voice' },
            { status: 500 }
          )
        }
      },
    },

    /**
     * POST /api/voice/tts
     * Generate speech from text
     */
    {
      path: `${basePath}/tts`,
      method: 'post',
      handler: async (req: PayloadRequest) => {
        if (requireAuth && !req.user) {
          return Response.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        }

        try {
          const body = (await req.json?.()) as Record<string, any> | undefined
          const text = body?.text as string | undefined
          const voiceId = body?.voiceId as string | undefined
          const modelId = body?.modelId as string | undefined
          const voiceSettings = body?.voiceSettings
          const outputFormat = body?.outputFormat

          if (!text) {
            return Response.json(
              { error: 'Text is required' },
              { status: 400 }
            )
          }

          const audioBuffer = await client.textToSpeech({
            text,
            voiceId,
            modelId,
            voiceSettings,
            outputFormat,
          })

          return new Response(audioBuffer, {
            headers: {
              'Content-Type': outputFormat?.startsWith('pcm_') ? 'audio/pcm' : 'audio/mpeg',
              'Content-Length': audioBuffer.byteLength.toString(),
            },
          })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Text to speech failed' },
            { status: 500 }
          )
        }
      },
    },

    /**
     * POST /api/voice/tts/stream
     * Stream speech from text
     */
    {
      path: `${basePath}/tts/stream`,
      method: 'post',
      handler: async (req: PayloadRequest) => {
        if (requireAuth && !req.user) {
          return Response.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        }

        try {
          const body = (await req.json?.()) as Record<string, any> | undefined
          const text = body?.text as string | undefined
          const voiceId = body?.voiceId as string | undefined
          const modelId = body?.modelId as string | undefined
          const voiceSettings = body?.voiceSettings
          const outputFormat = body?.outputFormat

          if (!text) {
            return Response.json(
              { error: 'Text is required' },
              { status: 400 }
            )
          }

          const stream = new ReadableStream({
            async start(controller) {
              try {
                for await (const chunk of client.textToSpeechStream({
                  text,
                  voiceId,
                  modelId,
                  voiceSettings,
                  outputFormat,
                })) {
                  controller.enqueue(chunk)
                }
                controller.close()
              } catch (error) {
                controller.error(error)
              }
            },
          })

          return new Response(stream, {
            headers: {
              'Content-Type': outputFormat?.startsWith('pcm_') ? 'audio/pcm' : 'audio/mpeg',
              'Transfer-Encoding': 'chunked',
            },
          })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Text to speech stream failed' },
            { status: 500 }
          )
        }
      },
    },

    /**
     * GET /api/voice/subscription
     * Get subscription info and remaining characters
     */
    {
      path: `${basePath}/subscription`,
      method: 'get',
      handler: async (req: PayloadRequest) => {
        if (requireAuth && !req.user) {
          return Response.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        }

        try {
          const subscription = await client.getSubscription()
          const remaining = subscription.character_limit - subscription.character_count

          return Response.json({
            ...subscription,
            remaining_characters: remaining,
          })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Failed to get subscription' },
            { status: 500 }
          )
        }
      },
    },
  ]
}

/**
 * ElevenLabs Plugin for Payload CMS
 *
 * @example
 * ```ts
 * import { buildConfig } from 'payload'
 * import { elevenLabsPlugin } from '@payloadcms/plugin-elevenlabs'
 *
 * export default buildConfig({
 *   plugins: [
 *     elevenLabsPlugin({
 *       apiKey: process.env.ELEVENLABS_API_KEY!,
 *       defaultVoiceId: 'EXAVITQu4vr4xnSDxMaL',
 *     }),
 *   ],
 * })
 * ```
 */
export const elevenLabsPlugin =
  (pluginConfig: ElevenLabsPluginConfig) =>
  (config: Config): Config => {
    // Initialize endpoints array if not present
    if (!config.endpoints) {
      config.endpoints = []
    }

    // Create client on init
    const existingOnInit = config.onInit
    config.onInit = async (payload) => {
      if (existingOnInit) {
        await existingOnInit(payload)
      }

      // Initialize ElevenLabs client
      clientInstance = createElevenLabsClient({
        apiKey: pluginConfig.apiKey,
        defaultVoiceId: pluginConfig.defaultVoiceId,
        modelId: pluginConfig.modelId,
        stability: pluginConfig.stability,
        similarityBoost: pluginConfig.similarityBoost,
      })

      payload.logger.info('[elevenlabs] Plugin initialized')
    }

    // Add endpoints if enabled
    if (pluginConfig.enableEndpoints !== false) {
      // Create a temporary client for endpoint creation
      // The actual client will be initialized in onInit
      const tempClient = createElevenLabsClient({
        apiKey: pluginConfig.apiKey,
        defaultVoiceId: pluginConfig.defaultVoiceId,
        modelId: pluginConfig.modelId,
        stability: pluginConfig.stability,
        similarityBoost: pluginConfig.similarityBoost,
      })

      const endpoints = createVoiceEndpoints(tempClient, pluginConfig)
      config.endpoints.push(...endpoints)
    }

    return config
  }

// Default export
export default elevenLabsPlugin
