/**
 * MCP Endpoints Exports
 */

export { initializeMCPHandler } from './mcp.js'

export {
  cleanupStaleSessions,
  closeSession,
  createStreamingEndpoint,
  getActiveSessionCount,
  getUserSessions,
  sendToApiKey,
  sendToSession,
  sendToUser,
  type StreamEvent,
  streamManager,
  type StreamManager,
  type StreamSession,
} from './streaming.js'
