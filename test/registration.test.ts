import type { APIApplicationCommand, REST, RESTPostAPIApplicationCommandsJSONBody } from 'discord.js'
import type { SlashCommandRuntime } from '../src/types'
import { ApplicationCommandOptionType } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { CommandRegistration, planRegistrations } from '../src/runtime/registration'

const appId = '100000000000000001'
const guildId = '100000000000000002'
const globalRoute = `/applications/${appId}/commands`
const guildRoute = `/applications/${appId}/guilds/${guildId}/commands`
function command(name: string, guilds?: true | string[]): SlashCommandRuntime {
  return { name, description: 'Command description', guilds, options: [], path: `${name}.ts`, parents: [], execute: () => name }
}
function setup() {
  const routes = new Map<string, APIApplicationCommand[]>()
  const stored = new Set<string>()
  const store = {
    load: async () => [...stored],
    async save(values: string[]) {
      stored.clear()
      values.forEach(value => stored.add(value))
    },
  }
  const get = vi.fn(async (route: string) => routes.get(route) ?? [])
  const put = vi.fn(async (route: string, { body }: { body: RESTPostAPIApplicationCommandsJSONBody[] }) => {
    const remote = JSON.parse(JSON.stringify(body)).map((cmd: APIApplicationCommand, i: number) => ({
      ...cmd,
      id: String(i + 1),
      type: cmd.type ?? 1,
      options: cmd.options ?? [],
      ...route === globalRoute ? { contexts: cmd.contexts ?? [0, 1, 2] } : {},
    }))
    routes.set(route, remote)
    return remote
  })
  const onError = vi.fn()
  const connect = () => new CommandRegistration({ get, put } as unknown as REST, appId, store, onError)
  return { registry: connect(), connect, put, get, routes, onError }
}

describe('command registration', () => {
  it('uses the same schema for registration and diff, including zero bounds and groups', async () => {
    const { registry, put, get } = setup()
    const add = command('add', true)
    add.options = [{ name: 'a', varname: 'a', type: ApplicationCommandOptionType.Number, description: 'Value', required: true, min: 0, max: 0, hasAutocomplete: false }]
    const group = command('channel')
    group.subcommands = [{ ...command('members'), parents: ['channel'], subcommands: [{ ...add, parents: ['channel', 'members'], subcommands: [] }] }]
    const plan = planRegistrations([group, add], [], [guildId])
    const results = await registry.sync(plan)
    expect(results.map(result => result.scope)).toEqual(['global', guildId])
    expect(put).toHaveBeenCalledWith(guildRoute, { body: [expect.objectContaining({ options: [expect.objectContaining({ min_value: 0, max_value: 0 })] })] })
    const diff = await registry.diff(plan)
    expect(diff.synced.map(({ local }) => [local.name, local.scope])).toEqual([['channel', 'global'], ['channel members', 'global'], ['channel members add', 'global'], ['add', guildId]])
    expect(diff.changed).toHaveLength(0)
    get.mockClear()
    put.mockClear()
    add.execute = () => 'New reply text'
    await registry.sync(planRegistrations([group, add], [], [guildId]), true)
    expect(get).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    add.options[0]!.description = 'New option description'
    await registry.sync(planRegistrations([group, add], [], [guildId]), true)
    expect(put).toHaveBeenCalledTimes(2)
  })

  it('registers channel options and required-first wire order while preserving function order', () => {
    const cmd = command('search', true)
    cmd.contexts = [0]
    cmd.options = [
      { name: 'limit', varname: 'limit', description: 'Count', required: false, type: ApplicationCommandOptionType.Number, hasAutocomplete: false },
      { name: 'channel', varname: 'channel', description: 'Channel', required: true, type: ApplicationCommandOptionType.Channel, hasAutocomplete: false },
      { name: 'query', varname: 'query', description: 'Text', required: false, type: ApplicationCommandOptionType.String, hasAutocomplete: true },
    ]
    const plan = planRegistrations([cmd], [], [guildId])
    const body = plan.scopes.get(guildId)![0]!.body
    expect('contexts' in body && body.contexts !== undefined).toBe(false)
    expect(body).toMatchObject({ options: [
      { name: 'channel', type: 7, required: true },
      { name: 'limit', type: 10, required: false },
      { name: 'query', autocomplete: true },
    ] })
    expect(cmd.options.map(option => option.name)).toEqual(['limit', 'channel', 'query'])
  })

  it('registers user and message menus in their own scopes and preserves guilds when configuration is missing', async () => {
    const { registry, connect, routes, put } = setup()
    const menu = { type: 'user', name: 'Inspect', guilds: true, execute: () => {} } as const
    const other = { type: 'message' as const, name: 'Inspect', guilds: [guildId], execute: () => {} }
    await registry.sync(planRegistrations([command('a', true)], [menu, other], [guildId]))
    expect(routes.get(guildRoute)?.map(cmd => cmd.type)).toEqual([1, 2, 3])
    expect(routes.has(globalRoute)).toBe(false)
    put.mockClear()
    const missing = planRegistrations([command('global')], [menu, other], [])
    const report = await connect().sync(missing)
    expect(report.find(r => r.error)?.error).toContain('Inspect')
    expect(put.mock.calls.map(([route]) => route)).toEqual([globalRoute])
    expect(routes.get(guildRoute)).toHaveLength(3)
    expect((await connect().diff(missing)).removed).toEqual([])
  })

  it('checks Discord limits per scope and rejects duplicate option names before a request', async () => {
    const { registry, put } = setup()
    const menus = Array.from({ length: 16 }, (_, n) => ({ name: `Action ${n}`, type: 'message' as const, execute() {} }))
    const [over] = await registry.sync(planRegistrations([], menus, []))
    expect(over?.error).toMatch(/15 Message/)
    expect(put).not.toHaveBeenCalled()
    menus.pop()
    expect((await registry.sync(planRegistrations([], menus, [])))[0]?.error).toBeUndefined()

    const cmd = command('too-many')
    const option = { name: 'choice', varname: 'choice', description: 'Choose', required: true, type: ApplicationCommandOptionType.String as const, hasAutocomplete: false }
    cmd.options = Array.from({ length: 25 }, (_, n) => ({ ...option, name: `p${n}` }))
    expect(() => planRegistrations([cmd], [], [])).not.toThrow()
    cmd.options.push({ ...option, name: 'extra' })
    expect(() => planRegistrations([cmd], [], [])).toThrow()
    cmd.options = [option, { ...option }]
    expect(() => planRegistrations([cmd], [], [])).toThrow(/Duplicate option/)
    cmd.options = [{ ...option, hasAutocomplete: true, choices: [{ name: 'A', value: 'a' }] }]
    expect(() => planRegistrations([cmd], [], [])).toThrow(/mutually exclusive/)
  })

  it('removes the final command only in previously owned scopes, including after restart', async () => {
    const { registry, connect, put } = setup()
    const empty = planRegistrations([], [], [])
    await registry.sync(empty)
    expect(put).not.toHaveBeenCalled()
    await registry.sync(planRegistrations([command('a', [guildId])], [], []))
    put.mockClear()
    await connect().sync(empty)
    expect(put.mock.calls).toEqual([[guildRoute, { body: [] }]])
    put.mockClear()
    await connect().sync(empty)
    expect(put).not.toHaveBeenCalled()
  })

  it('reports partial writes and retries failed scopes without resending successful ones', async () => {
    const { registry, put, onError } = setup()
    const plan = planRegistrations([command('a'), command('b', true)], [], [guildId])
    put.mockRejectedValueOnce(new Error('Discord unavailable'))
    const results = await registry.sync(plan)
    expect(results[0]).toMatchObject({ scope: 'global', error: 'Discord unavailable' })
    expect(results[1]?.commands).toHaveLength(1)
    expect(onError).toHaveBeenCalledOnce()
    put.mockClear()
    expect(await registry.sync(plan, true)).toHaveLength(1)
    expect(put.mock.calls[0]?.[0]).toBe(globalRoute)
  })

  it('reports unassigned guild commands and refuses conflicting payloads', async () => {
    const { registry, put } = setup()
    const plan = planRegistrations([command('unassigned', true), command('same'), command('same')], [], [])
    expect((await registry.sync(plan)).map(result => result.error)).toEqual([expect.stringContaining('DISCORD_GUILD_ID'), expect.stringContaining('Duplicate')])
    expect(put).not.toHaveBeenCalled()
    expect((await registry.diff(plan)).conflict).toHaveLength(3)
  })
})
