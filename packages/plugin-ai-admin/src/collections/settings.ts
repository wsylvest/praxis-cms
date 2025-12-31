import type { GlobalConfig } from 'payload'

/**
 * AI Admin Settings Global
 * Centralized configuration for the AI admin plugin
 */
export const createSettingsGlobal = (): GlobalConfig => {
  return {
    slug: 'ai-admin-settings',
    label: 'AI Settings',
    admin: {
      group: 'AI Admin',
      description: 'Configure AI admin plugin settings',
    },
    access: {
      read: ({ req }) => {
        return (req.user as any)?.role === 'admin'
      },
      update: ({ req }) => {
        return (req.user as any)?.role === 'admin'
      },
    },
    fields: [
      {
        type: 'tabs',
        tabs: [
          {
            label: 'Providers',
            fields: [
              {
                name: 'defaultProvider',
                type: 'select',
                options: [
                  { label: 'Claude (Anthropic)', value: 'claude' },
                  { label: 'GPT-4 (OpenAI)', value: 'openai' },
                  { label: 'Gemini (Google)', value: 'gemini' },
                  { label: 'Grok (xAI)', value: 'grok' },
                ],
                defaultValue: 'claude',
                admin: {
                  description: 'Default AI provider for new conversations',
                },
              },
              {
                name: 'providers',
                type: 'group',
                fields: [
                  {
                    name: 'claude',
                    type: 'group',
                    label: 'Claude (Anthropic)',
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
                        options: [
                          { label: 'Claude Opus 4', value: 'claude-opus-4-20250514' },
                          { label: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
                          { label: 'Claude 3.5 Haiku', value: 'claude-3-5-haiku-20241022' },
                        ],
                        defaultValue: 'claude-sonnet-4-20250514',
                      },
                    ],
                  },
                  {
                    name: 'openai',
                    type: 'group',
                    label: 'OpenAI',
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
                        options: [
                          { label: 'GPT-4o', value: 'gpt-4o' },
                          { label: 'GPT-4o Mini', value: 'gpt-4o-mini' },
                          { label: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
                        ],
                        defaultValue: 'gpt-4o',
                      },
                    ],
                  },
                  {
                    name: 'gemini',
                    type: 'group',
                    label: 'Google Gemini',
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
                        options: [
                          { label: 'Gemini 2.0 Flash', value: 'gemini-2.0-flash-exp' },
                          { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' },
                          { label: 'Gemini 1.5 Flash', value: 'gemini-1.5-flash' },
                        ],
                        defaultValue: 'gemini-1.5-pro',
                      },
                    ],
                  },
                  {
                    name: 'grok',
                    type: 'group',
                    label: 'Grok (xAI)',
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
                        options: [
                          { label: 'Grok 2', value: 'grok-2' },
                          { label: 'Grok 2 Mini', value: 'grok-2-mini' },
                        ],
                        defaultValue: 'grok-2',
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            label: 'Security',
            fields: [
              {
                name: 'security',
                type: 'group',
                fields: [
                  {
                    name: 'requireAuth',
                    type: 'checkbox',
                    defaultValue: true,
                    admin: {
                      description: 'Require authentication for AI features',
                    },
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
                        defaultValue: 60000,
                        admin: {
                          description: 'Rate limit window in milliseconds',
                        },
                      },
                      {
                        name: 'maxRequests',
                        type: 'number',
                        defaultValue: 100,
                        admin: {
                          description: 'Max requests per window',
                        },
                      },
                      {
                        name: 'maxTokens',
                        type: 'number',
                        defaultValue: 100000,
                        admin: {
                          description: 'Max tokens per window',
                        },
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
                        fields: [
                          {
                            name: 'ip',
                            type: 'text',
                          },
                        ],
                        admin: {
                          description: 'Allowed IP addresses',
                        },
                      },
                      {
                        name: 'allowedCIDRs',
                        type: 'array',
                        fields: [
                          {
                            name: 'cidr',
                            type: 'text',
                          },
                        ],
                        admin: {
                          description: 'Allowed CIDR ranges (e.g., 192.168.1.0/24)',
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            label: 'Confirmations',
            fields: [
              {
                name: 'confirmations',
                type: 'group',
                fields: [
                  {
                    name: 'destructiveActions',
                    type: 'select',
                    options: [
                      { label: 'None', value: 'none' },
                      { label: 'Inline', value: 'inline' },
                      { label: 'Modal', value: 'modal' },
                    ],
                    defaultValue: 'modal',
                    admin: {
                      description: 'Confirmation level for delete operations',
                    },
                  },
                  {
                    name: 'bulkOperations',
                    type: 'select',
                    options: [
                      { label: 'None', value: 'none' },
                      { label: 'Inline', value: 'inline' },
                      { label: 'Modal', value: 'modal' },
                    ],
                    defaultValue: 'modal',
                    admin: {
                      description: 'Confirmation level for bulk operations',
                    },
                  },
                  {
                    name: 'configChanges',
                    type: 'select',
                    options: [
                      { label: 'None', value: 'none' },
                      { label: 'Inline', value: 'inline' },
                      { label: 'Modal', value: 'modal' },
                    ],
                    defaultValue: 'modal',
                    admin: {
                      description: 'Confirmation level for config changes',
                    },
                  },
                  {
                    name: 'timeoutSeconds',
                    type: 'number',
                    defaultValue: 60,
                    admin: {
                      description: 'Confirmation timeout in seconds',
                    },
                  },
                ],
              },
            ],
          },
          {
            label: 'Undo/Rollback',
            fields: [
              {
                name: 'undo',
                type: 'group',
                fields: [
                  {
                    name: 'enabled',
                    type: 'checkbox',
                    defaultValue: true,
                    admin: {
                      description: 'Enable undo/rollback functionality',
                    },
                  },
                  {
                    name: 'retentionHours',
                    type: 'number',
                    defaultValue: 24,
                    admin: {
                      description: 'How long to keep undo history (hours)',
                    },
                  },
                  {
                    name: 'maxActionsPerSession',
                    type: 'number',
                    defaultValue: 50,
                    admin: {
                      description: 'Max undoable actions per session',
                    },
                  },
                ],
              },
            ],
          },
          {
            label: 'UI',
            fields: [
              {
                name: 'ui',
                type: 'group',
                fields: [
                  {
                    name: 'chatPosition',
                    type: 'select',
                    options: [
                      { label: 'Sidebar', value: 'sidebar' },
                      { label: 'Drawer', value: 'drawer' },
                      { label: 'Modal', value: 'modal' },
                    ],
                    defaultValue: 'sidebar',
                    admin: {
                      description: 'Where to show the AI chat panel',
                    },
                  },
                  {
                    name: 'showInNav',
                    type: 'checkbox',
                    defaultValue: true,
                    admin: {
                      description: 'Show AI chat in navigation',
                    },
                  },
                  {
                    name: 'defaultOpen',
                    type: 'checkbox',
                    defaultValue: false,
                    admin: {
                      description: 'Open chat panel by default',
                    },
                  },
                  {
                    name: 'enableStreaming',
                    type: 'checkbox',
                    defaultValue: true,
                    admin: {
                      description: 'Enable streaming responses',
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  }
}
