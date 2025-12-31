/**
 * Client-side exports for browser use
 *
 * This module provides browser-compatible utilities including
 * the Web Speech API wrapper for speech-to-text.
 *
 * @example
 * ```ts
 * import { createSpeechRecognitionClient } from '@payloadcms/plugin-elevenlabs/client'
 *
 * const recognition = createSpeechRecognitionClient()
 *
 * if (recognition.isAvailable()) {
 *   recognition.start({
 *     lang: 'en-US',
 *     onResult: (transcript, isFinal) => {
 *       console.log('Transcript:', transcript, 'Final:', isFinal)
 *     },
 *     onError: (error) => {
 *       console.error('Error:', error)
 *     },
 *   })
 * }
 * ```
 */

export {
  createSpeechRecognitionClient,
  SpeechRecognitionClient,
} from './speech-recognition.js'

// Also export the ElevenLabs client for direct API calls from client
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
