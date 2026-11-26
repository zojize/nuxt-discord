import { createHash } from 'node:crypto'
import { createApp, defineEventHandler, toWebHandler } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDashboardUserId, handleDashboardOAuth } from '../src/runtime/dashboard/oauth'

const origin = new URL('https://dashboard.example')
const clientId = '100000000000000000'
const userId = '200000000000000000'
const provider = vi.fn<typeof fetch>()

function server(base = origin) {
  const request = toWebHandler(createApp().use(defineEventHandler(async (event) => {
    const handled = await handleDashboardOAuth(event, base, clientId)
    return handled ?? { userId: getDashboardUserId(event, base) ?? null }
  })))
  return (path: string, cookie = '', method = 'GET') => request(new Request(new URL(path, base), { method, headers: { cookie } }))
}

const request = server()

function cookie(response: Response, name: string) {
  const value = response.headers.getSetCookie().find(value => value.startsWith(name))
  expect(value).toBeDefined()
  return value!.split(';')[0]!
}

async function login() {
  const response = await request('/__discord-auth/login')
  const authorize = new URL(response.headers.get('location')!)
  const browser = cookie(response, '__Host-nuxt_discord_login=')
  const state = authorize.searchParams.get('state')!
  return { response, authorize, browser, state }
}

function callback(state: string, browser: string, code = 'fixture-code') {
  return request(`/__discord-auth/callback?code=${code}&state=${state}&iss=https%3A%2F%2Fdiscord.com`, browser)
}

function identified() {
  provider.mockResolvedValueOnce(Response.json({ access_token: 'fake-access', token_type: 'Bearer' }))
  provider.mockResolvedValueOnce(Response.json({ id: userId }))
}

describe('discord dashboard sign-in', () => {
  beforeEach(() => vi.stubGlobal('fetch', provider.mockReset()))
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('requests identify with PKCE and gives the browser only an opaque session', async () => {
    const { response, authorize, browser, state } = await login()
    expect(response.status).toBe(303)
    expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/i)
    expect(response.headers.get('set-cookie')).toMatch(/Secure/i)
    expect(response.headers.get('set-cookie')).toMatch(/SameSite=Lax/i)
    expect(authorize.origin + authorize.pathname).toBe('https://discord.com/oauth2/authorize')
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      scope: 'identify',
      client_id: clientId,
      redirect_uri: `${origin.origin}/__discord-auth/callback`,
      response_type: 'code',
      code_challenge_method: 'S256',
    })
    expect(state).toMatch(/^[\w-]{43}$/)
    expect(browser).not.toContain(state)
    identified()
    const signedIn = await callback(state, browser)
    expect(signedIn.status).toBe(303)
    expect(signedIn.headers.get('location')).toBe('/discord')
    const [tokenEndpoint, tokenRequest] = provider.mock.calls[0]!
    expect(tokenEndpoint).toBe('https://discord.com/api/v10/oauth2/token')
    expect(tokenRequest).toMatchObject({ method: 'POST', redirect: 'error' })
    const body = tokenRequest!.body as URLSearchParams
    expect(Object.fromEntries(body)).toMatchObject({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: authorize.searchParams.get('redirect_uri'),
      code: 'fixture-code',
    })
    expect(createHash('sha256').update(body.get('code_verifier')!).digest('base64url')).toBe(authorize.searchParams.get('code_challenge'))
    expect(provider.mock.calls[1]).toMatchObject(['https://discord.com/api/v10/users/@me', { headers: { authorization: 'Bearer fake-access' }, redirect: 'error' }])
    const session = cookie(signedIn, '__Host-nuxt_discord_session=')
    expect(session).toMatch(/^__Host-nuxt_discord_session=[\w-]{43}$/)
    expect(signedIn.headers.get('set-cookie')).not.toContain('fake-access')
    expect(await (await request('/discord', session)).json()).toEqual({ userId })
    expect(await (await server(new URL('https://other.example'))('/discord', session)).json()).toEqual({ userId: null })
    expect((await request('/__discord-auth/logout', session, 'POST')).headers.get('location')).toBe('/discord')
    expect(await (await request('/discord', session)).json()).toEqual({ userId: null })
  })

  it('requires the initiating browser and consumes a valid state before exchanging its code', async () => {
    const first = await login()
    const second = await login()
    expect((await callback(first.state, second.browser)).status).toBe(400)
    expect((await callback(first.state, '')).status).toBe(400)
    expect(provider).not.toHaveBeenCalled()
    identified()
    const pair = await Promise.all([callback(first.state, first.browser), callback(first.state, first.browser)])
    expect(pair.map(x => x.status).sort()).toEqual([303, 400])
    expect(provider).toHaveBeenCalledTimes(2)
  })

  it('expires unfinished logins and logged-in sessions on the server', async () => {
    let now = Date.now()
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const first = await login()
    now += 10 * 60 * 1000
    expect((await callback(first.state, first.browser)).status).toBe(400)
    const current = await login()
    identified()
    const session = cookie(await callback(current.state, current.browser), '__Host-nuxt_discord_session=')
    now += 8 * 60 * 60 * 1000
    expect(await (await request('/discord', session)).json()).toEqual({ userId: null })
  })

  it('handles declined consent and provider errors without issuing a session or exposing provider bodies', async () => {
    const first = await login()
    const denied = await request(`/__discord-auth/callback?state=${first.state}&error=access_denied`, first.browser)
    expect(denied.status).toBe(400)
    expect((await callback(first.state, first.browser)).status).toBe(400)
    expect(provider).not.toHaveBeenCalled()
    const next = await login()
    provider.mockResolvedValueOnce(new Response('private provider error', { status: 400 }))
    const failed = await callback(next.state, next.browser)
    expect(failed.status).toBe(502)
    expect(await failed.text()).not.toMatch(/private provider error|fixture-code/)
    expect(failed.headers.get('set-cookie')).not.toContain('_session=')
  })

  it('requires GET for the login and callback, POST for logout, and supports HTTP loopback cookies', async () => {
    for (const path of ['login', 'callback'])
      expect((await request(`/__discord-auth/${path}`, '', 'POST')).status).toBe(405)
    expect((await request('/__discord-auth/logout')).status).toBe(405)
    const local = await server(new URL('http://127.0.0.1:3434'))('/__discord-auth/login')
    expect(local.headers.get('set-cookie')).toMatch(/^nuxt_discord_login=[\w-]{43};/)
    expect(local.headers.get('set-cookie')).not.toMatch(/; Secure/)
  })
})
