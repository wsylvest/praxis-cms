/**
 * MCP Middleware Exports
 *
 * Security, audit, and enhancement modules for the MCP plugin.
 */

// API Key Enhancements
export {
  type ApiKeyEnhancementsConfig,
  type ApiKeyManager,
  createApiKeyManager,
  getEnhancedApiKeyFields,
} from './apiKeyEnhancements.js'

// Audit Logging
export { type AuditLogger, type AuditLoggerConfig, createAuditLogger } from './auditLogger.js'

// Confirmation System
export {
  type ConfirmationConfig,
  type ConfirmationManager,
  type ConfirmationRequest,
  type ConfirmationResult,
  createConfirmationManager,
} from './confirmationManager.js'

// Rate Limiting
export {
  createRateLimiter,
  createRateLimitResponse,
  getRateLimitHeaders,
  type RateLimitConfig,
  type RateLimiter,
  type RateLimitResult,
} from './rateLimiter.js'

// Undo System
export {
  createUndoManager,
  type SaveStateRequest,
  type UndoConfig,
  type UndoManager,
  type UndoResult,
} from './undoManager.js'
