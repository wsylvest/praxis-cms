# @payloadcms/plugin-ai-admin

AI-powered admin interface for Payload CMS with multi-model support.

## Features

- **Multi-Model Support**: Claude, OpenAI (GPT-4), Google Gemini, Grok (xAI), and Ollama
- **Streaming Responses**: Real-time AI responses with streaming support
- **Security Layer**: Rate limiting, IP allowlisting, audit logging
- **Human-in-the-Loop**: Confirmation dialogs for destructive actions
- **Undo/Rollback**: Revert AI actions within a configurable time window
- **Context-Aware Tools**: Smart tool loading to minimize token usage
- **Draft Storage**: Save AI-generated content as drafts for review
- **Session Management**: Multi-turn conversations with context preservation
- **Admin UI**: Chat panel with sidebar, drawer, or modal positioning

## Installation

```bash
pnpm add @payloadcms/plugin-ai-admin
# or
npm install @payloadcms/plugin-ai-admin
```

## Quick Start

```typescript
import { buildConfig } from 'payload'
import { aiAdminPlugin } from '@payloadcms/plugin-ai-admin'

export default buildConfig({
  collections: [
    { slug: 'posts', fields: [/* ... */] },
    { slug: 'pages', fields: [/* ... */] },
  ],
  plugins: [
    aiAdminPlugin({
      // Configure AI providers
      providers: [
        {
          provider: 'claude',
          apiKey: process.env.ANTHROPIC_API_KEY,
          model: 'claude-sonnet-4-20250514',
        },
        {
          provider: 'openai',
          apiKey: process.env.OPENAI_API_KEY,
          model: 'gpt-4o',
        },
      ],
      defaultProvider: 'claude',

      // Enable AI for specific collections
      collections: {
        posts: {
          enabled: true,
          description: 'Blog posts with title, content, and author',
        },
        pages: {
          enabled: { create: true, read: true, update: true, delete: false },
          description: 'Static website pages',
        },
      },

      // Security settings
      security: {
        requireAuth: true,
        rateLimit: {
          windowMs: 60000,
          maxRequests: 100,
          maxTokensPerWindow: 100000,
        },
        ipAllowlist: {
          enabled: false,
        },
      },

      // Confirmation settings
      confirmation: {
        destructiveActions: 'modal',
        bulkOperations: 'modal',
        configChanges: 'modal',
        timeoutSeconds: 60,
      },

      // Undo settings
      undo: {
        enabled: true,
        retentionHours: 24,
      },

      // Admin UI settings
      admin: {
        chatPosition: 'sidebar',
        showInNav: true,
        defaultOpen: false,
      },
    }),
  ],
})
```

## Configuration

### Provider Configuration

| Provider | Required Fields | Optional Fields |
|----------|-----------------|-----------------|
| `claude` | `apiKey` | `model`, `baseURL`, `maxTokens`, `temperature` |
| `openai` | `apiKey` | `model`, `baseURL`, `maxTokens`, `temperature` |
| `gemini` | `apiKey` | `model`, `maxTokens`, `temperature` |
| `grok` | `apiKey` | `model`, `maxTokens`, `temperature` |
| `ollama` | - | `baseURL` (default: `http://localhost:11434/v1`), `model` |

### Collection Configuration

```typescript
collections: {
  posts: {
    // Enable all operations
    enabled: true,

    // Or enable specific operations
    enabled: {
      create: true,
      read: true,
      update: true,
      delete: false,
    },

    // Description helps the AI understand when to use this collection
    description: 'Blog posts with rich content and media',

    // Fields the AI can generate content for
    generateFields: ['title', 'content', 'excerpt'],

    // Fields to exclude from AI operations
    excludeFields: ['password', 'apiKey'],
  },
}
```

### Security Configuration

```typescript
security: {
  // Require authentication for AI features
  requireAuth: true,

  // Rate limiting
  rateLimit: {
    windowMs: 60000,       // 1 minute window
    maxRequests: 100,      // Max requests per window
    maxTokensPerWindow: 100000, // Max tokens per window
  },

  // IP allowlisting
  ipAllowlist: {
    enabled: true,
    allowedIPs: ['127.0.0.1'],
    allowedCIDRs: ['192.168.1.0/24'],
    denyByDefault: true,
  },
}
```

## API Endpoints

### Chat

```
POST /api/ai/chat
```

Send a message and receive a response.

```typescript
// Request
{
  "message": "Create a new blog post about AI",
  "sessionId": "optional-session-id",
  "provider": "claude" // optional, uses default
}

// Response
{
  "content": "I've created a new blog post...",
  "toolCalls": [...],
  "usage": { "inputTokens": 100, "outputTokens": 200 }
}
```

### Streaming Chat

```
POST /api/ai/chat/stream
```

Returns a Server-Sent Events stream.

```typescript
// Events
{ "type": "text_delta", "content": "I've" }
{ "type": "text_delta", "content": " created" }
{ "type": "tool_use", "toolCall": { "name": "create_posts", ... } }
{ "type": "tool_result", "toolResult": { ... } }
{ "type": "complete" }
```

### Confirmation

```
POST /api/ai/confirmation
```

Approve or deny pending confirmations.

```typescript
{
  "confirmationId": "confirmation-id",
  "action": "approve" // or "deny"
}
```

### Session

```
GET /api/ai/session?sessionId=...
PATCH /api/ai/session?sessionId=...
```

Get or update session context.

## Custom Tools

Add custom tools for domain-specific operations:

```typescript
import { z } from 'zod'

aiAdminPlugin({
  tools: [
    {
      name: 'publish_post',
      category: 'workflow',
      description: 'Publish a draft post to the live site',
      parameters: z.object({
        postId: z.string().describe('ID of the post to publish'),
        scheduledAt: z.string().datetime().optional(),
      }),
      permissions: ['posts:update'],
      confirmationRequired: true,
      undoable: true,
      handler: async (args, ctx) => {
        const post = await ctx.payload.update({
          collection: 'posts',
          id: args.postId,
          data: { status: 'published', publishedAt: new Date() },
        })

        // Save undo action
        await ctx.undoManager.save({
          userId: ctx.user.id,
          sessionId: ctx.session.id,
          toolName: 'publish_post',
          description: `Published post "${post.title}"`,
          operation: 'update',
          collection: 'posts',
          documentId: args.postId,
          previousState: { status: 'draft' },
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })

        return {
          success: true,
          data: post,
          message: `Published "${post.title}"`,
        }
      },
    },
  ],
})
```

## React Component

Use the chat panel in your custom admin views:

```tsx
import { AIChatPanel } from '@payloadcms/plugin-ai-admin/components'

export const MyAdminView = () => {
  return (
    <div>
      <h1>My View</h1>
      <AIChatPanel
        position="sidebar"
        defaultOpen={false}
        baseURL="/api"
      />
    </div>
  )
}
```

## Collections Created

The plugin creates the following collections:

| Collection | Purpose |
|------------|---------|
| `ai-admin-conversations` | Stores conversation history |
| `ai-admin-audit-logs` | Immutable audit trail of AI actions |
| `ai-admin-drafts` | AI-generated content drafts |
| `ai-admin-undo-actions` | Reversible actions for undo |

And one global:

| Global | Purpose |
|--------|---------|
| `ai-admin-settings` | Plugin configuration |

## Security Considerations

1. **Authentication**: Always enable `requireAuth: true` in production
2. **Rate Limiting**: Configure appropriate limits to prevent abuse
3. **IP Allowlisting**: Use for additional security in production
4. **Audit Logging**: All AI actions are logged for compliance
5. **Confirmations**: Destructive actions require user approval
6. **Undo**: Actions can be reverted within the retention window

## Token Optimization

The plugin implements several strategies to minimize token usage:

1. **Context-Aware Loading**: Only loads tools relevant to the current context
2. **Deferred Tools**: Less common tools are loaded on-demand
3. **Tool Search**: AI can discover deferred tools without loading all definitions
4. **Estimated Token Budget**: Configurable token limit for tool definitions

## Environment Variables

```bash
# Provider API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...
XAI_API_KEY=...

# Optional: Override base URLs
ANTHROPIC_BASE_URL=...
OPENAI_BASE_URL=...
```

## License

MIT
