import type { AddressInfo } from 'node:net'
import { createServer, get } from 'node:http'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import dashboardAuth from '../src/runtime/dashboard/auth'
import { getDashboardUserId } from '../src/runtime/dashboard/oauth'
import { dashboardAccessFor } from '../src/runtime/dashboard/permissions'

vi.mock('../src/runtime/dashboard/oauth', async (load) => {
  const actual = await load<typeof import('../src/runtime/dashboard/oauth')>()
  return { ...actual, getDashboardUserId: vi.fn() }
})
vi.mock('../src/runtime/dashboard/permissions', () => ({ dashboardAccessFor: vi.fn() }))

describe('private dashboard origin', () => {
  const app = createApp().use(dashboardAuth).use(defineEventHandler(() => ({ private: true })))
  const server = createServer(toNodeListener(app))
  let origin: string

  beforeAll(async () => {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('DISCORD_CLIENT_ID', '100000000000000001')
    vi.stubEnv('DISCORD_TOKEN', 'fixture-only')
    vi.stubEnv('DISCORD_DASHBOARD_ORIGIN', origin)
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))

  it.each(['/discord', '/discord/activity', '/api/discord/activity', '/api/discord/slash-command/register', '/__discord-auth/session', '/'])('requires a Discord session on %s', async (path) => {
    const response = await fetch(origin + path, { headers: { authorization: 'Basic YWRtaW46cGFzc3dvcmQ=' } })
    expect(response.status).toBe(401)
    expect(response.headers.has('www-authenticate')).toBe(false)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(dashboardAccessFor).not.toHaveBeenCalled()
  })

  it('shows sign-in when opening a direct browser link from another site', async () => {
    const headers = { 'accept': 'text/html', 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }
    // Node Fetch sets its own fetch mode. Send the actual navigation headers.
    const page = await new Promise<string>((resolve, reject) => get(`${origin}/discord`, { headers }, async (response) => {
      const chunks = []
      for await (const chunk of response)
        chunks.push(chunk.toString())
      resolve(chunks.join(''))
    }).on('error', reject))
    expect(page).toContain('/__discord-auth/login')
  })

  it('resolves permissions on the server and limits the session response to the access level', async () => {
    vi.mocked(getDashboardUserId).mockReturnValue('100000000000000002')
    vi.mocked(dashboardAccessFor).mockResolvedValue('read')
    const response = await fetch(`${origin}/__discord-auth/session`)
    expect(await response.json()).toEqual({ access: 'read' })
    expect(dashboardAccessFor).toHaveBeenCalledWith('100000000000000002', 'GET', '/__discord-auth/session')
  })

  it('denies unauthorized identities and fails closed when Discord cannot verify access', async () => {
    vi.mocked(getDashboardUserId).mockReturnValue('100000000000000002')
    vi.mocked(dashboardAccessFor).mockResolvedValue('forbidden')
    const denied = await fetch(`${origin}/discord`, { headers: { accept: 'text/html' } })
    expect(denied.status).toBe(403)
    expect(await denied.text()).toContain('/__discord-auth/logout')
    vi.mocked(dashboardAccessFor).mockResolvedValue('unavailable')
    expect((await fetch(`${origin}/api/discord/activity`)).status).toBe(503)
  })

  it('requires the dashboard origin for writes including sign-out', async () => {
    vi.mocked(getDashboardUserId).mockReturnValue('100000000000000002')
    vi.mocked(dashboardAccessFor).mockResolvedValue('manage')
    for (const path of ['/api/discord/slash-command/register', '/__discord-auth/logout']) {
      for (const headers of [{}, { origin: 'https://another.example' }, { origin, 'sec-fetch-site': 'cross-site' }] as Record<string, string>[])
        expect((await fetch(origin + path, { method: 'POST', headers })).status).toBe(403)
    }
    expect(dashboardAccessFor).not.toHaveBeenCalled()
    expect((await fetch(`${origin}/api/discord/slash-command/register`, { method: 'POST', headers: { origin } })).status).toBe(200)
  })

  it.each([
    ['DISCORD_TOKEN', ''],
    ['DISCORD_CLIENT_ID', ''],
    ['DISCORD_DASHBOARD_ORIGIN', 'http://untrusted.example'],
    ['DISCORD_DASHBOARD_ORIGIN', ''],
  ])('fails closed with an unusable %s', async (key, value) => {
    vi.stubEnv(key, value)
    expect((await fetch(origin)).status).toBe(503)
  })

  it('rejects requests to an unexpected host before starting sign-in', async () => {
    vi.stubEnv('DISCORD_DASHBOARD_ORIGIN', 'https://bot.example')
    expect((await fetch(`${origin}/__discord-auth/login`, { redirect: 'manual' })).status).toBe(403)
  })
})
