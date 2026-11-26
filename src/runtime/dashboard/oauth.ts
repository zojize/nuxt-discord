import type { H3Event } from 'h3'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { deleteCookie, getCookie, getMethod, getQuery, setCookie, setResponseHeader, setResponseStatus } from 'h3'

const loginPath = '/__discord-auth/login'
const callbackPath = '/__discord-auth/callback'
const logoutPath = '/__discord-auth/logout'
const loginSeconds = 10 * 60
const sessionSeconds = 8 * 60 * 60
const capacity = 1024
const tokenPattern = /^[\w-]{43}$/
const snowflakePattern = /^[1-9]\d{0,19}$/

function opaqueToken() {
  return randomBytes(32).toString('base64url')
}

function digest(value: string) {
  return createHash('sha256').update(value).digest()
}

// Fixed lifetimes keep insertion order equal to expiry order.
class ExpiringTokens<T> {
  private entries = new Map<string, { expires: number, value: T }>()

  issue(value: T, seconds: number) {
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (entry.expires > now && this.entries.size < capacity)
        break
      this.entries.delete(key)
    }
    const token = opaqueToken()
    this.entries.set(digest(token).toString('hex'), { expires: now + seconds * 1000, value })
    return token
  }

  get(token?: string) {
    if (!token || !tokenPattern.test(token))
      return
    const key = digest(token).toString('hex')
    const entry = this.entries.get(key)
    if (entry && entry.expires > Date.now())
      return entry.value
    this.entries.delete(key)
  }

  revoke(token?: string) {
    if (token && tokenPattern.test(token))
      this.entries.delete(digest(token).toString('hex'))
  }
}

const logins = new ExpiringTokens<{ state: string, verifier: string, origin: string, clientId: string }>()
const sessions = new ExpiringTokens<{ userId: string, origin: string }>()

function cookies(origin: URL) {
  const secure = origin.protocol === 'https:'
  const prefix = secure ? '__Host-nuxt_discord_' : 'nuxt_discord_'
  return {
    session: `${prefix}session`,
    login: `${prefix}login`,
    options: { httpOnly: true, secure, sameSite: 'lax', path: '/' } as const,
  }
}

export function getDashboardUserId(event: H3Event, origin: URL) {
  const session = sessions.get(getCookie(event, cookies(origin).session))
  return session?.origin === origin.origin ? session.userId : undefined
}

function redirect(event: H3Event, location: string) {
  setResponseStatus(event, 303)
  setResponseHeader(event, 'location', location)
  return ''
}

function reject(event: H3Event, status: number, message: string) {
  setResponseStatus(event, status)
  return message
}

async function identifyUser(clientId: string, redirectUri: string, verifier: string, code: string) {
  const exchange = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirectUri, code_verifier: verifier, code }),
  })
  if (!exchange.ok)
    return
  const token = await exchange.json()
  if (typeof token.access_token !== 'string' || !token.access_token || token.token_type?.toLowerCase() !== 'bearer')
    return
  const response = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { authorization: `Bearer ${token.access_token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok)
    return
  const user = await response.json()
  if (typeof user.id === 'string' && snowflakePattern.test(user.id) && !user.bot)
    return user.id as string
}

export async function handleDashboardOAuth(event: H3Event, origin: URL, clientId: string) {
  const path = event.path.split('?')[0]
  if (path !== loginPath && path !== callbackPath && path !== logoutPath)
    return
  const method = path === logoutPath ? 'POST' : 'GET'
  if (getMethod(event) !== method) {
    setResponseHeader(event, 'allow', method)
    return reject(event, 405, 'Method not allowed.')
  }
  const cookie = cookies(origin)
  const browserToken = getCookie(event, cookie.login)
  if (path === logoutPath) {
    sessions.revoke(getCookie(event, cookie.session))
    logins.revoke(browserToken)
    deleteCookie(event, cookie.session, cookie.options)
    deleteCookie(event, cookie.login, cookie.options)
    return redirect(event, '/discord')
  }
  if (!snowflakePattern.test(clientId))
    return reject(event, 503, 'Discord sign-in is not configured.')

  const redirectUri = new URL(callbackPath, origin).href
  if (path === loginPath) {
    const verifier = opaqueToken()
    const state = opaqueToken()
    logins.revoke(browserToken)
    const token = logins.issue({ state, verifier, origin: origin.origin, clientId }, loginSeconds)
    setCookie(event, cookie.login, token, { ...cookie.options, maxAge: loginSeconds })
    const authorize = new URL('https://discord.com/oauth2/authorize')
    authorize.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: 'identify',
      prompt: 'consent',
      redirect_uri: redirectUri,
      state,
      code_challenge_method: 'S256',
      code_challenge: digest(verifier).toString('base64url'),
    }).toString()
    return redirect(event, authorize.href)
  }

  const login = logins.get(browserToken)
  const { state, code, error, iss } = getQuery(event)
  if (!login || login.origin !== origin.origin || login.clientId !== clientId
    || typeof state !== 'string' || !tokenPattern.test(state) || !timingSafeEqual(digest(state), digest(login.state))) {
    return reject(event, 400, 'Discord sign-in expired or could not be verified.')
  }

  // Consume before the asynchronous exchange, including when Discord declines consent.
  logins.revoke(browserToken)
  deleteCookie(event, cookie.login, cookie.options)
  if (error !== undefined || typeof code !== 'string' || !code || (iss !== undefined && iss !== 'https://discord.com'))
    return reject(event, 400, 'Discord sign-in was not completed.')
  try {
    const userId = await identifyUser(clientId, redirectUri, login.verifier, code)
    if (userId) {
      sessions.revoke(getCookie(event, cookie.session))
      const token = sessions.issue({ userId, origin: origin.origin }, sessionSeconds)
      setCookie(event, cookie.session, token, { ...cookie.options, maxAge: sessionSeconds })
      return redirect(event, '/discord')
    }
  }
  catch {
    // Provider errors can contain the authorization code or access token.
  }
  return reject(event, 502, 'Discord could not verify your sign-in.')
}
