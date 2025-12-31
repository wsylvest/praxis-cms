/**
 * OAuth Accounts Collection
 *
 * Stores OAuth/SSO account links for users
 */

import type { CollectionConfig } from 'payload'

export interface OAuthCollectionOptions {
  slug?: string
  usersCollection?: string
  providers?: string[]
}

export function createOAuthAccountsCollection(
  options: OAuthCollectionOptions = {}
): CollectionConfig {
  const {
    slug = 'oauth-accounts',
    usersCollection = 'users',
    providers = ['google', 'microsoft', 'okta', 'auth0', 'github', 'oidc', 'saml'],
  } = options

  return {
    slug,
    admin: {
      group: 'Authentication',
      useAsTitle: 'provider',
      description: 'OAuth/SSO account links',
      defaultColumns: ['provider', 'providerAccountId', 'user', 'createdAt'],
    },
    access: {
      read: ({ req: { user } }) => {
        if (!user) return false
        if ((user as any).roles?.includes('admin')) return true
        return {
          user: {
            equals: user.id,
          },
        }
      },
      create: ({ req: { user } }) => Boolean(user),
      update: ({ req: { user } }) => {
        if (!user) return false
        if ((user as any).roles?.includes('admin')) return true
        return {
          user: {
            equals: user.id,
          },
        }
      },
      delete: ({ req: { user } }) => {
        if (!user) return false
        if ((user as any).roles?.includes('admin')) return true
        return {
          user: {
            equals: user.id,
          },
        }
      },
    },
    fields: [
      {
        name: 'user',
        type: 'relationship',
        relationTo: usersCollection,
        required: true,
        index: true,
        admin: {
          description: 'The Payload user this OAuth account is linked to',
        },
      },
      {
        name: 'provider',
        type: 'select',
        required: true,
        index: true,
        options: providers.map((p) => ({ label: p.charAt(0).toUpperCase() + p.slice(1), value: p })),
        admin: {
          description: 'The OAuth/SSO provider',
        },
      },
      {
        name: 'providerAccountId',
        type: 'text',
        required: true,
        index: true,
        admin: {
          description: 'Unique identifier from the OAuth provider',
        },
      },
      {
        name: 'email',
        type: 'email',
        admin: {
          description: 'Email associated with this OAuth account',
        },
      },
      {
        name: 'name',
        type: 'text',
        admin: {
          description: 'Display name from the OAuth provider',
        },
      },
      {
        name: 'picture',
        type: 'text',
        admin: {
          description: 'Profile picture URL from the OAuth provider',
        },
      },
      {
        name: 'accessToken',
        type: 'text',
        admin: {
          description: 'OAuth access token (encrypted)',
          hidden: true,
        },
      },
      {
        name: 'refreshToken',
        type: 'text',
        admin: {
          description: 'OAuth refresh token (encrypted)',
          hidden: true,
        },
      },
      {
        name: 'expiresAt',
        type: 'date',
        admin: {
          description: 'When the access token expires',
        },
      },
      {
        name: 'scope',
        type: 'text',
        admin: {
          description: 'OAuth scopes granted',
        },
      },
      {
        name: 'metadata',
        type: 'json',
        admin: {
          description: 'Additional metadata from the OAuth provider',
        },
      },
    ],
    indexes: [
      {
        fields: ['provider', 'providerAccountId'],
        unique: true,
      },
    ],
    timestamps: true,
  }
}
