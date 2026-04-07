import type { ChatInputCommandInteraction, InteractionCallbackResponse, InteractionResponse, Message } from 'discord.js'
import type { SlashCommandRuntime } from '../src/types'
import { ApplicationCommandOptionType, Client, Events, REST } from 'discord.js'
import { useNitroApp } from 'nitropack/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { DiscordClient } from '../src/runtime/server/utils/client'

vi.mock('discord.js', async (importOriginal) => {
  const { EventEmitter } = await import('node:events')
  const original = await importOriginal<typeof import('discord.js')>()
  const emitter = new EventEmitter()
  // Add spy methods that DiscordClient calls
  ;(emitter as any).login = vi.fn(() => Promise.resolve('token'))
  // Wrap .on so it's a spy but still registers listeners
  const originalOn = emitter.on.bind(emitter)
  ;(emitter as any).on = vi.fn((event: string, listener: (...args: any[]) => void) => originalOn(event, listener))
  // eslint-disable-next-line prefer-arrow-callback
  const MockClient = vi.fn(function () {
    return emitter
  }) as any
  MockClient.prototype = emitter
  Object.setPrototypeOf(emitter, EventEmitter.prototype)
  return {
    ...original,
    Client: MockClient,
    // eslint-disable-next-line prefer-arrow-callback
    REST: vi.fn(function () {
      return { setToken: vi.fn().mockReturnThis() }
    }),
  }
})
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

describe('client', () => {
  const mockedClient = new Client<true>({ intents: [] })

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

  it('should route to subcommand', async () => {
    const subExecute = vi.fn(() => 'sub result')
    const parentCommand: SlashCommandRuntime = {
      name: 'parent',
      description: 'Parent command',
      options: [],
      path: 'parent.ts',
      parents: [],
      subcommands: [
        {
          name: 'child',
          description: 'Child subcommand',
          options: [],
          path: 'parent/child.ts',
          parents: ['parent.ts'],
          subcommands: [],
          execute: subExecute,
        },
      ],
    }

    const client = new DiscordClient()
    client.start({ intents: [] })
    await expect.poll(() => mockedClient.on)
      .toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function))

    client.addSlashCommand(parentCommand)

    const { interaction } = mockChatInputCommandInteraction('parent', {}, false, { subcommand: 'child' })
    mockedClient.emit(Events.InteractionCreate, interaction)

    await expect.poll(() => subExecute).toHaveBeenCalled()
    await expect.poll(() => interaction.reply).toHaveBeenCalledWith({ content: 'sub result' })
  })

  it('should route to nested subcommand group', async () => {
    const leafExecute = vi.fn(() => 'leaf result')
    const parentCommand: SlashCommandRuntime = {
      name: 'parent',
      description: 'Parent',
      options: [],
      path: 'parent.ts',
      parents: [],
      subcommands: [
        {
          name: 'group',
          description: 'Group',
          options: [],
          path: 'parent/group.ts',
          parents: ['parent.ts'],
          subcommands: [
            {
              name: 'leaf',
              description: 'Leaf',
              options: [],
              path: 'parent/group/leaf.ts',
              parents: ['parent.ts', 'parent/group.ts'],
              subcommands: [],
              execute: leafExecute,
            },
          ],
        },
      ],
    }

    const client = new DiscordClient()
    client.start({ intents: [] })
    await expect.poll(() => mockedClient.on)
      .toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function))

    client.addSlashCommand(parentCommand)

    const { interaction } = mockChatInputCommandInteraction('parent', {}, false, { group: 'group', subcommand: 'leaf' })
    mockedClient.emit(Events.InteractionCreate, interaction)

    await expect.poll(() => leafExecute).toHaveBeenCalled()
    await expect.poll(() => interaction.reply).toHaveBeenCalledWith({ content: 'leaf result' })
  })

  it('should fire error hook for unknown command', async () => {
    const client = new DiscordClient()
    client.start({ intents: [] })
    await expect.poll(() => mockedClient.on)
      .toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function))

    const { interaction } = mockChatInputCommandInteraction('nonexistent')
    mockedClient.emit(Events.InteractionCreate, interaction)

    await expect.poll(() => mockedNitroApp.hooks.callHook)
      .toHaveBeenCalledWith('discord:client:error', expect.objectContaining({
        type: 'UnknownSlashCommandError',
      }))
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

  it('should pass option values to command execute', async () => {
    const addExecute = vi.fn((...args: any[]) => `${Number(args[0]) + Number(args[1])}`)
    const addCommand: SlashCommandRuntime = {
      name: 'add',
      description: 'Add numbers',
      options: [
        { name: 'a', description: 'First', type: ApplicationCommandOptionType.Number, required: true, hasAutocomplete: false, varname: 'a' },
        { name: 'b', description: 'Second', type: ApplicationCommandOptionType.Number, required: true, hasAutocomplete: false, varname: 'b' },
      ],
      path: 'add.ts',
      parents: [],
      subcommands: [],
      execute: addExecute,
    }

    const client = new DiscordClient()
    client.start({ intents: [] })
    await expect.poll(() => mockedClient.on)
      .toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function))

    client.addSlashCommand(addCommand)

    const { interaction } = mockChatInputCommandInteraction('add', { a: 3, b: 7 })
    mockedClient.emit(Events.InteractionCreate, interaction)

    await expect.poll(() => addExecute).toHaveBeenCalledWith(3, 7)
    await expect.poll(() => interaction.reply).toHaveBeenCalledWith({ content: '10' })
  })

  it('should handle optional parameters as undefined', async () => {
    const greetExecute = vi.fn((...args: any[]) => args[1] ? String(args[0]).toUpperCase() : String(args[0]))
    const greetCommand: SlashCommandRuntime = {
      name: 'greet',
      description: 'Greet',
      options: [
        { name: 'name', description: 'Name', type: ApplicationCommandOptionType.String, required: true, hasAutocomplete: false, varname: 'name' },
        { name: 'loud', description: 'Loud', type: ApplicationCommandOptionType.Boolean, required: false, hasAutocomplete: false, varname: 'loud' },
      ],
      path: 'greet.ts',
      parents: [],
      subcommands: [],
      execute: greetExecute,
    }

    const client = new DiscordClient()
    client.start({ intents: [] })
    await expect.poll(() => mockedClient.on)
      .toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function))

    client.addSlashCommand(greetCommand)

    // Only provide 'name', not 'loud'
    const { interaction } = mockChatInputCommandInteraction('greet', { name: 'Alice' })
    mockedClient.emit(Events.InteractionCreate, interaction)

    await expect.poll(() => greetExecute).toHaveBeenCalledWith('Alice', undefined)
    await expect.poll(() => interaction.reply).toHaveBeenCalledWith({ content: 'Alice' })
  })

  it('should auto-defer when deferOnPromise is enabled', async () => {
    const slowCommand: SlashCommandRuntime = {
      name: 'slow',
      description: 'Slow',
      options: [],
      path: 'slow.ts',
      parents: [],
      subcommands: [],
      execute: vi.fn(() => new Promise<string>(resolve => setTimeout(resolve, 50, 'done'))),
    }

    const client = new DiscordClient()
    client.start({ intents: [], deferOnPromise: true })
    await expect.poll(() => mockedClient.on)
      .toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function))

    client.addSlashCommand(slowCommand)

    const { interaction } = mockChatInputCommandInteraction('slow')
    mockedClient.emit(Events.InteractionCreate, interaction)

    await expect.poll(() => interaction.deferReply).toHaveBeenCalled()
    await expect.poll(() => slowCommand.execute).toHaveBeenCalled()
  })

  it('should dynamically load command via load()', async () => {
    const lazyCommand: SlashCommandRuntime = {
      name: 'lazy',
      description: 'Lazy loaded',
      options: [],
      path: 'lazy.ts',
      parents: [],
      subcommands: [],
      load: vi.fn(() => Promise.resolve({
        execute: () => 'loaded!',
      })),
    }

    const client = new DiscordClient()
    client.start({ intents: [] })
    await expect.poll(() => mockedClient.on)
      .toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function))

    client.addSlashCommand(lazyCommand)

    const { interaction } = mockChatInputCommandInteraction('lazy')
    mockedClient.emit(Events.InteractionCreate, interaction)

    await expect.poll(() => lazyCommand.load).toHaveBeenCalled()
    await expect.poll(() => interaction.reply).toHaveBeenCalledWith({ content: 'loaded!' })
  })

  it('should manage command lifecycle (add, replace, remove, clear)', () => {
    const client = new DiscordClient()
    const cmd1: SlashCommandRuntime = { name: 'a', description: '', options: [], path: '', parents: [], subcommands: [] }
    const cmd2: SlashCommandRuntime = { name: 'b', description: '', options: [], path: '', parents: [], subcommands: [] }
    const cmd1Updated: SlashCommandRuntime = { name: 'a', description: 'updated', options: [], path: '', parents: [], subcommands: [] }

    client.addSlashCommand(cmd1)
    client.addSlashCommand(cmd2)
    expect(client.getSlashCommands()).toHaveLength(2)

    // Replace existing
    client.addSlashCommand(cmd1Updated)
    expect(client.getSlashCommands()).toHaveLength(2)
    expect(client.getSlashCommand('a')?.description).toBe('updated')

    // Remove
    client.removeSlashCommand('b')
    expect(client.getSlashCommands()).toHaveLength(1)

    // Clear
    client.clearSlashCommands()
    expect(client.getSlashCommands()).toHaveLength(0)
  })

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

function mockChatInputCommandInteraction(commandName: string, options: Record<string, any> = {}, withResponse = false, subcommandInfo: { group?: string, subcommand?: string } = {}) {
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
    isUserContextMenuCommand: () => false,
    isMessageContextMenuCommand: () => false,
    commandName,
    options: {
      get: (name: string) => {
        if (name in options)
          return { value: options[name] }
        return null
      },
      getSubcommand: () => subcommandInfo.subcommand ?? null,
      getSubcommandGroup: () => subcommandInfo.group ?? null,
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
