/**
 * AI Pipelines Plugin for Payload CMS
 *
 * Provides scheduled and on-demand content generation workflows
 * for AI-powered content creation.
 */

import type { Config, Payload } from 'payload'
import {
  PipelineManager,
  createPipelineManager,
  type Pipeline,
  type PipelineStep,
  type PipelineTrigger,
  type PipelineContext,
  type PipelineRunResult,
  type AIHandler,
} from './pipeline.js'
import { createPipelineEndpoints, type PipelineEndpointsConfig } from './endpoints.js'
import {
  createPipelineDraftsCollection,
  createPipelineLogsCollection,
} from './collections.js'
import { PipelineTemplates } from './templates.js'

export interface PipelinesPluginConfig {
  /**
   * AI handler for generating content
   * This function will be called for each pipeline step
   */
  aiHandler: AIHandler

  /**
   * Pipelines to register
   */
  pipelines?: Pipeline[]

  /**
   * Base path for pipeline endpoints (default: '/api/pipelines')
   */
  basePath?: string

  /**
   * Collection slug for pipeline drafts (default: 'ai-pipeline-drafts')
   */
  draftsCollection?: string

  /**
   * Collection slug for pipeline logs (default: 'ai-pipeline-logs')
   */
  logsCollection?: string

  /**
   * Disable drafts collection creation
   */
  disableDraftsCollection?: boolean

  /**
   * Disable logs collection creation
   */
  disableLogsCollection?: boolean

  /**
   * Users collection name for relationships (default: 'users')
   */
  usersCollection?: string
}

// Store manager instances for access outside of plugin context
const managerInstances = new Map<string, PipelineManager>()

/**
 * Get pipeline manager instance
 */
export function getPipelineManager(id: string = 'default'): PipelineManager | undefined {
  return managerInstances.get(id)
}

/**
 * AI Pipelines Plugin for Payload CMS
 *
 * @example
 * ```ts
 * import { buildConfig } from 'payload'
 * import { pipelinesPlugin } from '@payloadcms/plugin-ai-pipelines'
 * import { PipelineTemplates } from '@payloadcms/plugin-ai-pipelines'
 *
 * export default buildConfig({
 *   plugins: [
 *     pipelinesPlugin({
 *       aiHandler: {
 *         generate: async (prompt, options) => {
 *           // Call your AI provider here
 *           const response = await openai.chat.completions.create({
 *             model: 'gpt-4',
 *             messages: [{ role: 'user', content: prompt }],
 *             max_tokens: options?.maxTokens,
 *             temperature: options?.temperature,
 *           })
 *           return response.choices[0].message.content
 *         },
 *       },
 *       pipelines: [
 *         PipelineTemplates.blogPost({ collection: 'posts' }),
 *         PipelineTemplates.productDescription({ collection: 'products' }),
 *       ],
 *     }),
 *   ],
 * })
 * ```
 */
export function pipelinesPlugin(pluginConfig: PipelinesPluginConfig) {
  const {
    aiHandler,
    pipelines = [],
    basePath = '/api/pipelines',
    draftsCollection = 'ai-pipeline-drafts',
    logsCollection = 'ai-pipeline-logs',
    disableDraftsCollection = false,
    disableLogsCollection = false,
  } = pluginConfig

  return (incomingConfig: Config): Config => {
    const collections = [...(incomingConfig.collections || [])]

    // Add drafts collection if not disabled
    if (!disableDraftsCollection) {
      collections.push(createPipelineDraftsCollection({ slug: draftsCollection }))
    }

    // Add logs collection if not disabled
    if (!disableLogsCollection) {
      collections.push(createPipelineLogsCollection({ slug: logsCollection }))
    }

    // Create manager ID for this instance
    const managerId = `pipelines-${Date.now()}`

    const config: Config = {
      ...incomingConfig,
      collections,
      onInit: async (payload: Payload) => {
        // Call existing onInit if present
        if (incomingConfig.onInit) {
          await incomingConfig.onInit(payload)
        }

        // Create pipeline manager
        const manager = createPipelineManager(payload, aiHandler, {
          draftsCollection,
          auditLogsCollection: logsCollection,
        })

        // Register pipelines
        for (const pipeline of pipelines) {
          manager.registerPipeline(pipeline)
        }

        // Store manager instance
        managerInstances.set(managerId, manager)
        managerInstances.set('default', manager)
      },
    }

    // Create endpoints with deferred manager lookup
    const endpoints = createPipelineEndpoints({
      getPipelineManager: () => managerInstances.get(managerId),
      basePath,
    })

    config.endpoints = [...(incomingConfig.endpoints || []), ...endpoints]

    return config
  }
}

// Re-export types and utilities
export {
  PipelineManager,
  createPipelineManager,
  createPipelineEndpoints,
  createPipelineDraftsCollection,
  createPipelineLogsCollection,
  PipelineTemplates,
}

export type {
  Pipeline,
  PipelineStep,
  PipelineTrigger,
  PipelineContext,
  PipelineRunResult,
  AIHandler,
  PipelineEndpointsConfig,
}
