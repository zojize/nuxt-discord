import { EventEmitter } from 'node:events'
import { Events } from 'discord.js'
import { beforeEach, expect, it, vi } from 'vitest'
import { DiscordClient } from '../src/runtime/server/utils/client'

const mocks = vi.hoisted(() => ({
  login: vi.fn<() => Promise<string>>(),
  destroy: vi.fn<() => Promise<void>>(),
  hook: vi.fn(),
  clients: [] as EventEmitter[],
}))
vi.mock('discord.js', async (original) => {
  const sdk = await original<typeof import('discord.js')>()
  return {
    ...sdk,
    Client: class extends EventEmitter {
      login = mocks.login
      destroy = mocks.destroy
      isReady = () => false
      constructor() {
        super()
        mocks.clients.push(this)
      }
    },
  }
})
vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: () => ({ discord: {} }),
  useNitroApp: () => ({ hooks: { hook: vi.fn(), callHook: mocks.hook } }),
}))
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('DISCORD_CLIENT_ID', '100000000000000001')
  vi.stubEnv('DISCORD_TOKEN', 'offline')
  mocks.clients.length = 0
  mocks.login.mockResolvedValue('offline')
  mocks.destroy.mockResolvedValue(undefined)
})

it('keeps one gateway client when start is called during a reconnect', async () => {
  const bot = new DiscordClient()
  const started = bot.start({ intents: [] })
  await vi.waitFor(() => expect(mocks.login).toHaveBeenCalledOnce())
  mocks.clients[0]!.emit(Events.ClientReady, mocks.clients[0])
  await started
  void bot.start({ intents: [] })
  await Promise.resolve()
  expect(mocks.login).toHaveBeenCalledOnce()
  await bot.stop()
})

it('cancels startup during configuration and allows a later login', async () => {
  const bot = new DiscordClient()
  const config = Promise.withResolvers<void>()
  mocks.hook.mockReturnValueOnce(config.promise)
  const started = bot.start({ intents: [] })
  const result = started.catch((error: Error) => error)
  await bot.stop()
  config.resolve()
  await Promise.resolve()
  expect(mocks.login).not.toHaveBeenCalled()
  expect(await result).toBeInstanceOf(Error)
  const restarted = bot.start({ intents: [] })
  await vi.waitFor(() => expect(mocks.login).toHaveBeenCalledOnce())
  mocks.clients[0]!.emit(Events.ClientReady, mocks.clients[0])
  await restarted
  await bot.stop()
})

it('cancels a pending ready event and serializes restart with destruction', async () => {
  const bot = new DiscordClient()
  const started = bot.start({ intents: [] })
  const result = started.catch((error: Error) => error)
  await vi.waitFor(() => expect(mocks.login).toHaveBeenCalledOnce())
  const teardown = Promise.withResolvers<void>()
  mocks.destroy.mockReturnValueOnce(teardown.promise)
  const stopped = bot.stop()
  const restarted = bot.start({ intents: [] })
  expect(mocks.login).toHaveBeenCalledOnce()
  teardown.resolve()
  await stopped
  await vi.waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(2))
  expect(await result).toBeInstanceOf(Error)
  mocks.clients[1]!.emit(Events.ClientReady, mocks.clients[1])
  await restarted
  await bot.stop()
})
