import type { ChatInputCommandInteraction } from 'discord.js'
import { MessageFlags } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { reply } from '../src/runtime/server/utils/reply'

describe('reply', () => {
  const MockClient = vi.fn()
  const mockInteraction = () => {
    const mock = {
      reply: vi.fn(),
      editReply: vi.fn(),
    }
    return [mock as unknown as ChatInputCommandInteraction, mock] as const
  }

  it('should return a reply function', () => {
    const replyFunction = reply('Hello, world!')
    expect(replyFunction).toBeInstanceOf(Function)
  })

  it('should reply with the correct content', async () => {
    const [interaction, mock] = mockInteraction()
    const client = new MockClient()
    reply('Hello, world!').call(client, interaction as unknown as ChatInputCommandInteraction, client)
    expect(mock.reply).toHaveBeenCalledExactlyOnceWith({
      content: 'Hello, world!',
    })
  })

  it('should edit reply with the correct content', async () => {
    const [interaction, mock] = mockInteraction()
    const client = new MockClient()
    reply.edit('Hello, world!').call(client, interaction as unknown as ChatInputCommandInteraction, client)
    expect(mock.editReply).toHaveBeenCalledExactlyOnceWith({
      content: 'Hello, world!',
    })
  })

  it('should reply with ephemeral flag', async () => {
    const [interaction, mock] = mockInteraction()
    const client = new MockClient()
    reply.ephemeral('This is ephemeral!').call(client, interaction as unknown as ChatInputCommandInteraction, client)
    expect(mock.reply).toHaveBeenCalledExactlyOnceWith({
      content: 'This is ephemeral!',
      flags: MessageFlags.Ephemeral,
    })
  })
})
