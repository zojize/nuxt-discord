import type { ChatInputCommandInteraction } from 'discord.js'
import type { DiscordClient } from '~/src/runtime/server/utils/client'
import { MessageFlags } from 'discord.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
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

  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(1).toMatchInlineSnapshot(`1`)
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
    const [f1, f2, ...rest] = files as [string, string, ...string[]]
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

  describe('modal', () => {
    function mockModalInteraction() {
      const mock = {
        showModal: vi.fn(() => Promise.resolve()),
        awaitModalSubmit: vi.fn(() => new Promise(() => {})), // never resolves by default
        replied: false,
        deferred: false,
      }
      return {
        interaction: mock as unknown as ChatInputCommandInteraction,
        mock,
      }
    }

    function getModal(mock: ReturnType<typeof mockModalInteraction>['mock']): any {
      const builder = (mock.showModal as any).mock.calls[0]![0]
      return builder.toJSON()
    }

    function getField(mock: ReturnType<typeof mockModalInteraction>['mock'], index = 0): any {
      return getModal(mock).components[index].components[0]
    }

    it('should return a handler function', () => {
      const handler = reply.modal('Test', { name: 'short' }, () => {})
      expect(handler).toBeInstanceOf(Function)
    })

    it('should call showModal with correct title and fields', () => {
      const handler = reply.modal('My Form', {
        name: { style: 'short', placeholder: 'Enter name' },
        bio: { style: 'paragraph', required: false },
      }, () => {})

      const { interaction, mock } = mockModalInteraction()
      const client = new MockClient()
      handler.call(client, interaction, client)

      expect(mock.showModal).toHaveBeenCalledOnce()
      const modal = getModal(mock)
      expect(modal.title).toBe('My Form')
      expect(modal.components).toHaveLength(2)
    })

    it('should handle shorthand field syntax', () => {
      const handler = reply.modal('Quick', { name: 'short', bio: 'paragraph' }, () => {})

      const { interaction, mock } = mockModalInteraction()
      const client = new MockClient()
      handler.call(client, interaction, client)

      expect(getField(mock, 0).style).toBe(1) // TextInputStyle.Short
      expect(getField(mock, 1).style).toBe(2) // TextInputStyle.Paragraph
    })

    it('should auto-capitalize field labels from keys', () => {
      const handler = reply.modal('Test', { username: 'short' }, () => {})

      const { interaction, mock } = mockModalInteraction()
      const client = new MockClient()
      handler.call(client, interaction, client)

      expect(getField(mock).label).toBe('Username')
    })

    it('should use custom label when provided', () => {
      const handler = reply.modal('Test', {
        name: { label: 'Full Name', style: 'short' },
      }, () => {})

      const { interaction, mock } = mockModalInteraction()
      const client = new MockClient()
      handler.call(client, interaction, client)

      expect(getField(mock).label).toBe('Full Name')
    })

    it('should set placeholder and constraints', () => {
      const handler = reply.modal('Test', {
        name: { style: 'short', placeholder: 'Enter here', minLength: 2, maxLength: 50 },
      }, () => {})

      const { interaction, mock } = mockModalInteraction()
      const client = new MockClient()
      handler.call(client, interaction, client)

      const field = getField(mock)
      expect(field.placeholder).toBe('Enter here')
      expect(field.min_length).toBe(2)
      expect(field.max_length).toBe(50)
    })

    it('should set pre-filled value', () => {
      const handler = reply.modal('Test', {
        name: { style: 'short', value: 'Default' },
      }, () => {})

      const { interaction, mock } = mockModalInteraction()
      const client = new MockClient()
      handler.call(client, interaction, client)

      expect(getField(mock).value).toBe('Default')
    })

    it('should default required to true', () => {
      const handler = reply.modal('Test', { name: 'short' }, () => {})

      const { interaction, mock } = mockModalInteraction()
      const client = new MockClient()
      handler.call(client, interaction, client)

      expect(getField(mock).required).toBe(true)
    })

    it('should respect required: false', () => {
      const handler = reply.modal('Test', {
        name: { style: 'short', required: false },
      }, () => {})

      const { interaction, mock } = mockModalInteraction()
      const client = new MockClient()
      handler.call(client, interaction, client)

      expect(getField(mock).required).toBe(false)
    })

    it('should generate unique custom IDs per invocation', () => {
      const handler1 = reply.modal('A', { x: 'short' }, () => {})
      const handler2 = reply.modal('B', { y: 'short' }, () => {})

      const { interaction: i1, mock: m1 } = mockModalInteraction()
      const { interaction: i2, mock: m2 } = mockModalInteraction()
      const client = new MockClient()

      handler1.call(client, i1, client)
      handler2.call(client, i2, client)

      expect(getModal(m1).custom_id).not.toBe(getModal(m2).custom_id)
    })

    it('should pass field values to onSubmit and handle string return', async () => {
      const onSubmit = vi.fn(() => 'Thanks!')
      const submissionMock = {
        customId: '',
        replied: false,
        deferred: false,
        fields: {
          getTextInputValue: vi.fn((key: string) => {
            const values: Record<string, string> = { name: 'Alice' }
            return values[key] ?? ''
          }),
        },
        reply: vi.fn(() => Promise.resolve()),
        deferUpdate: vi.fn(() => Promise.resolve()),
      }

      const mock = {
        showModal: vi.fn(() => Promise.resolve()),
        awaitModalSubmit: vi.fn(() => Promise.resolve(submissionMock)),
        replied: false,
        deferred: false,
      }

      const handler = reply.modal('Test', { name: 'short' }, onSubmit)
      const client = new MockClient()
      await handler.call(client, mock as any, client)

      expect(onSubmit).toHaveBeenCalledWith({ name: 'Alice' }, submissionMock)
      expect(submissionMock.reply).toHaveBeenCalledWith({ content: 'Thanks!' })
    })

    it('should call deferUpdate when onSubmit returns nothing', async () => {
      const onSubmit = vi.fn()
      const submissionMock = {
        customId: '',
        replied: false,
        deferred: false,
        fields: { getTextInputValue: vi.fn(() => '') },
        reply: vi.fn(() => Promise.resolve()),
        deferUpdate: vi.fn(() => Promise.resolve()),
      }

      const mock = {
        showModal: vi.fn(() => Promise.resolve()),
        awaitModalSubmit: vi.fn(() => Promise.resolve(submissionMock)),
        replied: false,
        deferred: false,
      }

      const handler = reply.modal('Test', { name: 'short' }, onSubmit)
      const client = new MockClient()
      await handler.call(client, mock as any, client)

      expect(submissionMock.deferUpdate).toHaveBeenCalledOnce()
    })
  })
})
