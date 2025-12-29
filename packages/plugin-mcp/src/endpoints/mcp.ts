import crypto from 'crypto'
import { type PayloadHandler, type TypedUser, UnauthorizedError, type Where } from 'payload'

import type { MCPAccessSettings, PluginMCPServerConfig } from '../types.js'

import { createRequestFromPayloadRequest } from '../mcp/createRequest.js'
import { getMCPHandler } from '../mcp/getMcpHandler.js'
import { createApiKeyManager } from '../middleware/apiKeyEnhancements.js'
import { createAuditLogger } from '../middleware/auditLogger.js'
import {
  createRateLimiter,
  createRateLimitResponse,
  getRateLimitHeaders,
} from '../middleware/rateLimiter.js'

export const initializeMCPHandler = (pluginOptions: PluginMCPServerConfig) => {
  // Initialize middleware based on security configuration
  const securityConfig = pluginOptions.security || {}

  // Initialize rate limiter
  const rateLimiter =
    securityConfig.rateLimiting?.enabled !== false
      ? createRateLimiter({
          maxRequests: securityConfig.rateLimiting?.maxRequests ?? 100,
          maxTokensPerWindow: securityConfig.rateLimiting?.maxTokensPerWindow,
          skipKeys: securityConfig.rateLimiting?.skipKeys,
          windowMs: securityConfig.rateLimiting?.windowMs ?? 60000,
        })
      : null

  // Initialize audit logger
  const auditLogger =
    securityConfig.auditLogging?.enabled !== false
      ? createAuditLogger({
          logErrors: securityConfig.auditLogging?.logErrors,
          logRateLimited: securityConfig.auditLogging?.logRateLimited,
          logSuccess: securityConfig.auditLogging?.logSuccess,
          maxParameterSize: securityConfig.auditLogging?.maxParameterSize,
          redactFields: securityConfig.auditLogging?.redactFields,
        })
      : null

  // Initialize API key manager for enhanced validation
  const apiKeyManager = securityConfig.apiKeyEnhancements
    ? createApiKeyManager(securityConfig.apiKeyEnhancements)
    : null

  const mcpHandler: PayloadHandler = async (req) => {
    const { payload } = req
    const MCPOptions = pluginOptions.mcp || {}
    const MCPHandlerOptions = MCPOptions.handlerOptions || {}
    const useVerboseLogs = MCPHandlerOptions.verboseLogs ?? false
    const startTime = Date.now()

    req.payloadAPI = 'MCP' as const

    // Get client IP for rate limiting and logging
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'

    let apiKeyId: string | undefined
    let userId: string | undefined

    const getDefaultMcpAccessSettings = async (overrideApiKey?: null | string) => {
      const apiKey =
        (overrideApiKey ?? req.headers.get('Authorization')?.startsWith('Bearer '))
          ? req.headers.get('Authorization')?.replace('Bearer ', '').trim()
          : null

      if (apiKey === null) {
        throw new UnauthorizedError()
      }

      const sha256APIKeyIndex = crypto
        .createHmac('sha256', payload.secret)
        .update(apiKey || '')
        .digest('hex')

      const apiKeyConstraints = [
        {
          apiKeyIndex: {
            equals: sha256APIKeyIndex,
          },
        },
      ]

      const where: Where = {
        or: apiKeyConstraints,
      }

      const { docs } = await payload.find({
        collection: 'payload-mcp-api-keys',
        limit: 1,
        pagination: false,
        where,
      })

      if (docs.length === 0) {
        throw new UnauthorizedError()
      }

      // Store IDs for middleware
      apiKeyId = String(docs[0]?.id)
      userId = String((docs[0]?.user as TypedUser)?.id)

      // Enhanced API key validation (expiration, IP allowlist)
      if (apiKeyManager) {
        const validation = await apiKeyManager.validateKey(payload, apiKeyId, clientIp)
        if (!validation.valid) {
          if (useVerboseLogs) {
            payload.logger.warn(`[payload-mcp] API key validation failed: ${validation.reason}`)
          }
          throw new UnauthorizedError()
        }

        // Record usage
        await apiKeyManager.recordUsage(payload, apiKeyId, clientIp)
      }

      if (useVerboseLogs) {
        payload.logger.info('[payload-mcp] API Key is valid')
      }

      const user = docs[0]?.user as TypedUser
      const customUserCollection =
        typeof pluginOptions.userCollection === 'string'
          ? pluginOptions.userCollection
          : pluginOptions.userCollection?.slug
      user.collection = customUserCollection ?? 'users'
      user._strategy = 'mcp-api-key' as const

      return docs[0] as unknown as MCPAccessSettings
    }

    try {
      const mcpAccessSettings = pluginOptions.overrideAuth
        ? await pluginOptions.overrideAuth(req, getDefaultMcpAccessSettings)
        : await getDefaultMcpAccessSettings()

      // Rate limiting check (after auth so we have apiKeyId)
      if (rateLimiter && apiKeyId && userId) {
        const rateLimitResult = await rateLimiter.checkLimit(apiKeyId, userId)

        if (!rateLimitResult.allowed) {
          // Log rate limited request
          if (auditLogger) {
            await auditLogger.log(payload, {
              apiKeyId: apiKeyId || 'unknown',
              ipAddress: clientIp,
              parameters: {},
              responseTimeMs: Date.now() - startTime,
              result: 'rate_limited',
              toolName: 'rate_limited',
              userId: userId || 'unknown',
            })
          }

          return createRateLimitResponse(rateLimitResult)
        }

        // Add rate limit headers to successful response later
        req.context = {
          ...req.context,
          rateLimitHeaders: getRateLimitHeaders(rateLimitResult),
        }
      }

      const handler = getMCPHandler(pluginOptions, mcpAccessSettings, req)
      const request = createRequestFromPayloadRequest(req)
      const response = await handler(request)

      // Log successful request
      if (auditLogger && apiKeyId && userId) {
        // Try to extract tool info from request body
        let toolName = 'unknown'
        let parameters = {}
        try {
          const body = await request.clone().json()
          if (body.method === 'tools/call' && body.params?.name) {
            toolName = body.params.name
            parameters = body.params.arguments || {}
          }
        } catch {
          // Ignore JSON parse errors
        }

        await auditLogger.log(payload, {
          apiKeyId,
          ipAddress: clientIp,
          parameters,
          responseTimeMs: Date.now() - startTime,
          result: 'success',
          toolName,
          userId,
        })
      }

      return response
    } catch (error) {
      // Log error
      if (auditLogger && apiKeyId && userId) {
        await auditLogger.log(payload, {
          apiKeyId: apiKeyId || 'unknown',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          ipAddress: clientIp,
          parameters: {},
          responseTimeMs: Date.now() - startTime,
          result: error instanceof UnauthorizedError ? 'denied' : 'error',
          toolName: 'error',
          userId: userId || 'unknown',
        })
      }

      throw error
    }
  }
  return mcpHandler
}
