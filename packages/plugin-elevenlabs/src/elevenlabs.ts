/**
 * ElevenLabs Voice Integration
 *
 * Provides text-to-speech and speech-to-text capabilities.
 */

export interface ElevenLabsConfig {
  apiKey: string
  defaultVoiceId?: string
  modelId?: string
  stability?: number
  similarityBoost?: number
  style?: number
  useSpeakerBoost?: boolean
}

export interface Voice {
  voice_id: string
  name: string
  category: string
  labels: Record<string, string>
  preview_url: string
}

export interface VoiceSettings {
  stability: number
  similarity_boost: number
  style?: number
  use_speaker_boost?: boolean
}

export interface TextToSpeechOptions {
  text: string
  voiceId?: string
  modelId?: string
  voiceSettings?: Partial<VoiceSettings>
  outputFormat?: 'mp3_44100_128' | 'mp3_44100_64' | 'pcm_16000' | 'pcm_22050' | 'pcm_24000' | 'pcm_44100'
}

export interface StreamingOptions extends TextToSpeechOptions {
  onChunk?: (chunk: Uint8Array) => void
}

/**
 * ElevenLabs Client
 */
export class ElevenLabsClient {
  private apiKey: string
  private baseUrl = 'https://api.elevenlabs.io/v1'
  private config: ElevenLabsConfig

  constructor(config: ElevenLabsConfig) {
    if (!config.apiKey) {
      throw new Error('ElevenLabs API key is required')
    }
    this.apiKey = config.apiKey
    this.config = {
      defaultVoiceId: config.defaultVoiceId || 'EXAVITQu4vr4xnSDxMaL', // Sarah
      modelId: config.modelId || 'eleven_multilingual_v2',
      stability: config.stability ?? 0.5,
      similarityBoost: config.similarityBoost ?? 0.75,
      style: config.style ?? 0,
      useSpeakerBoost: config.useSpeakerBoost ?? true,
      ...config,
    }
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<Voice[]> {
    const response = await fetch(`${this.baseUrl}/voices`, {
      headers: {
        'xi-api-key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get voices: ${response.statusText}`)
    }

    const data = await response.json() as { voices: Voice[] }
    return data.voices
  }

  /**
   * Get a specific voice
   */
  async getVoice(voiceId: string): Promise<Voice> {
    const response = await fetch(`${this.baseUrl}/voices/${voiceId}`, {
      headers: {
        'xi-api-key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get voice: ${response.statusText}`)
    }

    return response.json() as Promise<Voice>
  }

  /**
   * Text to speech - returns audio buffer
   */
  async textToSpeech(options: TextToSpeechOptions): Promise<ArrayBuffer> {
    const voiceId = options.voiceId || this.config.defaultVoiceId
    const modelId = options.modelId || this.config.modelId

    const voiceSettings: VoiceSettings = {
      stability: options.voiceSettings?.stability ?? this.config.stability ?? 0.5,
      similarity_boost: options.voiceSettings?.similarity_boost ?? this.config.similarityBoost ?? 0.75,
      style: options.voiceSettings?.style ?? this.config.style,
      use_speaker_boost: options.voiceSettings?.use_speaker_boost ?? this.config.useSpeakerBoost,
    }

    const response = await fetch(
      `${this.baseUrl}/text-to-speech/${voiceId}?output_format=${options.outputFormat || 'mp3_44100_128'}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: options.text,
          model_id: modelId,
          voice_settings: voiceSettings,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Text to speech failed: ${error}`)
    }

    return response.arrayBuffer()
  }

  /**
   * Text to speech with streaming
   */
  async *textToSpeechStream(
    options: TextToSpeechOptions
  ): AsyncGenerator<Uint8Array, void, unknown> {
    const voiceId = options.voiceId || this.config.defaultVoiceId
    const modelId = options.modelId || this.config.modelId

    const voiceSettings: VoiceSettings = {
      stability: options.voiceSettings?.stability ?? this.config.stability ?? 0.5,
      similarity_boost: options.voiceSettings?.similarity_boost ?? this.config.similarityBoost ?? 0.75,
      style: options.voiceSettings?.style ?? this.config.style,
      use_speaker_boost: options.voiceSettings?.use_speaker_boost ?? this.config.useSpeakerBoost,
    }

    const response = await fetch(
      `${this.baseUrl}/text-to-speech/${voiceId}/stream?output_format=${options.outputFormat || 'mp3_44100_128'}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: options.text,
          model_id: modelId,
          voice_settings: voiceSettings,
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Text to speech stream failed: ${error}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        yield value
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Get user subscription info
   */
  async getSubscription(): Promise<{
    tier: string
    character_count: number
    character_limit: number
    next_character_count_reset_unix: number
  }> {
    const response = await fetch(`${this.baseUrl}/user/subscription`, {
      headers: {
        'xi-api-key': this.apiKey,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to get subscription: ${response.statusText}`)
    }

    return response.json() as Promise<{
      tier: string
      character_count: number
      character_limit: number
      next_character_count_reset_unix: number
    }>
  }

  /**
   * Get remaining characters
   */
  async getRemainingCharacters(): Promise<number> {
    const subscription = await this.getSubscription()
    return subscription.character_limit - subscription.character_count
  }
}

/**
 * Create ElevenLabs client
 */
export function createElevenLabsClient(config: ElevenLabsConfig): ElevenLabsClient {
  return new ElevenLabsClient(config)
}

/**
 * Default voice presets
 */
export const VoicePresets = {
  sarah: 'EXAVITQu4vr4xnSDxMaL', // Female, American, calm
  rachel: '21m00Tcm4TlvDq8ikWAM', // Female, American, calm
  adam: 'pNInz6obpgDQGcFmaJgB', // Male, American, deep
  antoni: 'ErXwobaYiN019PkySvjV', // Male, British, calm
  elli: 'MF3mGyEYCl7XYWbV9V6O', // Female, American, young
  josh: 'TxGEqnHWrfWFTfGW9XjX', // Male, American, young
  arnold: 'VR6AewLTigWG4xSOukaG', // Male, American, deep
  domi: 'AZnzlk1XvdvUeBnXmlld', // Female, German, calm
  bella: 'EXAVITQu4vr4xnSDxMaL', // Female, American, soft
} as const

/**
 * Voice model IDs
 */
export const VoiceModels = {
  multilingualV2: 'eleven_multilingual_v2',
  multilingualV1: 'eleven_multilingual_v1',
  englishV1: 'eleven_monolingual_v1',
  turbo: 'eleven_turbo_v2',
} as const
