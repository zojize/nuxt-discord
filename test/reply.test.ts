import type { ChatInputCommandInteraction } from 'discord.js'
import type { DiscordClient } from '~/src/runtime/server/utils/client'
import { MessageFlags } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { reply } from '../src/runtime/server/utils/reply'

declare module 'vue' {
  interface EffectScope {
    on: () => void
    off: () => void
    _active: boolean
  }
}

describe('reply', () => {
  const MockClient = vi.fn() as { new (): DiscordClient }
  const mockEditFunction = vi.fn()
  const mockInteraction = () => {
    const mock = {
      reply: vi.fn(() => Promise.resolve({ edit: mockEditFunction })),
      editReply: vi.fn(() => Promise.resolve()),
      followUp: vi.fn(() => Promise.resolve({ edit: mockEditFunction })),
    }
    return [mock as unknown as ChatInputCommandInteraction, mock] as const
  }

  const scope = effectScope()

  beforeEach(() => {
    vi.clearAllMocks()
    scope.on()
    scope._active = true
  })

  afterEach(() => {
    scope.stop()
  })

  it('should return a reply function', () => {
    const replyFunction = reply('Hello, world!')
    expect(replyFunction).toBeInstanceOf(Function)
  })

  it('should reply with the correct content', async () => {
    const [interaction, mock] = mockInteraction()
    const client = new MockClient()
    reply('Hello, world!').call(client, interaction, client)
    expect(mock.reply).toHaveBeenCalledExactlyOnceWith({
      content: 'Hello, world!',
    })
  })

  it('should reply with ephemeral flag', async () => {
    const [interaction, mock] = mockInteraction()
    const client = new MockClient()
    reply.ephemeral('This is ephemeral!').call(client, interaction, client)
    expect(mock.reply).toHaveBeenCalledExactlyOnceWith({
      content: 'This is ephemeral!',
      flags: MessageFlags.Ephemeral,
    })
  })

  it('should edit when deferred or replied', async () => {
    const [interaction, mock] = mockInteraction()
    interaction.deferred = true
    const client = new MockClient()
    reply('This is a deferred reply!').call(client, interaction, client)
    expect(mock.editReply).toHaveBeenCalledExactlyOnceWith({
      content: 'This is a deferred reply!',
    })
  })

  it('should handle files in reply', async () => {
    const [interaction, mock] = mockInteraction()
    const client = new MockClient()
    const file = 'file.txt'
    // @ts-expect-error - this shouldn't error
    reply.file(file).call(client, interaction, client)
    expect(mock.reply).toHaveBeenCalledExactlyOnceWith({
      files: [file],
    })
  })

  it('should handle multiple files and content', async () => {
    const [interaction, mock] = mockInteraction()
    const client = new MockClient()
    const files = ['file1.txt', 'file2.txt', 'file3.txt', 'file4.txt']
    const [f1, f2, ...rest] = files
    reply.file(f1).file(f2).files(rest).send('Lots of files').call(client, interaction, client)
    expect(mock.reply).toHaveBeenCalledExactlyOnceWith({
      content: 'Lots of files',
      files,
    })
  })

  it('should edit a reactive reply', async () => {
    const [interaction, mock] = mockInteraction()
    const client = new MockClient()
    const content = ref('This is a reply!')
    reply(content).call(client, interaction, client)
    expect(mock.reply).toHaveBeenCalledExactlyOnceWith({
      content: 'This is a reply!',
    })
    content.value = 'Updated reply!'
    await expect.poll(() => mockEditFunction).toHaveBeenCalledExactlyOnceWith({
      content: 'Updated reply!',
    })
  })

  it('should edit a reactive file reply', async () => {
    const [interaction, mock] = mockInteraction()
    const client = new MockClient()
    const file = ref('file.txt')
    // @ts-expect-error - this shouldn't error
    reply.file(file).call(client, interaction, client)
    expect(mock.reply).toHaveBeenCalledExactlyOnceWith({
      files: ['file.txt'],
    })
    file.value = 'updated-file.txt'
    await expect.poll(() => mockEditFunction).toHaveBeenCalledExactlyOnceWith({
      files: ['updated-file.txt'],
    })
  })
})
