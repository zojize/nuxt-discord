import type { TextBasedChannel } from 'discord.js'
import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

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

  describe('reactive properties', () => {
    function mockTextChannelWithClient(overrides: Record<string, any> = {}) {
      const client = mockClient()
      const channel = mockTextChannel({ ...overrides, client })
      return { channel, client: (channel as any).client as EventEmitter }
    }

    it('exposes name as a reactive ref that updates on ChannelUpdate', () => {
      const scope = effectScope()
      scope.run(() => {
        const { channel, client } = mockTextChannelWithClient({ id: 'ch-1', name: 'old-name' })
        const ch = useTextChannel(channel)
        expect(ch.name.value).toBe('old-name')

        const updated = { ...channel, id: 'ch-1', name: 'new-name' }
        client.emit('channelUpdate', channel, updated)

        expect(ch.name.value).toBe('new-name')
      })
      scope.stop()
    })

    it('does not update name when ChannelUpdate fires for a different channel', () => {
      const scope = effectScope()
      scope.run(() => {
        const { channel, client } = mockTextChannelWithClient({ id: 'ch-1', name: 'one' })
        const ch = useTextChannel(channel)
        const otherChannel = { id: 'ch-2', name: 'two' }
        client.emit('channelUpdate', otherChannel, { ...otherChannel, name: 'two-renamed' })
        expect(ch.name.value).toBe('one')
      })
      scope.stop()
    })

    it('exposes topic, nsfw, parent as reactive refs initialised from the channel', () => {
      const scope = effectScope()
      scope.run(() => {
        const { channel } = mockTextChannelWithClient({
          topic: 'old topic',
          nsfw: false,
          parent: null,
        })
        const ch = useTextChannel(channel)
        expect(ch.topic.value).toBe('old topic')
        expect(ch.nsfw.value).toBe(false)
        expect(ch.parent.value).toBe(null)
      })
      scope.stop()
    })

    it('updates topic, nsfw, parent on ChannelUpdate', () => {
      const scope = effectScope()
      scope.run(() => {
        const { channel, client } = mockTextChannelWithClient({
          id: 'ch-1',
          topic: 'before',
          nsfw: false,
        })
        const ch = useTextChannel(channel)
        const updated = { id: 'ch-1', topic: 'after', nsfw: true, name: 'general', parent: { id: 'cat-1' } }
        client.emit('channelUpdate', channel, updated)
        expect(ch.topic.value).toBe('after')
        expect(ch.nsfw.value).toBe(true)
        expect(ch.parent.value).toEqual({ id: 'cat-1' })
      })
      scope.stop()
    })

    it('exposes members as a reactive ref that updates on member events', () => {
      const scope = effectScope()
      scope.run(() => {
        const initialMembers = new Map([['user-1', { id: 'user-1' }]])
        const { channel, client } = mockTextChannelWithClient({
          guildId: 'guild-1',
          members: initialMembers,
        })
        const ch = useTextChannel(channel)
        expect(ch.members.value.size).toBe(1)

        const updatedMembers = new Map([
          ['user-1', { id: 'user-1' }],
          ['user-2', { id: 'user-2' }],
        ])
        ;(channel as any).members = updatedMembers
        client.emit('guildMemberAdd', { guild: { id: 'guild-1' }, id: 'user-2' })

        expect(ch.members.value.size).toBe(2)
      })
      scope.stop()
    })

    it('does not refresh members for a different guild', () => {
      const scope = effectScope()
      scope.run(() => {
        const initialMembers = new Map([['user-1', { id: 'user-1' }]])
        const { channel, client } = mockTextChannelWithClient({
          guildId: 'guild-1',
          members: initialMembers,
        })
        const ch = useTextChannel(channel)
        ;(channel as any).members = new Map([['user-1', { id: 'user-1' }], ['user-x', { id: 'user-x' }]])
        client.emit('guildMemberAdd', { guild: { id: 'guild-2' }, id: 'user-x' })
        expect(ch.members.value.size).toBe(1)
      })
      scope.stop()
    })

    it('removes channelUpdate listener when scope is disposed', () => {
      const scope = effectScope()
      let emitter!: EventEmitter
      scope.run(() => {
        const { channel, client } = mockTextChannelWithClient({ name: 'before' })
        emitter = client
        useTextChannel(channel)
      })
      expect(emitter.listenerCount('channelUpdate')).toBeGreaterThan(0)
      scope.stop()
      expect(emitter.listenerCount('channelUpdate')).toBe(0)
    })
  })
})
