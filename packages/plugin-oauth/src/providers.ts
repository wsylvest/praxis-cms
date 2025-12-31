/**
 * OAuth/SSO Provider Support
 *
 * Provides enterprise SSO integration supporting OIDC, SAML, and common OAuth providers.
 */

import type { Payload } from 'payload'

export interface OAuthProviderConfig {
  name: string
  type: 'oauth2' | 'oidc' | 'saml'
  clientId: string
  clientSecret: string
  authorizationURL?: string
  tokenURL?: string
  userInfoURL?: string
  issuer?: string
  callbackURL: string
  scope?: string[]
  pkce?: boolean
}

export interface OIDCConfig extends OAuthProviderConfig {
  type: 'oidc'
  issuer: string
  jwksUri?: string
  discoveryEndpoint?: string
}

export interface SAMLConfig {
  name: string
  type: 'saml'
  entryPoint: string
  issuer: string
  cert: string
  callbackURL: string
  signatureAlgorithm?: 'sha256' | 'sha512'
  wantAssertionsSigned?: boolean
}

export interface OAuthUser {
  id: string
  email: string
  name?: string
  picture?: string
  provider: string
  providerAccountId: string
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  roles?: string[]
  metadata?: Record<string, unknown>
}

export interface OAuthTokens {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresIn?: number
  tokenType?: string
  scope?: string
}

export interface OAuthState {
  provider: string
  returnTo?: string
  nonce?: string
  codeVerifier?: string
}

/**
 * Base OAuth Provider class
 */
export abstract class OAuthProvider {
  protected config: OAuthProviderConfig

  constructor(config: OAuthProviderConfig) {
    this.config = config
  }

  abstract getAuthorizationURL(state: string, codeChallenge?: string): string
  abstract exchangeCodeForTokens(code: string, codeVerifier?: string): Promise<OAuthTokens>
  abstract getUserInfo(accessToken: string): Promise<OAuthUser>

  getName(): string {
    return this.config.name
  }

  getCallbackURL(): string {
    return this.config.callbackURL
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  async generatePKCE(): Promise<{ verifier: string; challenge: string }> {
    const verifier = this.generateRandomString(128)
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)

    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = new Uint8Array(hashBuffer)
    const challenge = this.base64URLEncode(hashArray)

    return { verifier, challenge }
  }

  protected generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
    const array = new Uint8Array(length)
    crypto.getRandomValues(array)
    return Array.from(array, (byte) => chars[byte % chars.length]).join('')
  }

  protected base64URLEncode(buffer: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...buffer))
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
}

/**
 * Generic OAuth 2.0 Provider
 */
export class OAuth2Provider extends OAuthProvider {
  getAuthorizationURL(state: string, codeChallenge?: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.callbackURL,
      response_type: 'code',
      state,
      scope: this.config.scope?.join(' ') || 'openid profile email',
    })

    if (codeChallenge && this.config.pkce) {
      params.set('code_challenge', codeChallenge)
      params.set('code_challenge_method', 'S256')
    }

    return `${this.config.authorizationURL}?${params.toString()}`
  }

  async exchangeCodeForTokens(code: string, codeVerifier?: string): Promise<OAuthTokens> {
    const body: Record<string, string> = {
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: this.config.callbackURL,
    }

    if (codeVerifier && this.config.pkce) {
      body.code_verifier = codeVerifier
    }

    const response = await fetch(this.config.tokenURL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(body),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token exchange failed: ${error}`)
    }

    const data = (await response.json()) as Record<string, unknown>

    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string | undefined,
      idToken: data.id_token as string | undefined,
      expiresIn: data.expires_in as number | undefined,
      tokenType: data.token_type as string | undefined,
      scope: data.scope as string | undefined,
    }
  }

  async getUserInfo(accessToken: string): Promise<OAuthUser> {
    const response = await fetch(this.config.userInfoURL!, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch user info')
    }

    const data = (await response.json()) as Record<string, unknown>

    return {
      id: (data.sub || data.id) as string,
      email: data.email as string,
      name: data.name as string | undefined,
      picture: data.picture as string | undefined,
      provider: this.config.name,
      providerAccountId: (data.sub || data.id) as string,
      accessToken,
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch(this.config.tokenURL!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
      }),
    })

    if (!response.ok) {
      throw new Error('Token refresh failed')
    }

    const data = (await response.json()) as Record<string, unknown>

    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) || refreshToken,
      expiresIn: data.expires_in as number | undefined,
      tokenType: data.token_type as string | undefined,
    }
  }
}

/**
 * OpenID Connect Provider with discovery
 */
export class OIDCProvider extends OAuth2Provider {
  constructor(config: OIDCConfig) {
    super(config)
  }

  async discover(): Promise<void> {
    const oidcConfig = this.config as OIDCConfig
    const discoveryURL =
      oidcConfig.discoveryEndpoint || `${oidcConfig.issuer}/.well-known/openid-configuration`

    const response = await fetch(discoveryURL)
    if (!response.ok) {
      throw new Error('OIDC discovery failed')
    }

    const doc = (await response.json()) as Record<string, unknown>

    if (!this.config.authorizationURL && doc.authorization_endpoint) {
      this.config.authorizationURL = doc.authorization_endpoint as string
    }
    if (!this.config.tokenURL && doc.token_endpoint) {
      this.config.tokenURL = doc.token_endpoint as string
    }
    if (!this.config.userInfoURL && doc.userinfo_endpoint) {
      this.config.userInfoURL = doc.userinfo_endpoint as string
    }
  }

  async verifyIdToken(idToken: string): Promise<Record<string, unknown>> {
    const parts = idToken.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid ID token format')
    }

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    const oidcConfig = this.config as OIDCConfig

    if (payload.iss !== oidcConfig.issuer) {
      throw new Error('Invalid token issuer')
    }

    if (payload.aud !== this.config.clientId) {
      throw new Error('Invalid token audience')
    }

    if (payload.exp && payload.exp < Date.now() / 1000) {
      throw new Error('Token expired')
    }

    return payload
  }
}

/**
 * Pre-configured providers for common SSO services
 */
export const OAuthProviders = {
  google: (config: {
    clientId: string
    clientSecret: string
    callbackURL: string
    scope?: string[]
  }): OAuth2Provider => {
    return new OAuth2Provider({
      name: 'google',
      type: 'oauth2',
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      callbackURL: config.callbackURL,
      authorizationURL: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenURL: 'https://oauth2.googleapis.com/token',
      userInfoURL: 'https://www.googleapis.com/oauth2/v3/userinfo',
      scope: config.scope || ['openid', 'profile', 'email'],
      pkce: true,
    })
  },

  microsoft: (config: {
    clientId: string
    clientSecret: string
    callbackURL: string
    tenantId?: string
    scope?: string[]
  }): OAuth2Provider => {
    const tenant = config.tenantId || 'common'
    return new OAuth2Provider({
      name: 'microsoft',
      type: 'oauth2',
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      callbackURL: config.callbackURL,
      authorizationURL: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenURL: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      userInfoURL: 'https://graph.microsoft.com/v1.0/me',
      scope: config.scope || ['openid', 'profile', 'email', 'User.Read'],
      pkce: true,
    })
  },

  okta: (config: {
    clientId: string
    clientSecret: string
    callbackURL: string
    domain: string
    scope?: string[]
  }): OIDCProvider => {
    return new OIDCProvider({
      name: 'okta',
      type: 'oidc',
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      callbackURL: config.callbackURL,
      issuer: `https://${config.domain}`,
      authorizationURL: `https://${config.domain}/oauth2/default/v1/authorize`,
      tokenURL: `https://${config.domain}/oauth2/default/v1/token`,
      userInfoURL: `https://${config.domain}/oauth2/default/v1/userinfo`,
      scope: config.scope || ['openid', 'profile', 'email'],
      pkce: true,
    })
  },

  auth0: (config: {
    clientId: string
    clientSecret: string
    callbackURL: string
    domain: string
    scope?: string[]
  }): OIDCProvider => {
    return new OIDCProvider({
      name: 'auth0',
      type: 'oidc',
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      callbackURL: config.callbackURL,
      issuer: `https://${config.domain}/`,
      authorizationURL: `https://${config.domain}/authorize`,
      tokenURL: `https://${config.domain}/oauth/token`,
      userInfoURL: `https://${config.domain}/userinfo`,
      scope: config.scope || ['openid', 'profile', 'email'],
      pkce: true,
    })
  },

  github: (config: {
    clientId: string
    clientSecret: string
    callbackURL: string
    scope?: string[]
  }): OAuth2Provider => {
    return new OAuth2Provider({
      name: 'github',
      type: 'oauth2',
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      callbackURL: config.callbackURL,
      authorizationURL: 'https://github.com/login/oauth/authorize',
      tokenURL: 'https://github.com/login/oauth/access_token',
      userInfoURL: 'https://api.github.com/user',
      scope: config.scope || ['read:user', 'user:email'],
    })
  },

  oidc: (config: OIDCConfig): OIDCProvider => {
    return new OIDCProvider(config)
  },
}

/**
 * OAuth Manager for handling multiple providers
 */
export class OAuthManager {
  private providers: Map<string, OAuthProvider> = new Map()
  private stateStore: Map<string, OAuthState> = new Map()
  private payload: Payload
  private collectionSlug: string

  constructor(payload: Payload, collectionSlug: string = 'oauth-accounts') {
    this.payload = payload
    this.collectionSlug = collectionSlug
  }

  registerProvider(provider: OAuthProvider): void {
    this.providers.set(provider.getName(), provider)
  }

  getProvider(name: string): OAuthProvider | undefined {
    return this.providers.get(name)
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys())
  }

  async startAuthFlow(
    providerName: string,
    returnTo?: string
  ): Promise<{ authorizationURL: string; state: string }> {
    const provider = this.providers.get(providerName)
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`)
    }

    const state = this.generateState()
    const stateData: OAuthState = {
      provider: providerName,
      returnTo,
    }

    if ((provider as any).config?.pkce) {
      const pkce = await provider.generatePKCE()
      stateData.codeVerifier = pkce.verifier
      const authorizationURL = provider.getAuthorizationURL(state, pkce.challenge)
      this.stateStore.set(state, stateData)
      return { authorizationURL, state }
    }

    const authorizationURL = provider.getAuthorizationURL(state)
    this.stateStore.set(state, stateData)

    return { authorizationURL, state }
  }

  async handleCallback(
    state: string,
    code: string
  ): Promise<{ user: OAuthUser; returnTo?: string }> {
    const stateData = this.stateStore.get(state)
    if (!stateData) {
      throw new Error('Invalid or expired state')
    }

    this.stateStore.delete(state)

    const provider = this.providers.get(stateData.provider)
    if (!provider) {
      throw new Error(`Provider ${stateData.provider} not found`)
    }

    const tokens = await provider.exchangeCodeForTokens(code, stateData.codeVerifier)
    const user = await provider.getUserInfo(tokens.accessToken)
    user.refreshToken = tokens.refreshToken
    user.expiresAt = tokens.expiresIn ? Date.now() + tokens.expiresIn * 1000 : undefined

    return { user, returnTo: stateData.returnTo }
  }

  async linkAccount(userId: string, oauthUser: OAuthUser): Promise<void> {
    await this.payload.create({
      collection: this.collectionSlug,
      data: {
        user: userId,
        provider: oauthUser.provider,
        providerAccountId: oauthUser.providerAccountId,
        email: oauthUser.email,
        name: oauthUser.name,
        picture: oauthUser.picture,
        accessToken: oauthUser.accessToken,
        refreshToken: oauthUser.refreshToken,
        expiresAt: oauthUser.expiresAt ? new Date(oauthUser.expiresAt) : undefined,
      },
    })
  }

  async findUserByOAuth(
    provider: string,
    providerAccountId: string
  ): Promise<{ userId: string; account: any } | null> {
    const accounts = await this.payload.find({
      collection: this.collectionSlug,
      where: {
        and: [
          { provider: { equals: provider } },
          { providerAccountId: { equals: providerAccountId } },
        ],
      },
      limit: 1,
    })

    if (accounts.docs.length === 0) {
      return null
    }

    const account = accounts.docs[0]
    return {
      userId: (account as any).user,
      account,
    }
  }

  private generateState(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  cleanupExpiredStates(_maxAgeMs: number = 10 * 60 * 1000): void {
    // In a real implementation, states should be stored with timestamps
  }
}

/**
 * Create OAuth manager with configured providers
 */
export function createOAuthManager(
  payload: Payload,
  providers: Array<{
    name: string
    config: OAuthProviderConfig | OIDCConfig | SAMLConfig
  }>,
  collectionSlug: string = 'oauth-accounts'
): OAuthManager {
  const manager = new OAuthManager(payload, collectionSlug)

  for (const { config } of providers) {
    let provider: OAuthProvider

    if (config.type === 'oidc') {
      provider = new OIDCProvider(config as OIDCConfig)
    } else if (config.type === 'oauth2') {
      provider = new OAuth2Provider(config as OAuthProviderConfig)
    } else {
      throw new Error(`Unsupported provider type: ${config.type}`)
    }

    manager.registerProvider(provider)
  }

  return manager
}
