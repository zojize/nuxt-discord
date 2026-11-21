import type { ChatInputCommandInteraction, InteractionCallbackResponse, InteractionResponse, Message } from 'discord.js'
import type { SlashCommandRuntime } from '../src/types'
import { EventEmitter } from 'node:events'
import { ApplicationCommandOptionType, Client, Events, MessageFlags, REST } from 'discord.js'
import { useNitroApp } from 'nitropack/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { DiscordClient, getCurrentChannel, useInteraction } from '../src/runtime/server/utils/client'

import { MiddlewareError, useMiddlewareContext } from '../src/runtime/server/utils/defineMiddleware'
import { reply } from '../src/runtime/server/utils/reply'
import { useTextChannel } from '../src/runtime/server/utils/useTextChannel'

vi.mock('discord.js', async (importOriginal) => {
  const { EventEmitter } = await import('node:events')
  const original = await importOriginal<typeof import('discord.js')>()
  const emitter = new EventEmitter()
  // Add spy methods that DiscordClient calls
  ;(emitter as any).login = vi.fn(() => Promise.resolve('token'))
  // Wrap .on so it's a spy but still registers listeners
  const originalOn = emitter.on.bind(emitter)
  ;(emitter as any).on = vi.fn((event: string, listener: (...args: any[]) => void) => originalOn(event, listener))
  return {
    ...original,
    Client: class {
      constructor() { return emitter }
    },
    REST: class {
      setToken = vi.fn().mockReturnThis()
    },
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
    expect(vi.isMockFunction(new REST().setToken)).toBe(true)
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

  it('finishes reactive edits in order when Discord is slow', async () => {
    const client = new DiscordClient()
    void client.start({ intents: [] })
    await vi.waitFor(() => expect(mockedClient.on).toHaveBeenCalled())
    const content = ref('initial')
    client.addSlashCommand({ ...ping, execute: () => content })
    const { interaction, messageMock } = mockChatInputCommandInteraction('ping')
    const slowEdit = Promise.withResolvers<void>()
    const edits: string[] = []
    const edit = vi.fn(async (payload: { content: string }) => {
      if (payload.content === 'first')
        await slowEdit.promise
      edits.push(payload.content)
      return messageMock
    })
    Object.assign(messageMock, { edit })
    mockedClient.emit(Events.InteractionCreate, interaction)
    await vi.waitFor(() => expect(interaction.reply).toHaveBeenCalledOnce())
    content.value = 'first'
    await vi.waitFor(() => expect(messageMock.edit).toHaveBeenCalledTimes(1))
    content.value = 'latest'
    await new Promise(resolve => setTimeout(resolve, 10))
    slowEdit.resolve()
    await vi.waitFor(() => expect(edits).toEqual(['first', 'latest']))
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

  async function startClient() {
    const bot = new DiscordClient()
    const started = bot.start({ intents: [], deferOnPromise: true })
    await Promise.resolve()
    mockedClient.emit(Events.ClientReady, mockedClient)
    await started
    return bot
  }

  it.each([false, true])('sends fast asynchronous replies directly (private %s)', async (privateReply) => {
    const bot = await startClient()
    bot.addSlashCommand({ ...ping, execute: async () => privateReply ? reply.ephemeral('done') : 'done' })
    const { interaction } = mockChatInputCommandInteraction('ping')
    const result = await bot.dispatchInteraction(interaction)
    expect(result.status).toBe('ok')
    expect(interaction.deferReply).not.toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith(privateReply ? { content: 'done', flags: 64 } : { content: 'done' })
    result.dispose()
  })

  it.each([
    [undefined, true, true, false],
    [undefined, false, true, true],
    ['public', false, false, false],
    ['public', true, false, true],
    ['private', false, true, false],
  ] as const)('respects slow reply visibility (policy %s, private result %s)', async (policy, privateResult, privatelyDeferred, needsFollowup) => {
    vi.useFakeTimers()
    try {
      const bot = await startClient()
      const ready = Promise.withResolvers<void>()
      bot.addSlashCommand({
        ...ping,
        defer: policy,
        execute: async () => {
          await ready.promise
          return privateResult ? reply.ephemeral('done') : 'done'
        },
      })
      const { interaction, messageMock } = mockChatInputCommandInteraction('ping')
      let ephemeral = false
      Object.defineProperty(interaction, 'ephemeral', { get: () => ephemeral })
      const defer = vi.fn(async (opts: { flags?: number }) => {
        ephemeral = !!(opts.flags && (opts.flags & MessageFlags.Ephemeral))
        Object.defineProperty(interaction, 'deferred', { value: true })
      })
      const edit = vi.fn(async () => messageMock)
      Object.assign(interaction, { deferReply: defer, editReply: edit, deleteReply: vi.fn(async () => {}) })
      const dispatch = bot.dispatchInteraction(interaction)
      await vi.advanceTimersByTimeAsync(1900)
      expect(defer).toHaveBeenCalledOnce()
      expect(ephemeral).toBe(privatelyDeferred)
      ready.resolve()
      const result = await dispatch
      expect(result.status).toBe('ok')
      if (needsFollowup) {
        expect(edit).toHaveBeenCalledWith({ content: 'Preparing reply…' })
        expect(interaction.followUp).toHaveBeenCalledWith(privateResult ? { content: 'done', flags: 64 } : { content: 'done' })
        expect(interaction.deleteReply).toHaveBeenCalledOnce()
      }
      else {
        expect(edit).toHaveBeenCalledWith(expect.objectContaining({ content: 'done' }))
        expect(interaction.followUp).not.toHaveBeenCalled()
      }
      result.dispose()
    }
    finally { vi.useRealTimers() }
  })

  it('routes a late direct private reply through a safe automatic acknowledgement', async () => {
    vi.useFakeTimers()
    try {
      const bot = await startClient()
      const gate = Promise.withResolvers<void>()
      bot.addSlashCommand({ ...ping, execute: async () => {
        const interaction = useInteraction()!
        await gate.promise
        await interaction.reply({ content: 'private', flags: MessageFlags.Ephemeral })
      } })
      const { interaction, messageMock } = mockChatInputCommandInteraction('ping')
      const edit = vi.fn(async () => messageMock)
      Object.assign(interaction, { editReply: edit })
      const result = bot.dispatchInteraction(interaction)
      await vi.advanceTimersByTimeAsync(2000)
      gate.resolve()
      expect((await result).status).toBe('ok')
      expect(edit).toHaveBeenCalledWith({ content: 'private', flags: MessageFlags.Ephemeral })
      expect(interaction.reply).not.toHaveBeenCalled()
    }
    finally { vi.useRealTimers() }
  })

  it('owns resources created after await in a context menu and matches menus by type', async () => {
    const bot = await startClient()
    const bus = new EventEmitter()
    const wrong = vi.fn()
    bot.addContextMenus([
      { name: 'Inspect', type: 'message', execute: wrong },
      { name: 'Inspect', type: 'user', execute: async () => {
        await Promise.resolve()
        return useTextChannel().id
      } },
    ])
    const { interaction } = mockChatInputCommandInteraction('Inspect')
    Object.assign(interaction, {
      channel: { id: 'channel', client: bus },
      isChatInputCommand: () => false,
      isUserContextMenuCommand: () => true,
    })
    const result = await bot.dispatchInteraction(interaction, { simulation: true })
    expect(result.status).toBe('ok')
    expect(wrong).not.toHaveBeenCalled()
    expect(interaction.reply).toHaveBeenCalledWith({ content: 'channel' })
    expect(bus.eventNames()).toHaveLength(5)
    result.dispose()
    expect(bus.eventNames()).toEqual([])
  })

  it('leaves a direct acknowledgement in flight and supports manual deferral', async () => {
    vi.useFakeTimers()
    try {
      const bot = await startClient()
      for (const policy of [undefined, 'manual'] as const) {
        const network = Promise.withResolvers<void>()
        const { interaction } = mockChatInputCommandInteraction('ping')
        const direct = vi.fn(() => network.promise)
        Object.assign(interaction, { reply: direct })
        bot.addSlashCommand({ ...ping, defer: policy, execute: async () => {
          await useInteraction()!.reply('handled')
        } })
        const dispatch = bot.dispatchInteraction(interaction)
        await vi.advanceTimersByTimeAsync(2500)
        expect(direct).toHaveBeenCalledOnce()
        expect(interaction.deferReply).not.toHaveBeenCalled()
        network.resolve()
        ;(await dispatch).dispose()
      }
    }
    finally { vi.useRealTimers() }
  })

  it('isolates overlapping listeners and removes subscriptions created after await', async () => {
    const bot = await startClient()
    const bus = new EventEmitter()
    const gates = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
    const results: string[] = []
    bot.registerListeners([{ event: Events.MessageCreate, async execute(...args) {
      const { index } = args[0] as unknown as { index: number }
      await gates[index]!.promise
      results.push(useTextChannel().id)
    } }])
    const run = mockedClient.listeners(Events.MessageCreate)[0]!
    const a = run({ channel: { id: 'a', client: bus }, index: 0 })
    const b = run({ channel: { id: 'b', client: bus }, index: 1 })
    gates[0]!.resolve()
    await a
    gates[1]!.resolve()
    await b
    expect(results).toEqual(['a', 'b'])
    expect(bus.eventNames()).toEqual([])
    expect(getCurrentChannel()).toBeNull()
  })

  it('registers file listeners before login, including the first ready event', async () => {
    const bot = new DiscordClient()
    const ready = vi.fn()
    bot.registerListeners([{ event: Events.ClientReady, once: true, execute: ready }])
    const started = bot.start({ intents: [] })
    await Promise.resolve()
    mockedClient.emit(Events.ClientReady, mockedClient)
    await started
    expect(ready).toHaveBeenCalledOnce()
  })

  it('runs hooks and activity from the same outcome and isolates simulations', async () => {
    const bot = await startClient()
    const calls = mockedNitroApp.hooks.callHook
    for (const status of ['ok', 'denied', 'error'] as const) {
      calls.mockClear()
      bot.addSlashCommand({ ...ping, middlewareEntries: [{ name: 'guard', fn: ({ next }) => {
        if (status === 'denied')
          throw new MiddlewareError('stop', 'guard')
        return next({ value: 5 })
      } }], execute: async () => {
        await Promise.resolve()
        expect(useMiddlewareContext()).toEqual({ value: 5 })
        expect(useInteraction()?.commandName).toBe('ping')
        if (status === 'error')
          throw new Error('failed')
        return 'done'
      } })
      const { interaction } = mockChatInputCommandInteraction('ping')
      const result = await bot.dispatchInteraction(interaction)
      expect(result.status).toBe(status)
      expect(bot.getActivityLog().at(-1)?.status).toBe(status)
      expect(calls.mock.calls.map(([name]) => name)).toEqual(status === 'ok'
        ? ['discord:interaction:before', 'discord:interaction:after']
        : ['discord:interaction:before', ...(status === 'denied' ? ['discord:interaction:denied'] : []), 'discord:client:error', 'discord:interaction:after'])
      result.dispose()
    }
    calls.mockClear()
    const { interaction } = mockChatInputCommandInteraction('ping')
    const result = await bot.dispatchInteraction(interaction, { simulation: true })
    expect(result).toMatchObject({ status: 'error', detail: 'failed' })
    expect(calls).not.toHaveBeenCalled()
    expect(bot.getActivityLog()).toHaveLength(3)
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
