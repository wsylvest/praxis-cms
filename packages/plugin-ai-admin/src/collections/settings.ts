import type { GlobalConfig } from 'payload'

/**
 * AI Admin Settings Global
 * Centralized configuration for the AI admin plugin
 */
export const createSettingsGlobal = (): GlobalConfig => {
  return {
    slug: 'ai-admin-settings',
    access: {
      read: ({ req }) => {
        return (req.user as any)?.role === 'admin'
      },
      update: ({ req }) => {
        return (req.user as any)?.role === 'admin'
      },
    },
    admin: {
      description: 'Configure AI admin plugin settings',
      group: 'AI Admin',
    },
    fields: [
      {
        type: 'tabs',
        tabs: [
          {
            fields: [
              {
                name: 'defaultProvider',
                type: 'select',
                admin: {
                  description: 'Default AI provider for new conversations',
                },
                defaultValue: 'claude',
                options: [
                  { label: 'Claude (Anthropic)', value: 'claude' },
                  { label: 'GPT-4 (OpenAI)', value: 'openai' },
                  { label: 'Gemini (Google)', value: 'gemini' },
                  { label: 'Grok (xAI)', value: 'grok' },
                ],
              },
              {
                name: 'providers',
                type: 'group',
                fields: [
                  {
                    name: 'claude',
                    type: 'group',
                    fields: [
                      {
                        name: 'enabled',
                        type: 'checkbox',
                        defaultValue: true,
                      },
                      {
                        name: 'apiKey',
                        type: 'text',
                        admin: {
                          description: 'Anthropic API key (or use ANTHROPIC_API_KEY env var)',
                        },
                      },
                      {
                        name: 'model',
                        type: 'select',
                        defaultValue: 'claude-sonnet-4-20250514',
                        options: [
                          { label: 'Claude Opus 4', value: 'claude-opus-4-20250514' },
                          { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
                          { label: 'Claude 3.5 Haiku', value: 'claude-3-5-haiku-20241022' },
                        ],
                      },
                    ],
                    label: 'Claude (Anthropic)',
                  },
                  {
                    name: 'openai',
                    type: 'group',
                    fields: [
                      {
                        name: 'enabled',
                        type: 'checkbox',
                        defaultValue: false,
                      },
                      {
                        name: 'apiKey',
                        type: 'text',
                        admin: {
                          description: 'OpenAI API key (or use OPENAI_API_KEY env var)',
                        },
                      },
                      {
                        name: 'model',
                        type: 'select',
                        defaultValue: 'gpt-4o',
                        options: [
                          { label: 'GPT-4o', value: 'gpt-4o' },
                          { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
                          { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
                        ],
                      },
                    ],
                    label: 'OpenAI',
                  },
                  {
                    name: 'gemini',
                    type: 'group',
                    fields: [
                      {
                        name: 'enabled',
                        type: 'checkbox',
                        defaultValue: false,
                      },
                      {
                        name: 'apiKey',
                        type: 'text',
                        admin: {
                          description: 'Google AI API key (or use GOOGLE_AI_API_KEY env var)',
                        },
                      },
                      {
                        name: 'model',
                        type: 'select',
                        defaultValue: 'gemini-1.5-pro',
                        options: [
                          { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash-exp' },
                          { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
                          { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
                        ],
                      },
                    ],
                    label: 'Google Gemini',
                  },
                  {
                    name: 'grok',
                    type: 'group',
                    fields: [
                      {
                        name: 'enabled',
                        type: 'checkbox',
                        defaultValue: false,
                      },
                      {
                        name: 'apiKey',
                        type: 'text',
                        admin: {
                          description: 'xAI API key (or use XAI_API_KEY env var)',
                        },
                      },
                      {
                        name: 'model',
                        type: 'select',
                        defaultValue: 'grok-2',
                        options: [
                          { label: 'Grok 2', value: 'grok-2' },
                          { label: 'Grok 2 Mini', value: 'grok-2-mini' },
                        ],
                      },
                    ],
                    label: 'Grok (xAI)',
                  },
                ],
              },
            ],
            label: 'Providers',
          },
          {
            fields: [
              {
                name: 'security',
                type: 'group',
                fields: [
                  {
                    name: 'requireAuth',
                    type: 'checkbox',
                    admin: {
                      description: 'Require authentication for AI features',
                    },
                    defaultValue: true,
                  },
                  {
                    name: 'rateLimiting',
                    type: 'group',
                    fields: [
                      {
                        name: 'enabled',
                        type: 'checkbox',
                        defaultValue: true,
                      },
                      {
                        name: 'windowMs',
                        type: 'number',
                        admin: {
                          description: 'Rate limit window in milliseconds',
                        },
                        defaultValue: 60000,
                      },
                      {
                        name: 'maxRequests',
                        type: 'number',
                        admin: {
                          description: 'Max requests per window',
                        },
                        defaultValue: 100,
                      },
                      {
                        name: 'maxTokens',
                        type: 'number',
                        admin: {
                          description: 'Max tokens per window',
                        },
                        defaultValue: 100000,
                      },
                    ],
                  },
                  {
                    name: 'ipAllowlist',
                    type: 'group',
                    fields: [
                      {
                        name: 'enabled',
                        type: 'checkbox',
                        defaultValue: false,
                      },
                      {
                        name: 'allowedIPs',
                        type: 'array',
                        admin: {
                          description: 'Allowed IP addresses',
                        },
                        fields: [
                          {
                            name: 'ip',
                            type: 'text',
                          },
                        ],
                      },
                      {
                        name: 'allowedCIDRs',
                        type: 'array',
                        admin: {
                          description: 'Allowed CIDR ranges (e.g., 192.168.1.0/24)',
                        },
                        fields: [
                          {
                            name: 'cidr',
                            type: 'text',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
            label: 'Security',
          },
          {
            fields: [
              {
                name: 'confirmations',
                type: 'group',
                fields: [
                  {
                    name: 'destructiveActions',
                    type: 'select',
                    admin: {
                      description: 'Confirmation level for delete operations',
                    },
                    defaultValue: 'modal',
                    options: [
                      { label: 'None', value: 'none' },
                      { label: 'Inline', value: 'inline' },
                      { label: 'Modal', value: 'modal' },
                    ],
                  },
                  {
                    name: 'bulkOperations',
                    type: 'select',
                    admin: {
                      description: 'Confirmation level for bulk operations',
                    },
                    defaultValue: 'modal',
                    options: [
                      { label: 'None', value: 'none' },
                      { label: 'Inline', value: 'inline' },
                      { label: 'Modal', value: 'modal' },
                    ],
                  },
                  {
                    name: 'configChanges',
                    type: 'select',
                    admin: {
                      description: 'Confirmation level for config changes',
                    },
                    defaultValue: 'modal',
                    options: [
                      { label: 'None', value: 'none' },
                      { label: 'Inline', value: 'inline' },
                      { label: 'Modal', value: 'modal' },
                    ],
                  },
                  {
                    name: 'timeoutSeconds',
                    type: 'number',
                    admin: {
                      description: 'Confirmation timeout in seconds',
                    },
                    defaultValue: 60,
                  },
                ],
              },
            ],
            label: 'Confirmations',
          },
          {
            fields: [
              {
                name: 'undo',
                type: 'group',
                fields: [
                  {
                    name: 'enabled',
                    type: 'checkbox',
                    admin: {
                      description: 'Enable undo/rollback functionality',
                    },
                    defaultValue: true,
                  },
                  {
                    name: 'retentionHours',
                    type: 'number',
                    admin: {
                      description: 'How long to keep undo history (hours)',
                    },
                    defaultValue: 24,
                  },
                  {
                    name: 'maxActionsPerSession',
                    type: 'number',
                    admin: {
                      description: 'Max undoable actions per session',
                    },
                    defaultValue: 50,
                  },
                ],
              },
            ],
            label: 'Undo/Rollback',
          },
          {
            fields: [
              {
                name: 'ui',
                type: 'group',
                fields: [
                  {
                    name: 'chatPosition',
                    type: 'select',
                    admin: {
                      description: 'Where to show the AI chat panel',
                    },
                    defaultValue: 'sidebar',
                    options: [
                      { label: 'Sidebar', value: 'sidebar' },
                      { label: 'Drawer', value: 'drawer' },
                      { label: 'Modal', value: 'modal' },
                    ],
                  },
                  {
                    name: 'showInNav',
                    type: 'checkbox',
                    admin: {
                      description: 'Show AI chat in navigation',
                    },
                    defaultValue: true,
                  },
                  {
                    name: 'defaultOpen',
                    type: 'checkbox',
                    admin: {
                      description: 'Open chat panel by default',
                    },
                    defaultValue: false,
                  },
                  {
                    name: 'enableStreaming',
                    type: 'checkbox',
                    admin: {
                      description: 'Enable streaming responses',
                    },
                    defaultValue: true,
                  },
                ],
              },
            ],
            label: 'UI',
          },
        ],
      },
    ],
    label: 'AI Settings',
  }
}
