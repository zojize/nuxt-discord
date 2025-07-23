import type { ChatInputCommandInteraction, InteractionCallbackResponse, InteractionResponse, Message } from 'discord.js'
import type { SlashCommandRuntime } from '../src/types'
import { Client, Events, REST } from 'discord.js'
import { useNitroApp } from 'nitropack/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { DiscordClient } from '../src/runtime/server/utils/client'

vi.mock('discord.js')
vi.mock('nitropack/runtime')

vi.stubEnv('DISCORD_TOKEN', 'test-token')
vi.stubEnv('DISCORD_CLIENT_ID', 'test-client-id')

describe('client', () => {
  const mockedClient = new Client<true>({ intents: [] })
  const mockedNitroApp = useNitroApp()

  beforeEach(() => {
    vi.clearAllMocks()
    mockedClient.removeAllListeners()
  })

  it('should mock dependencies', () => {
    expect(vi.isMockFunction(Client)).toBe(true)
    expect(vi.isMockFunction(REST)).toBe(true)
    expect(new Client({ intents: [] })).toBe(mockedClient)
    expect(vi.isMockFunction(useNitroApp)).toBe(true)
    expect(useNitroApp()).toBe(mockedNitroApp)
  })

  it('should login', async () => {
    const client = new DiscordClient()
    client.start({ intents: [] })
    await expect.poll(() => mockedClient.login)
      .toHaveBeenCalledWith('test-token')
    mockedClient.emit(Events.ClientReady, mockedClient)
    await expect.poll(() => mockedNitroApp.hooks.callHook)
      .toHaveBeenLastCalledWith('discord:client:ready', client)
  })

  const ping: SlashCommandRuntime = {
    name: 'ping',
    description: 'Ping the bot',
    options: [],
    path: 'ping.ts',
    parents: [],
    subcommands: [],
    execute: vi.fn(() => 'pong'),
  }

  it('should handle basic command', async () => {
    const client = new DiscordClient()
    client.start({ intents: [] })
    await expect.poll(() => mockedClient.on)
      .toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function))

    client.addSlashCommand(ping)
    expect(client.getSlashCommands()[0]).toBe(ping)

    const { interaction } = mockChatInputCommandInteraction('ping')
    mockedClient.emit(Events.InteractionCreate, interaction)

    await expect.poll(() => ping.execute).toHaveBeenCalled()
    await expect.poll(() => interaction.reply).toHaveBeenCalledWith({ content: 'pong' })
  })

  const editAfter100ms: SlashCommandRuntime = {
    name: 'editAfter100ms',
    description: 'Edit the message after 100ms',
    options: [],
    path: 'editAfter100ms.ts',
    parents: [],
    subcommands: [],
    execute: vi.fn(() => {
      const message = ref('Before edit')
      setTimeout(() => {
        message.value = 'After edit'
      }, 100)
      return message
    }),
  }

  it('should handle command with reactive return', async () => {
    const client = new DiscordClient()
    client.start({ intents: [] })
    await expect.poll(() => mockedClient.on)
      .toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function))

    client.addSlashCommand(editAfter100ms)
    expect(client.getSlashCommands()[0]).toBe(editAfter100ms)

    const { interaction, messageMock } = mockChatInputCommandInteraction('editAfter100ms')
    mockedClient.emit(Events.InteractionCreate, interaction)

    await expect.poll(() => editAfter100ms.execute).toHaveBeenCalled()
    await expect.poll(() => interaction.reply).toHaveBeenLastCalledWith({ content: 'Before edit' })
    expect(interaction.reply).toHaveBeenCalledTimes(1)
    expect(messageMock.edit).toHaveBeenCalledTimes(0)

    await expect.poll(() => messageMock.edit).toHaveBeenLastCalledWith({ content: 'After edit' })
    expect(messageMock.edit).toHaveBeenCalledTimes(1)
  })

  const helloTwice: SlashCommandRuntime = {
    name: 'helloTwice',
    description: 'Reply with hello twice',
    options: [],
    path: 'helloTwice.ts',
    parents: [],
    subcommands: [],
    execute: vi.fn(function* () {
      yield 'hello'
      yield 'hello again'
    }),
  }

  it('should handle command with generator return', async () => {
    const client = new DiscordClient()
    client.start({ intents: [] })
    await expect.poll(() => mockedClient.on)
      .toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function))

    client.addSlashCommand(helloTwice)
    expect(client.getSlashCommands()[0]).toBe(helloTwice)

    const { interaction } = mockChatInputCommandInteraction('helloTwice')
    mockedClient.emit(Events.InteractionCreate, interaction)

    await expect.poll(() => helloTwice.execute).toHaveBeenCalledTimes(1)
    await expect.poll(() => interaction.reply).toHaveBeenLastCalledWith({ content: 'hello' })
    await expect.poll(() => interaction.followUp).toHaveBeenLastCalledWith({ content: 'hello again' })
  })
})

function mockChatInputCommandInteraction(commandName: string, options: Record<string, any> = {}, withResponse = false) {
  const messageMock:
    & InteractionResponse
    & InteractionCallbackResponse
    & Message = {
      ...withResponse
        ? { resource: {
            message: {
              edit: vi.fn(() => Promise.resolve({})),
            },
          } }
        : { edit: vi.fn(() => Promise.resolve({})) },
    } as any
  let deferred = false
  let replied = false
  const interactionMock = {
    isChatInputCommand: () => true,
    isAutocomplete: () => false,
    commandName,
    options: {
      get: (name: string) => {
        if (name in options)
          return { value: options[name] }
        return null
      },
    },
    get deferred() {
      return deferred
    },
    get replied() {
      return replied
    },
    deferReply: vi.fn(() => {
      deferred = true
      return Promise.resolve()
    }),
    reply: vi.fn(() => {
      replied = true
      return Promise.resolve(messageMock)
    }),
    followUp: vi.fn(() => Promise.resolve(messageMock)),
  }
  return {
    interaction: interactionMock as unknown as ChatInputCommandInteraction,
    interactionMock,
    messageMock,
  }
}
