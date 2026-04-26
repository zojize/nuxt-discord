import type { TextBasedChannel } from 'discord.js'
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockedNitroApp = {
  hooks: {
    callHook: vi.fn(),
    hook: vi.fn(),
  },
}
vi.mock('nitropack/runtime', () => ({
  useNitroApp: vi.fn(() => mockedNitroApp),
  useRuntimeConfig: vi.fn(() => ({
    discord: { interactionTimeout: 0 },
  })),
}))

vi.stubEnv('DISCORD_TOKEN', 'test-token')
vi.stubEnv('DISCORD_CLIENT_ID', 'test-client-id')

const { setCurrentChannel } = await import('../src/runtime/server/utils/client')
const { useTextChannel } = await import('../src/runtime/server/utils/useTextChannel')

function mockClient(): EventEmitter {
  return new EventEmitter()
}

function mockTextChannel(overrides: Record<string, any> = {}) {
  const fakeMessage = { id: 'msg-1', edit: vi.fn(() => Promise.resolve(fakeMessage)), delete: vi.fn(() => Promise.resolve()) }
  return {
    id: 'channel-1',
    type: 0,
    guildId: 'guild-1',
    createdAt: new Date(0),
    name: 'general',
    topic: null,
    nsfw: false,
    parent: null,
    lastMessage: null,
    members: new Map(),
    send: vi.fn(() => Promise.resolve(fakeMessage)),
    isTextBased: () => true,
    client: mockClient(),
    ...overrides,
  } as unknown as TextBasedChannel & { client: EventEmitter, send: ReturnType<typeof vi.fn> }
}

describe('useTextChannel', () => {
  beforeEach(() => {
    setCurrentChannel(null)
  })

  describe('resolution', () => {
    it('uses the explicit instance when passed a channel object', () => {
      const ch = mockTextChannel({ id: 'explicit-1' })
      const result = useTextChannel(ch)
      expect(result.id).toBe('explicit-1')
    })

    it('uses currentChannel when no arg is passed', () => {
      const ch = mockTextChannel({ id: 'ambient-1' })
      setCurrentChannel(ch)
      const result = useTextChannel()
      expect(result.id).toBe('ambient-1')
    })

    it('throws a clear error when no channel is available', () => {
      setCurrentChannel(null)
      expect(() => useTextChannel()).toThrow(/no current channel/i)
    })

    it('throws when the resolved channel is not text-based', () => {
      const ch = { id: 'voice', isTextBased: () => false } as any
      expect(() => useTextChannel(ch)).toThrow(/not a text channel/i)
    })

    it('throws when passed a string ID (not yet implemented)', () => {
      expect(() => useTextChannel('123456789')).toThrow(/not yet implemented/i)
    })
  })

  describe('static properties', () => {
    it('exposes id, type, guildId, createdAt, raw', () => {
      const ch = mockTextChannel({
        id: 'ch-x',
        type: 0,
        guildId: 'guild-x',
        createdAt: new Date(123),
      })
      const result = useTextChannel(ch)
      expect(result.id).toBe('ch-x')
      expect(result.type).toBe(0)
      expect(result.guildId).toBe('guild-x')
      expect(result.createdAt).toEqual(new Date(123))
      expect(result.raw).toBe(ch)
    })
  })
})
