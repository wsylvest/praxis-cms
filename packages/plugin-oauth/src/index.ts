/**
 * OAuth/SSO Plugin for Payload CMS
 *
 * Provides enterprise SSO integration supporting OAuth 2.0, OIDC, and common identity providers.
 */

import type { Config, Payload } from 'payload'
import { createOAuthAccountsCollection, type OAuthCollectionOptions } from './collection.js'
import { createOAuthEndpoints, type OAuthEndpointsConfig } from './endpoints.js'
import {
  OAuthManager,
  OAuthProviders,
  OAuth2Provider,
  OIDCProvider,
  type OAuthProviderConfig,
  type OIDCConfig,
  type SAMLConfig,
  type OAuthUser,
  type OAuthTokens,
  type OAuthState,
} from './providers.js'

export interface OAuthProviderSetup {
  type: 'google' | 'microsoft' | 'okta' | 'auth0' | 'github' | 'oidc' | 'oauth2'
  clientId: string
  clientSecret: string
  callbackURL?: string
  // Provider-specific options
  tenantId?: string // Microsoft
  domain?: string // Okta, Auth0
  scope?: string[]
  // OIDC options
  issuer?: string
  authorizationURL?: string
  tokenURL?: string
  userInfoURL?: string
  pkce?: boolean
}

export interface OAuthPluginConfig {
  /**
   * OAuth providers to enable
   */
  providers: OAuthProviderSetup[]

  /**
   * Base URL for callbacks (e.g., 'https://example.com')
   */
  baseURL: string

  /**
   * Base path for OAuth endpoints (default: '/api/oauth')
   */
  basePath?: string

  /**
   * Collection slug for storing OAuth accounts (default: 'oauth-accounts')
   */
  collectionSlug?: string

  /**
   * Users collection to link OAuth accounts to (default: 'users')
   */
  usersCollection?: string

  /**
   * Automatically create users on first OAuth login
   */
  autoCreateUsers?: boolean

  /**
   * Default roles for auto-created users
   */
  defaultRoles?: string[]

  /**
   * Allowed email domains for OAuth login
   */
  allowedDomains?: string[]

  /**
   * Callback when a new user is created via OAuth
   */
  onUserCreated?: (user: any, oauthUser: OAuthUser) => Promise<void>

  /**
   * Callback when an OAuth account is linked to an existing user
   */
  onUserLinked?: (user: any, oauthUser: OAuthUser) => Promise<void>
}

// Store manager instances for access outside of plugin context
const managerInstances = new Map<string, OAuthManager>()

/**
 * Get OAuth manager instance by collection slug
 */
export function getOAuthManager(collectionSlug: string = 'oauth-accounts'): OAuthManager | undefined {
  return managerInstances.get(collectionSlug)
}

/**
 * OAuth Plugin for Payload CMS
 *
 * @example
 * ```ts
 * import { buildConfig } from 'payload'
 * import { oauthPlugin } from '@payloadcms/plugin-oauth'
 *
 * export default buildConfig({
 *   plugins: [
 *     oauthPlugin({
 *       baseURL: 'https://example.com',
 *       providers: [
 *         {
 *           type: 'google',
 *           clientId: process.env.GOOGLE_CLIENT_ID,
 *           clientSecret: process.env.GOOGLE_CLIENT_SECRET,
 *         },
 *         {
 *           type: 'microsoft',
 *           clientId: process.env.MICROSOFT_CLIENT_ID,
 *           clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
 *           tenantId: process.env.MICROSOFT_TENANT_ID,
 *         },
 *       ],
 *       autoCreateUsers: true,
 *       defaultRoles: ['user'],
 *       allowedDomains: ['example.com'],
 *     }),
 *   ],
 * })
 * ```
 */
export function oauthPlugin(pluginConfig: OAuthPluginConfig) {
  const {
    providers,
    baseURL,
    basePath = '/api/oauth',
    collectionSlug = 'oauth-accounts',
    usersCollection = 'users',
    autoCreateUsers = false,
    defaultRoles = ['user'],
    allowedDomains,
    onUserCreated,
    onUserLinked,
  } = pluginConfig

  return (incomingConfig: Config): Config => {
    // Create OAuth accounts collection
    const oauthCollection = createOAuthAccountsCollection({
      slug: collectionSlug,
      usersCollection,
      providers: providers.map((p) => p.type),
    })

    // Add collection to config
    const collections = [...(incomingConfig.collections || []), oauthCollection]

    // Create OAuth manager and register providers on init
    const config: Config = {
      ...incomingConfig,
      collections,
      onInit: async (payload: Payload) => {
        // Call existing onInit if present
        if (incomingConfig.onInit) {
          await incomingConfig.onInit(payload)
        }

        // Create and configure OAuth manager
        const manager = new OAuthManager(payload, collectionSlug)

        for (const providerSetup of providers) {
          const callbackURL =
            providerSetup.callbackURL || `${baseURL}${basePath}/callback/${providerSetup.type}`

          let provider

          switch (providerSetup.type) {
            case 'google':
              provider = OAuthProviders.google({
                clientId: providerSetup.clientId,
                clientSecret: providerSetup.clientSecret,
                callbackURL,
                scope: providerSetup.scope,
              })
              break

            case 'microsoft':
              provider = OAuthProviders.microsoft({
                clientId: providerSetup.clientId,
                clientSecret: providerSetup.clientSecret,
                callbackURL,
                tenantId: providerSetup.tenantId,
                scope: providerSetup.scope,
              })
              break

            case 'okta':
              if (!providerSetup.domain) {
                throw new Error('Okta provider requires domain')
              }
              provider = OAuthProviders.okta({
                clientId: providerSetup.clientId,
                clientSecret: providerSetup.clientSecret,
                callbackURL,
                domain: providerSetup.domain,
                scope: providerSetup.scope,
              })
              break

            case 'auth0':
              if (!providerSetup.domain) {
                throw new Error('Auth0 provider requires domain')
              }
              provider = OAuthProviders.auth0({
                clientId: providerSetup.clientId,
                clientSecret: providerSetup.clientSecret,
                callbackURL,
                domain: providerSetup.domain,
                scope: providerSetup.scope,
              })
              break

            case 'github':
              provider = OAuthProviders.github({
                clientId: providerSetup.clientId,
                clientSecret: providerSetup.clientSecret,
                callbackURL,
                scope: providerSetup.scope,
              })
              break

            case 'oidc':
              if (!providerSetup.issuer) {
                throw new Error('OIDC provider requires issuer')
              }
              provider = OAuthProviders.oidc({
                name: 'oidc',
                type: 'oidc',
                clientId: providerSetup.clientId,
                clientSecret: providerSetup.clientSecret,
                callbackURL,
                issuer: providerSetup.issuer,
                authorizationURL: providerSetup.authorizationURL,
                tokenURL: providerSetup.tokenURL,
                userInfoURL: providerSetup.userInfoURL,
                scope: providerSetup.scope,
                pkce: providerSetup.pkce ?? true,
              })
              break

            case 'oauth2':
              if (!providerSetup.authorizationURL || !providerSetup.tokenURL) {
                throw new Error('OAuth2 provider requires authorizationURL and tokenURL')
              }
              provider = new OAuth2Provider({
                name: 'oauth2',
                type: 'oauth2',
                clientId: providerSetup.clientId,
                clientSecret: providerSetup.clientSecret,
                callbackURL,
                authorizationURL: providerSetup.authorizationURL,
                tokenURL: providerSetup.tokenURL,
                userInfoURL: providerSetup.userInfoURL,
                scope: providerSetup.scope,
                pkce: providerSetup.pkce,
              })
              break
          }

          if (provider) {
            manager.registerProvider(provider)
          }
        }

        // Store manager instance for external access
        managerInstances.set(collectionSlug, manager)
      },
    }

    // Create endpoints with deferred manager lookup
    const endpoints = createOAuthEndpoints({
      getOAuthManager: () => managerInstances.get(collectionSlug),
      collectionSlug,
      basePath,
      usersCollection,
      autoCreateUsers,
      defaultRoles,
      allowedDomains,
      onUserCreated,
      onUserLinked,
    })

    config.endpoints = [...(incomingConfig.endpoints || []), ...endpoints]

    return config
  }
}

// Re-export types and utilities
export {
  createOAuthAccountsCollection,
  createOAuthEndpoints,
  OAuthManager,
  OAuthProviders,
  OAuth2Provider,
  OIDCProvider,
}

export type {
  OAuthCollectionOptions,
  OAuthEndpointsConfig,
  OAuthProviderConfig,
  OIDCConfig,
  SAMLConfig,
  OAuthUser,
  OAuthTokens,
  OAuthState,
}
