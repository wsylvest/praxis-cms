/**
 * Pipeline Endpoints
 *
 * REST API for content generation pipelines
 */

import type { Endpoint, PayloadRequest } from 'payload'
import type { PipelineManager } from './pipeline.js'

export interface PipelineEndpointsConfig {
  getPipelineManager: () => PipelineManager | undefined
  basePath?: string
}

/**
 * Create pipeline endpoints
 */
export function createPipelineEndpoints(config: PipelineEndpointsConfig): Endpoint[] {
  const { getPipelineManager, basePath = '/api/pipelines' } = config

  return [
    /**
     * GET /api/pipelines
     * List all pipelines
     */
    {
      path: basePath,
      method: 'get',
      handler: async (req: PayloadRequest) => {
        const pipelineManager = getPipelineManager()
        if (!pipelineManager) {
          return Response.json({ error: 'Pipelines not initialized' }, { status: 503 })
        }

        if (!req.user) {
          return Response.json({ error: 'Authentication required' }, { status: 401 })
        }

        const pipelines = pipelineManager.listPipelines()

        return Response.json({
          pipelines: pipelines.map((p) => ({
            name: p.name,
            slug: p.slug,
            description: p.description,
            collection: p.collection,
            trigger: p.trigger,
            stepsCount: p.steps.length,
            enabled: p.enabled !== false,
            draftMode: p.draftMode,
            tags: p.tags,
          })),
        })
      },
    },

    /**
     * GET /api/pipelines/:slug
     * Get pipeline details
     */
    {
      path: `${basePath}/:slug`,
      method: 'get',
      handler: async (req: PayloadRequest) => {
        const pipelineManager = getPipelineManager()
        if (!pipelineManager) {
          return Response.json({ error: 'Pipelines not initialized' }, { status: 503 })
        }

        if (!req.user) {
          return Response.json({ error: 'Authentication required' }, { status: 401 })
        }

        const slug = req.routeParams?.slug as string
        const pipeline = pipelineManager.getPipeline(slug)

        if (!pipeline) {
          return Response.json({ error: 'Pipeline not found' }, { status: 404 })
        }

        return Response.json({
          pipeline: {
            name: pipeline.name,
            slug: pipeline.slug,
            description: pipeline.description,
            collection: pipeline.collection,
            trigger: pipeline.trigger,
            steps: pipeline.steps.map((s) => ({
              name: s.name,
              description: s.description,
              outputField: s.outputField,
              hasCondition: !!s.condition,
              hasTransform: !!s.transform,
              hasValidation: !!s.validate,
              retries: s.retries,
            })),
            enabled: pipeline.enabled !== false,
            draftMode: pipeline.draftMode,
            notifyOnComplete: pipeline.notifyOnComplete,
            notifyOnError: pipeline.notifyOnError,
            tags: pipeline.tags,
          },
        })
      },
    },

    /**
     * POST /api/pipelines/:slug/run
     * Run a pipeline
     */
    {
      path: `${basePath}/:slug/run`,
      method: 'post',
      handler: async (req: PayloadRequest) => {
        const pipelineManager = getPipelineManager()
        if (!pipelineManager) {
          return Response.json({ error: 'Pipelines not initialized' }, { status: 503 })
        }

        if (!req.user) {
          return Response.json({ error: 'Authentication required' }, { status: 401 })
        }

        const slug = req.routeParams?.slug as string
        const pipeline = pipelineManager.getPipeline(slug)

        if (!pipeline) {
          return Response.json({ error: 'Pipeline not found' }, { status: 404 })
        }

        // Check if manually triggerable
        if (pipeline.trigger.type !== 'manual' && pipeline.trigger.type !== 'webhook') {
          return Response.json(
            { error: 'This pipeline cannot be run manually' },
            { status: 400 }
          )
        }

        try {
          const body = (await req.json?.()) as Record<string, any> | undefined
          const input = body?.input || {}
          const documentId = body?.documentId
          const runAsync = body?.async || false

          if (runAsync) {
            // Start pipeline in background
            const runId = crypto.randomUUID()

            // Non-blocking run
            pipelineManager
              .runPipeline(slug, input, {
                user: req.user ? { id: String(req.user.id), email: (req.user as any).email } : undefined,
                documentId,
              })
              .catch((error) => {
                console.error(`Pipeline ${slug} failed:`, error)
              })

            return Response.json({
              status: 'started',
              runId,
              message: 'Pipeline started in background',
            })
          }

          const result = await pipelineManager.runPipeline(slug, input, {
            user: req.user ? { id: String(req.user.id), email: (req.user as any).email } : undefined,
            documentId,
          })

          return Response.json(result)
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Pipeline failed' },
            { status: 500 }
          )
        }
      },
    },

    /**
     * GET /api/pipelines/running
     * Get running pipelines
     */
    {
      path: `${basePath}/running`,
      method: 'get',
      handler: async (req: PayloadRequest) => {
        const pipelineManager = getPipelineManager()
        if (!pipelineManager) {
          return Response.json({ error: 'Pipelines not initialized' }, { status: 503 })
        }

        if (!req.user) {
          return Response.json({ error: 'Authentication required' }, { status: 401 })
        }

        const running = pipelineManager.getRunningPipelines()

        return Response.json({
          running: Array.from(running.entries()).map(([runId, context]) => ({
            runId,
            pipelineSlug: context.pipeline.slug,
            pipelineName: context.pipeline.name,
            currentStep: context.stepIndex,
            totalSteps: context.pipeline.steps.length,
            startedAt: context.startedAt,
            user: context.user,
          })),
        })
      },
    },

    /**
     * POST /api/pipelines/running/:runId/cancel
     * Cancel a running pipeline
     */
    {
      path: `${basePath}/running/:runId/cancel`,
      method: 'post',
      handler: async (req: PayloadRequest) => {
        const pipelineManager = getPipelineManager()
        if (!pipelineManager) {
          return Response.json({ error: 'Pipelines not initialized' }, { status: 503 })
        }

        if (!req.user) {
          return Response.json({ error: 'Authentication required' }, { status: 401 })
        }

        const runId = req.routeParams?.runId as string
        const cancelled = pipelineManager.cancelPipeline(runId)

        if (!cancelled) {
          return Response.json({ error: 'Pipeline not found or already completed' }, { status: 404 })
        }

        return Response.json({
          status: 'cancelled',
          runId,
        })
      },
    },

    /**
     * POST /api/pipelines/webhook/:slug
     * Webhook trigger for pipelines
     */
    {
      path: `${basePath}/webhook/:slug`,
      method: 'post',
      handler: async (req: PayloadRequest) => {
        const pipelineManager = getPipelineManager()
        if (!pipelineManager) {
          return Response.json({ error: 'Pipelines not initialized' }, { status: 503 })
        }

        const slug = req.routeParams?.slug as string
        const pipeline = pipelineManager.getPipeline(slug)

        if (!pipeline) {
          return Response.json({ error: 'Pipeline not found' }, { status: 404 })
        }

        if (pipeline.trigger.type !== 'webhook') {
          return Response.json({ error: 'Pipeline does not support webhook trigger' }, { status: 400 })
        }

        // Verify webhook secret
        const signature = req.headers.get('x-webhook-signature')
        if (signature !== pipeline.trigger.secret) {
          return Response.json({ error: 'Invalid signature' }, { status: 401 })
        }

        try {
          const body = (await req.json?.()) as Record<string, any> | undefined
          const input = body?.input || {}
          const documentId = body?.documentId

          const result = await pipelineManager.runPipeline(slug, input, {
            documentId,
          })

          return Response.json(result)
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Pipeline failed' },
            { status: 500 }
          )
        }
      },
    },
  ]
}
