/**
 * OAuth/SSO Endpoints
 *
 * Handles OAuth authentication flows for enterprise SSO
 */

import type { Endpoint, PayloadRequest } from 'payload'
import type { OAuthManager } from './providers.js'

export interface OAuthEndpointsConfig {
  getOAuthManager: () => OAuthManager | undefined
  collectionSlug?: string
  basePath?: string
  onUserCreated?: (user: any, oauthUser: any) => Promise<void>
  onUserLinked?: (user: any, oauthUser: any) => Promise<void>
  autoCreateUsers?: boolean
  defaultRoles?: string[]
  allowedDomains?: string[]
  usersCollection?: string
}

/**
 * Create OAuth endpoints
 */
export function createOAuthEndpoints(config: OAuthEndpointsConfig): Endpoint[] {
  const {
    getOAuthManager,
    collectionSlug = 'oauth-accounts',
    basePath = '/api/oauth',
    onUserCreated,
    onUserLinked,
    autoCreateUsers = false,
    defaultRoles = ['user'],
    allowedDomains,
    usersCollection = 'users',
  } = config

  return [
    /**
     * GET /api/oauth/providers
     * List available OAuth providers
     */
    {
      path: `${basePath}/providers`,
      method: 'get',
      handler: async () => {
        const oauthManager = getOAuthManager()
        if (!oauthManager) {
          return Response.json({ error: 'OAuth not initialized' }, { status: 503 })
        }
        const providers = oauthManager.listProviders()

        return Response.json({
          providers: providers.map((name) => ({
            name,
            loginUrl: `${basePath}/login/${name}`,
          })),
        })
      },
    },

    /**
     * GET /api/oauth/login/:provider
     * Start OAuth flow for a provider
     */
    {
      path: `${basePath}/login/:provider`,
      method: 'get',
      handler: async (req: PayloadRequest) => {
        const oauthManager = getOAuthManager()
        if (!oauthManager) {
          return Response.json({ error: 'OAuth not initialized' }, { status: 503 })
        }

        const providerName = req.routeParams?.provider as string
        const returnTo = new URL(req.url || '').searchParams.get('returnTo') || '/admin'

        try {
          const { authorizationURL, state } = await oauthManager.startAuthFlow(
            providerName,
            returnTo
          )

          return new Response(null, {
            status: 302,
            headers: {
              Location: authorizationURL,
              'Set-Cookie': `oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
            },
          })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'OAuth flow failed' },
            { status: 400 }
          )
        }
      },
    },

    /**
     * GET /api/oauth/callback/:provider
     * Handle OAuth callback
     */
    {
      path: `${basePath}/callback/:provider`,
      method: 'get',
      handler: async (req: PayloadRequest) => {
        const oauthManager = getOAuthManager()
        if (!oauthManager) {
          return Response.json({ error: 'OAuth not initialized' }, { status: 503 })
        }

        const url = new URL(req.url || '')
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const error = url.searchParams.get('error')
        const errorDescription = url.searchParams.get('error_description')

        if (error) {
          return Response.json(
            { error, description: errorDescription },
            { status: 400 }
          )
        }

        if (!code || !state) {
          return Response.json(
            { error: 'Missing code or state' },
            { status: 400 }
          )
        }

        const cookieHeader = req.headers.get('cookie') || ''
        const cookies = Object.fromEntries(
          cookieHeader.split(';').map((c) => {
            const [key, ...value] = c.trim().split('=')
            return [key, value.join('=')]
          })
        )

        const storedState = cookies.oauth_state
        if (storedState !== state) {
          return Response.json(
            { error: 'Invalid state' },
            { status: 400 }
          )
        }

        try {
          const { user: oauthUser, returnTo } = await oauthManager.handleCallback(state, code)

          if (allowedDomains && allowedDomains.length > 0) {
            const emailDomain = oauthUser.email?.split('@')[1]
            if (!emailDomain || !allowedDomains.includes(emailDomain)) {
              return Response.json(
                { error: 'Email domain not allowed' },
                { status: 403 }
              )
            }
          }

          const existingLink = await oauthManager.findUserByOAuth(
            oauthUser.provider,
            oauthUser.providerAccountId
          )

          let payloadUser: any

          if (existingLink) {
            payloadUser = await req.payload.findByID({
              collection: usersCollection,
              id: existingLink.userId,
            })

            await req.payload.update({
              collection: collectionSlug,
              id: (existingLink.account as any).id,
              data: {
                accessToken: oauthUser.accessToken,
                refreshToken: oauthUser.refreshToken,
                expiresAt: oauthUser.expiresAt ? new Date(oauthUser.expiresAt) : undefined,
              },
            })
          } else if (req.user) {
            await oauthManager.linkAccount(String(req.user.id), oauthUser)
            payloadUser = req.user

            if (onUserLinked) {
              await onUserLinked(payloadUser, oauthUser)
            }
          } else if (autoCreateUsers && oauthUser.email) {
            const existingUsers = await req.payload.find({
              collection: usersCollection,
              where: {
                email: { equals: oauthUser.email },
              },
              limit: 1,
            })

            if (existingUsers.docs.length > 0) {
              payloadUser = existingUsers.docs[0]
              await oauthManager.linkAccount(payloadUser.id, oauthUser)

              if (onUserLinked) {
                await onUserLinked(payloadUser, oauthUser)
              }
            } else {
              payloadUser = await req.payload.create({
                collection: usersCollection,
                data: {
                  email: oauthUser.email,
                  name: oauthUser.name,
                  roles: defaultRoles,
                  password: crypto.randomUUID() + crypto.randomUUID(),
                },
              })

              await oauthManager.linkAccount(payloadUser.id, oauthUser)

              if (onUserCreated) {
                await onUserCreated(payloadUser, oauthUser)
              }
            }
          } else {
            return Response.json(
              { error: 'No linked account found. Please login first and link your account.' },
              { status: 401 }
            )
          }

          const headers = new Headers()
          headers.set('Set-Cookie', 'oauth_state=; Path=/; HttpOnly; Max-Age=0')
          headers.set('Location', returnTo || '/admin')

          return new Response(null, {
            status: 302,
            headers,
          })
        } catch (error) {
          console.error('OAuth callback error:', error)
          return Response.json(
            { error: error instanceof Error ? error.message : 'OAuth callback failed' },
            { status: 500 }
          )
        }
      },
    },

    /**
     * POST /api/oauth/link/:provider
     * Link OAuth account to current user
     */
    {
      path: `${basePath}/link/:provider`,
      method: 'post',
      handler: async (req: PayloadRequest) => {
        const oauthManager = getOAuthManager()
        if (!oauthManager) {
          return Response.json({ error: 'OAuth not initialized' }, { status: 503 })
        }

        if (!req.user) {
          return Response.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        }

        const providerName = req.routeParams?.provider as string
        const returnTo = '/admin/account'

        try {
          const { authorizationURL, state } = await oauthManager.startAuthFlow(
            providerName,
            returnTo
          )

          return Response.json({
            authorizationURL,
            state,
          })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Failed to start OAuth flow' },
            { status: 400 }
          )
        }
      },
    },

    /**
     * DELETE /api/oauth/unlink/:provider
     * Unlink OAuth account from current user
     */
    {
      path: `${basePath}/unlink/:provider`,
      method: 'delete',
      handler: async (req: PayloadRequest) => {
        if (!req.user) {
          return Response.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        }

        const providerName = req.routeParams?.provider as string

        try {
          const accounts = await req.payload.find({
            collection: collectionSlug,
            where: {
              and: [
                { user: { equals: req.user.id } },
                { provider: { equals: providerName } },
              ],
            },
            limit: 1,
          })

          if (accounts.docs.length === 0) {
            return Response.json(
              { error: 'No linked account found' },
              { status: 404 }
            )
          }

          await req.payload.delete({
            collection: collectionSlug,
            id: accounts.docs[0].id,
          })

          return Response.json({
            success: true,
            message: `Unlinked ${providerName} account`,
          })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Failed to unlink account' },
            { status: 500 }
          )
        }
      },
    },

    /**
     * GET /api/oauth/accounts
     * List linked OAuth accounts for current user
     */
    {
      path: `${basePath}/accounts`,
      method: 'get',
      handler: async (req: PayloadRequest) => {
        if (!req.user) {
          return Response.json(
            { error: 'Authentication required' },
            { status: 401 }
          )
        }

        try {
          const accounts = await req.payload.find({
            collection: collectionSlug,
            where: {
              user: { equals: req.user.id },
            },
          })

          return Response.json({
            accounts: accounts.docs.map((account: any) => ({
              id: account.id,
              provider: account.provider,
              email: account.email,
              name: account.name,
              picture: account.picture,
              linkedAt: account.createdAt,
            })),
          })
        } catch (error) {
          return Response.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch accounts' },
            { status: 500 }
          )
        }
      },
    },
  ]
}
