import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const appId = '100000000000000001'
const owner = '100000000000000002'
const outsider = '100000000000000003'
const admin = '100000000000000004'
const developer = '100000000000000005'
const reader = '100000000000000006'
const invited = '100000000000000007'
const unknown = '100000000000000008'
const token = 'synthetic-bot-credential'
const diff = '/api/discord/slash-command/remote-diff'
const register = '/api/discord/slash-command/register'
const preview = '/api/discord/slash-command/test'
const personal = { id: appId, owner: { id: owner }, team: null }
const group = {
  id: appId,
  owner: { id: outsider },
  team: {
    owner_user_id: owner,
    members: [
      { user: { id: admin }, membership_state: 2, role: 'admin' },
      { user: { id: developer }, membership_state: 2, role: 'developer' },
      { user: { id: reader }, membership_state: 2, role: 'read_only' },
      { user: { id: invited }, membership_state: 1, role: 'admin' },
      { user: { id: unknown }, membership_state: 2, role: 'unrecognized' },
    ],
  },
}

describe('hosted dashboard application permissions', () => {
  const get = vi.fn<typeof fetch>()
  let access: typeof import('../src/runtime/dashboard/permissions').dashboardAccessFor
  let metadata: unknown
  beforeEach(async () => {
    vi.resetModules()
    access = (await import('../src/runtime/dashboard/permissions')).dashboardAccessFor
    vi.stubEnv('DISCORD_TOKEN', token)
    vi.stubEnv('DISCORD_CLIENT_ID', appId)
    metadata = group
    get.mockReset().mockImplementation(async () => Response.json(metadata))
    vi.stubGlobal('fetch', get)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('grants the personal owner control based on the bot-authenticated current application', async () => {
    metadata = personal
    expect(await access(owner, 'POST', register)).toBe('manage')
    expect(await access(outsider, 'GET', '/discord')).toBe('forbidden')
    expect(get).toHaveBeenCalledExactlyOnceWith('https://discord.com/api/v10/applications/@me', expect.objectContaining({
      headers: { Authorization: `Bot ${token}` },
      redirect: 'error',
      cache: 'no-store',
    }))
  })

  it('uses the team owner and accepted roles for a team application', async () => {
    for (const user of [owner, admin, developer])
      expect(await access(user, 'POST', preview)).toBe('manage')
    for (const user of [outsider, invited, unknown])
      expect(await access(user, 'GET', '/discord')).toBe('forbidden')
  })

  it('allows read-only members to navigate and query the registry', async () => {
    for (const path of ['/', '/favicon.ico', '/discord', '/discord/slash-commands', '/discord/context-menus', '/discord/listeners', '/discord/activity', '/__discord-auth/session', '/api/discord/activity', '/api/discord/catalog', '/api/discord/slash-command/all', '/api/discord/slash-command/remote-all', '/_nuxt/a-B.js', '/_nuxt/builds/meta/test.json', '/api/_nuxt_icon/lucide.json']) {
      for (const method of ['HEAD', 'GET'])
        expect(await access(reader, method, path), `${method} ${path}`).toBe('read')
    }
    expect(await access(reader, 'POST', diff)).toBe('read')
    expect(get).toHaveBeenCalledOnce()
  })

  it('denies actions, unknown routes and noncanonical asset paths to readers', async () => {
    for (const path of [register, preview, '/api/discord/slash-command/autocomplete', '/api/private', '/discord/unknown', '/_nuxt/../api/private', '/_nuxt/%2e%2e/api/private', '/_nuxt/./x.js', '/_nuxt//x.js', '/_nuxt/x\\private', '/api/_nuxt_icon/lucide/other']) {
      for (const method of ['GET', 'HEAD', 'POST'])
        expect(await access(reader, method, path), `${method} ${path}`).toBe('forbidden')
    }
    for (const [method, path] of [['POST', `${diff}/`], ['PUT', diff], ['DELETE', '/discord'], ['OPTIONS', '/api/discord/catalog']] as const)
      expect(await access(reader, method, path)).toBe('forbidden')
  })

  it('checks every action afresh and immediately applies a revocation to cached reads', async () => {
    expect(await access(admin, 'GET', '/discord')).toBe('manage')
    metadata = { ...group, team: { ...group.team, members: [] } }
    expect(await access(admin, 'POST', register)).toBe('forbidden')
    expect(await access(admin, 'GET', '/discord')).toBe('forbidden')
    expect(get).toHaveBeenCalledTimes(2)
    expect(await access(owner, 'POST', register)).toBe('manage')
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('fails closed during an outage after a successful read and recovers on a new lookup', async () => {
    expect(await access(owner, 'GET', '/discord')).toBe('manage')
    get.mockResolvedValueOnce(new Response(null, { status: 429 })).mockRejectedValueOnce(new Error('fixture transport details'))
    expect(await access(owner, 'POST', register)).toBe('unavailable')
    expect(await access(owner, 'GET', '/discord')).toBe('unavailable')
    expect(await access(owner, 'GET', '/discord')).toBe('manage')
  })

  it('requires usable application and ownership metadata, and distinguishes an empty member list', async () => {
    for (const invalid of [
      null,
      { ...personal, id: '123' },
      { id: appId, owner: { id: owner } },
      { id: appId, team: null },
      { ...group, team: { owner_user_id: owner } },
    ]) {
      metadata = invalid
      expect(await access(owner, 'POST', register)).toBe('unavailable')
    }
    metadata = { ...group, team: { ...group.team, members: [] } }
    expect(await access(owner, 'GET', '/discord')).toBe('manage')
    expect(await access(admin, 'GET', '/discord')).toBe('forbidden')
  })

  it('shares concurrent reads for fifteen seconds and isolates bot configuration changes', async () => {
    vi.useFakeTimers()
    const now = Date.now()
    expect(await Promise.all([access(admin, 'GET', '/discord'), access(reader, 'POST', diff)])).toEqual(['manage', 'read'])
    expect(get).toHaveBeenCalledOnce()
    metadata = personal
    vi.setSystemTime(now + 15_001)
    expect(await access(admin, 'GET', '/discord')).toBe('forbidden')
    expect(get).toHaveBeenCalledTimes(2)
    vi.stubEnv('DISCORD_TOKEN', 'another-synthetic-token')
    expect(await access(owner, 'GET', '/discord')).toBe('manage')
    expect(get).toHaveBeenCalledTimes(3)
    vi.stubEnv('DISCORD_CLIENT_ID', '123')
    expect(await access(owner, 'GET', '/discord')).toBe('unavailable')
    expect(get).toHaveBeenCalledTimes(4)
  })

  it('does not look up an unusable identity or incomplete bot configuration', async () => {
    expect(await access('', 'GET', '/discord')).toBe('forbidden')
    vi.stubEnv('DISCORD_TOKEN', '')
    expect(await access(owner, 'GET', '/discord')).toBe('unavailable')
    expect(get).not.toHaveBeenCalled()
  })
})
