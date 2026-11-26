import type { AddressInfo } from 'node:net'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import dashboardAuth from '../src/runtime/dashboard/auth'

describe('private dashboard origin', () => {
  const app = createApp().use(dashboardAuth).use(defineEventHandler(() => ({ private: true })))
  const server = createServer(toNodeListener(app))
  const password = 'test-operator'
  const authorization = `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`
  let origin: string

  beforeAll(async () => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  beforeEach(() => {
    vi.stubEnv('DISCORD_DASHBOARD_PASSWORD_SHA256', createHash('sha256').update(password).digest('hex'))
    vi.stubEnv('DISCORD_DASHBOARD_ORIGIN', origin)
  })

  afterEach(() => vi.unstubAllEnvs())
  afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))

  it.each(['/discord', '/discord/activity', '/api/discord/activity', '/api/discord/slash-command/register', '/'])('challenges anonymous requests to %s', async (path) => {
    const response = await fetch(origin + path)
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('Basic realm=')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('only accepts the configured administrator credential', async () => {
    for (const value of ['admin:wrong', `another:${password}`]) {
      const headers = { authorization: `Basic ${Buffer.from(value).toString('base64')}` }
      expect((await fetch(origin, { headers })).status).toBe(401)
    }
    expect(await (await fetch(origin, { headers: { authorization } })).json()).toEqual({ private: true })
  })

  it('allows signing in from a direct browser link', async () => {
    const headers = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
    expect((await fetch(`${origin}/discord`, { headers })).status).toBe(401)
    expect((await fetch(`${origin}/discord`, { headers: { ...headers, authorization } })).status).toBe(200)
  })

  it('requires the dashboard origin for changes', async () => {
    const url = `${origin}/api/discord/slash-command/register`
    for (const headers of [{}, { origin: 'https://elsewhere.example' }, { origin, 'sec-fetch-site': 'cross-site' }] as Record<string, string>[]) {
      expect((await fetch(url, { method: 'POST', headers: { authorization, ...headers } })).status).toBe(403)
    }
    expect((await fetch(url, { method: 'POST', headers: { authorization, origin } })).status).toBe(200)
  })

  it.each([
    ['DISCORD_DASHBOARD_PASSWORD_SHA256', ''],
    ['DISCORD_DASHBOARD_PASSWORD_SHA256', 'invalid'],
    ['DISCORD_DASHBOARD_ORIGIN', 'http://untrusted.example'],
    ['DISCORD_DASHBOARD_ORIGIN', ''],
  ])('fails closed with an unusable %s', async (key, value) => {
    vi.stubEnv(key, value)
    expect((await fetch(origin, { headers: { authorization } })).status).toBe(503)
  })

  it('checks the browser-facing host even for an authenticated read', async () => {
    vi.stubEnv('DISCORD_DASHBOARD_ORIGIN', 'https://bot.example')
    expect((await fetch(origin, { headers: { authorization } })).status).toBe(403)
  })
})
