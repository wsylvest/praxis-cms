/**
 * Web Speech API wrapper for speech-to-text
 * (Client-side only - for browser use)
 */
export class SpeechRecognitionClient {
  private recognition: any = null
  private isListening: boolean = false

  constructor() {
    if (typeof window !== 'undefined') {
      const SpeechRecognitionAPI =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition

      if (SpeechRecognitionAPI) {
        this.recognition = new SpeechRecognitionAPI()
        this.recognition.continuous = false
        this.recognition.interimResults = true
        this.recognition.lang = 'en-US'
      }
    }
  }

  /**
   * Check if speech recognition is available
   */
  isAvailable(): boolean {
    return this.recognition !== null
  }

  /**
   * Start listening
   */
  start(options?: {
    lang?: string
    continuous?: boolean
    onResult?: (transcript: string, isFinal: boolean) => void
    onError?: (error: Error) => void
    onEnd?: () => void
  }): void {
    if (!this.recognition) {
      options?.onError?.(new Error('Speech recognition not available'))
      return
    }

    if (this.isListening) {
      return
    }

    if (options?.lang) {
      this.recognition.lang = options.lang
    }

    if (options?.continuous !== undefined) {
      this.recognition.continuous = options.continuous
    }

    this.recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1]
      const transcript = result[0].transcript
      options?.onResult?.(transcript, result.isFinal)
    }

    this.recognition.onerror = (event: any) => {
      options?.onError?.(new Error(event.error))
    }

    this.recognition.onend = () => {
      this.isListening = false
      options?.onEnd?.()
    }

    this.recognition.start()
    this.isListening = true
  }

  /**
   * Stop listening
   */
  stop(): void {
    if (this.recognition && this.isListening) {
      this.recognition.stop()
      this.isListening = false
    }
  }

  /**
   * Check if currently listening
   */
  getIsListening(): boolean {
    return this.isListening
  }
}

/**
 * Create speech recognition client
 */
export function createSpeechRecognitionClient(): SpeechRecognitionClient {
  return new SpeechRecognitionClient()
}
