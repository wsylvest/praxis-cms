/**
 * Content Generation Pipelines
 *
 * Provides scheduled and on-demand content generation workflows
 * for AI-powered content creation.
 */

import type { Payload } from 'payload'

export interface PipelineStep {
  name: string
  description?: string
  prompt: string
  provider?: string
  maxTokens?: number
  temperature?: number
  outputField?: string
  condition?: (context: PipelineContext) => boolean
  transform?: (output: string, context: PipelineContext) => string | Promise<string>
  validate?: (output: string, context: PipelineContext) => boolean | Promise<boolean>
  retries?: number
}

export interface Pipeline {
  name: string
  slug: string
  description?: string
  collection: string
  trigger: PipelineTrigger
  steps: PipelineStep[]
  enabled?: boolean
  draftMode?: boolean
  draftsCollection?: string
  auditLogsCollection?: string
  notifyOnComplete?: boolean
  notifyOnError?: boolean
  tags?: string[]
}

export type PipelineTrigger =
  | { type: 'manual' }
  | { type: 'schedule'; cron: string; timezone?: string }
  | { type: 'hook'; event: 'create' | 'update' | 'delete'; conditions?: Record<string, unknown> }
  | { type: 'webhook'; secret: string }

export interface PipelineContext {
  pipeline: Pipeline
  stepIndex: number
  payload: Payload
  user?: { id: string; email?: string }
  input: Record<string, unknown>
  outputs: Record<string, string>
  metadata: Record<string, unknown>
  documentId?: string
  startedAt: Date
}

export interface PipelineRunResult {
  pipelineId: string
  runId: string
  status: 'completed' | 'failed' | 'cancelled'
  startedAt: Date
  completedAt: Date
  stepsCompleted: number
  totalSteps: number
  outputs: Record<string, string>
  error?: string
  documentId?: string
}

export interface ScheduledJob {
  id: string
  pipelineSlug: string
  nextRun: Date
  lastRun?: Date
  lastStatus?: 'completed' | 'failed'
  enabled: boolean
}

/**
 * AI Handler interface for pipeline execution
 */
export interface AIHandler {
  generate: (
    prompt: string,
    options?: {
      provider?: string
      maxTokens?: number
      temperature?: number
    }
  ) => Promise<string>
}

/**
 * Pipeline Manager
 *
 * Manages content generation pipelines with scheduling support
 */
export class PipelineManager {
  private pipelines: Map<string, Pipeline> = new Map()
  private scheduledJobs: Map<string, NodeJS.Timeout> = new Map()
  private runningPipelines: Map<string, PipelineContext> = new Map()
  private payload: Payload
  private aiHandler: AIHandler
  private draftsCollection: string
  private auditLogsCollection: string

  constructor(
    payload: Payload,
    aiHandler: AIHandler,
    options?: {
      draftsCollection?: string
      auditLogsCollection?: string
    }
  ) {
    this.payload = payload
    this.aiHandler = aiHandler
    this.draftsCollection = options?.draftsCollection || 'ai-pipeline-drafts'
    this.auditLogsCollection = options?.auditLogsCollection || 'ai-pipeline-logs'
  }

  /**
   * Register a pipeline
   */
  registerPipeline(pipeline: Pipeline): void {
    this.pipelines.set(pipeline.slug, pipeline)

    // Set up scheduled trigger if applicable
    if (pipeline.enabled !== false && pipeline.trigger.type === 'schedule') {
      this.scheduleJob(pipeline)
    }
  }

  /**
   * Unregister a pipeline
   */
  unregisterPipeline(slug: string): void {
    this.pipelines.delete(slug)
    this.cancelScheduledJob(slug)
  }

  /**
   * Get a pipeline by slug
   */
  getPipeline(slug: string): Pipeline | undefined {
    return this.pipelines.get(slug)
  }

  /**
   * List all pipelines
   */
  listPipelines(): Pipeline[] {
    return Array.from(this.pipelines.values())
  }

  /**
   * Run a pipeline
   */
  async runPipeline(
    slug: string,
    input: Record<string, unknown> = {},
    options?: {
      user?: { id: string; email?: string }
      documentId?: string
    }
  ): Promise<PipelineRunResult> {
    const pipeline = this.pipelines.get(slug)
    if (!pipeline) {
      throw new Error(`Pipeline ${slug} not found`)
    }

    const runId = crypto.randomUUID()
    const startedAt = new Date()

    const context: PipelineContext = {
      pipeline,
      stepIndex: 0,
      payload: this.payload,
      user: options?.user,
      input,
      outputs: {},
      metadata: {},
      documentId: options?.documentId,
      startedAt,
    }

    this.runningPipelines.set(runId, context)

    try {
      // Log pipeline start
      await this.logPipelineRun(runId, pipeline.slug, 'started', context)

      // Execute each step
      for (let i = 0; i < pipeline.steps.length; i++) {
        // Check if cancelled
        if (context.metadata.cancelled) {
          throw new Error('Pipeline cancelled')
        }

        context.stepIndex = i
        const step = pipeline.steps[i]

        // Check condition
        if (step.condition && !step.condition(context)) {
          continue
        }

        // Execute step with retries
        let attempts = 0
        const maxAttempts = (step.retries || 0) + 1
        let lastError: Error | null = null

        while (attempts < maxAttempts) {
          try {
            await this.executeStep(step, context)
            break
          } catch (error) {
            lastError = error as Error
            attempts++
            if (attempts < maxAttempts) {
              // Wait before retry with exponential backoff
              await new Promise((resolve) => setTimeout(resolve, 1000 * attempts))
            }
          }
        }

        if (attempts === maxAttempts && lastError) {
          throw lastError
        }
      }

      // Create document if configured
      if (pipeline.collection && Object.keys(context.outputs).length > 0) {
        const documentData = this.buildDocumentData(pipeline, context)
        const draftsCollection = pipeline.draftsCollection || this.draftsCollection

        if (pipeline.draftMode) {
          // Save as draft
          await this.payload.create({
            collection: draftsCollection,
            data: {
              collection: pipeline.collection,
              data: documentData,
              status: 'pending',
              metadata: {
                pipelineSlug: pipeline.slug,
                runId,
              },
            },
          })
        } else if (context.documentId) {
          // Update existing document
          await this.payload.update({
            collection: pipeline.collection,
            id: context.documentId,
            data: documentData,
          })
        } else {
          // Create new document
          const doc = await this.payload.create({
            collection: pipeline.collection,
            data: documentData,
          })
          context.documentId = doc.id as string
        }
      }

      const result: PipelineRunResult = {
        pipelineId: pipeline.slug,
        runId,
        status: 'completed',
        startedAt,
        completedAt: new Date(),
        stepsCompleted: pipeline.steps.length,
        totalSteps: pipeline.steps.length,
        outputs: context.outputs,
        documentId: context.documentId,
      }

      await this.logPipelineRun(runId, pipeline.slug, 'completed', context)

      // Notify if configured
      if (pipeline.notifyOnComplete) {
        await this.sendNotification(pipeline, result)
      }

      return result
    } catch (error) {
      const result: PipelineRunResult = {
        pipelineId: pipeline.slug,
        runId,
        status: context.metadata.cancelled ? 'cancelled' : 'failed',
        startedAt,
        completedAt: new Date(),
        stepsCompleted: context.stepIndex,
        totalSteps: pipeline.steps.length,
        outputs: context.outputs,
        error: error instanceof Error ? error.message : 'Unknown error',
      }

      await this.logPipelineRun(runId, pipeline.slug, result.status, context, result.error)

      if (pipeline.notifyOnError) {
        await this.sendNotification(pipeline, result)
      }

      throw error
    } finally {
      this.runningPipelines.delete(runId)
    }
  }

  /**
   * Execute a single pipeline step
   */
  private async executeStep(step: PipelineStep, context: PipelineContext): Promise<void> {
    // Build prompt with variable substitution
    const prompt = this.interpolatePrompt(step.prompt, context)

    // Call AI handler
    const output = await this.aiHandler.generate(prompt, {
      provider: step.provider,
      maxTokens: step.maxTokens,
      temperature: step.temperature,
    })

    let processedOutput = output

    // Apply transform if configured
    if (step.transform) {
      processedOutput = await step.transform(output, context)
    }

    // Validate if configured
    if (step.validate) {
      const isValid = await step.validate(processedOutput, context)
      if (!isValid) {
        throw new Error(`Validation failed for step ${step.name}`)
      }
    }

    // Store output
    const outputKey = step.outputField || step.name
    context.outputs[outputKey] = processedOutput
  }

  /**
   * Interpolate variables in prompt
   */
  private interpolatePrompt(prompt: string, context: PipelineContext): string {
    return prompt.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
      const parts = path.split('.')
      let value: any = { ...context.input, ...context.outputs, ...context.metadata }

      for (const part of parts) {
        if (value == null) return match
        value = value[part]
      }

      return value?.toString() || match
    })
  }

  /**
   * Build document data from outputs
   */
  private buildDocumentData(
    pipeline: Pipeline,
    context: PipelineContext
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {}

    for (const step of pipeline.steps) {
      if (step.outputField) {
        data[step.outputField] = context.outputs[step.outputField] || context.outputs[step.name]
      }
    }

    return { ...context.input, ...data }
  }

  /**
   * Schedule a job based on cron expression
   */
  private scheduleJob(pipeline: Pipeline): void {
    if (pipeline.trigger.type !== 'schedule') return

    const nextRun = this.getNextCronRun(pipeline.trigger.cron)
    const delay = nextRun.getTime() - Date.now()

    if (delay > 0) {
      const timeout = setTimeout(async () => {
        try {
          await this.runPipeline(pipeline.slug)
        } catch (error) {
          console.error(`Scheduled pipeline ${pipeline.slug} failed:`, error)
        }
        // Reschedule
        this.scheduleJob(pipeline)
      }, delay)

      this.scheduledJobs.set(pipeline.slug, timeout)
    }
  }

  /**
   * Cancel a scheduled job
   */
  private cancelScheduledJob(slug: string): void {
    const timeout = this.scheduledJobs.get(slug)
    if (timeout) {
      clearTimeout(timeout)
      this.scheduledJobs.delete(slug)
    }
  }

  /**
   * Get next cron run time (simplified implementation)
   */
  private getNextCronRun(cron: string): Date {
    const now = new Date()
    const next = new Date(now)

    // Handle common patterns
    if (cron === '0 * * * *') {
      // Every hour
      next.setMinutes(0, 0, 0)
      next.setHours(next.getHours() + 1)
    } else if (cron === '0 0 * * *') {
      // Every day at midnight
      next.setHours(24, 0, 0, 0)
    } else if (cron === '0 0 * * 0') {
      // Every Sunday at midnight
      next.setHours(0, 0, 0, 0)
      next.setDate(next.getDate() + ((7 - next.getDay()) % 7 || 7))
    } else if (cron === '0 0 1 * *') {
      // First day of month
      next.setHours(0, 0, 0, 0)
      next.setMonth(next.getMonth() + 1, 1)
    } else {
      // Default: next minute
      next.setSeconds(0, 0)
      next.setMinutes(next.getMinutes() + 1)
    }

    return next
  }

  /**
   * Log pipeline run
   */
  private async logPipelineRun(
    runId: string,
    pipelineSlug: string,
    status: string,
    context: PipelineContext,
    error?: string
  ): Promise<void> {
    try {
      const logsCollection = context.pipeline.auditLogsCollection || this.auditLogsCollection

      await this.payload.create({
        collection: logsCollection,
        data: {
          timestamp: new Date(),
          userId: context.user?.id,
          action: `pipeline:${status}`,
          resource: 'pipeline',
          resourceId: pipelineSlug,
          details: {
            runId,
            stepIndex: context.stepIndex,
            outputs: Object.keys(context.outputs),
            error,
          },
          status: error ? 'error' : 'success',
        },
      })
    } catch (e) {
      // Silently fail logging - don't break pipeline execution
      console.error('Failed to log pipeline run:', e)
    }
  }

  /**
   * Send notification
   */
  private async sendNotification(
    pipeline: Pipeline,
    result: PipelineRunResult
  ): Promise<void> {
    // This would integrate with notification system
    // For now, just log
    console.log(`Pipeline ${pipeline.slug} ${result.status}`, result)
  }

  /**
   * Get running pipelines
   */
  getRunningPipelines(): Map<string, PipelineContext> {
    return new Map(this.runningPipelines)
  }

  /**
   * Cancel a running pipeline
   */
  cancelPipeline(runId: string): boolean {
    const context = this.runningPipelines.get(runId)
    if (!context) return false

    // Mark as cancelled (the running loop should check this)
    context.metadata.cancelled = true
    return true
  }

  /**
   * Shutdown all scheduled jobs
   */
  shutdown(): void {
    for (const timeout of this.scheduledJobs.values()) {
      clearTimeout(timeout)
    }
    this.scheduledJobs.clear()
  }
}

/**
 * Create pipeline manager
 */
export function createPipelineManager(
  payload: Payload,
  aiHandler: AIHandler,
  options?: {
    draftsCollection?: string
    auditLogsCollection?: string
  }
): PipelineManager {
  return new PipelineManager(payload, aiHandler, options)
}
