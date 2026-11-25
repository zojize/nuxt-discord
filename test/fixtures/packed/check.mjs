import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

// Use the same discord.js instance that Nitro deployed with the application.
const require = createRequire(new URL('./.output/server/index.mjs', import.meta.url))
const { Client, Events } = require('discord.js')

Client.prototype.login = async function () {
  this.emit(Events.ClientReady, this)
  return 'offline'
}
async function check() {
  await import('./.output/server/index.mjs')
  const bot = globalThis[Symbol.for('discord-client')]
  assert.ok(bot, 'Nitro initialized the packed module')
  assert.deepEqual(bot.getContextMenus().find(menu => menu.name === 'Save Message')?.guilds, ['100000000000000002'], 'packed menu retains its registration scope')
  await bot.start({ intents: [] })
  async function dispatch(name, userId = 'member', userMenu = false, onReply) {
    let response
    const handlers = bot.internalClient.listeners(Events.InteractionCreate)
    assert.equal(handlers.length, 1)
    await handlers[0]({
      commandName: name,
      user: { id: userId },
      createdTimestamp: Date.now(),
      options: { get: () => null },
      targetUser: { tag: 'fixture user' },
      isUserContextMenuCommand: () => userMenu,
      isMessageContextMenuCommand: () => false,
      isAutocomplete: () => false,
      isChatInputCommand: () => true,
      async reply(payload) {
        response = payload
        return onReply?.(payload) ?? {}
      },
    })
    return response
  }
  try {
    assert.equal((await dispatch('ping'))?.content, 'pong', 'production /ping replies through the Discord event handler')
    assert.equal((await dispatch('named'))?.content, 'ngpo', 'commands can use named exports from another command file')
    assert.equal((await dispatch('owner'))?.flags, 64)
    assert.equal(globalThis.ownerExecutions, undefined)
    assert.equal((await dispatch('owner', 'owner'))?.content, 'owner action')
    assert.equal(globalThis.ownerExecutions, 1)
    assert.equal((await dispatch('User Info', 'member', true))?.flags, 64)
    assert.equal(await dispatch('User Info', 'owner', true), 'fixture user')
    const edits = []
    let click
    let stopped = false
    const initial = await dispatch('gacha', 'member', false, (payload) => {
      const { label, custom_id: customId } = payload.components[0].toJSON().components[0]
      assert.equal(label, 'Open')
      return {
        edit: async options => edits.push(options),
        createMessageComponentCollector: options => ({
          stop() { stopped = true },
          on(_event, handler) {
            click = async () => {
              const interaction = { customId, deferUpdate: async () => {} }
              if (!stopped && await options.filter(interaction))
                await handler(interaction)
            }
          },
        }),
      }
    })
    assert.deepEqual(initial.files, ['begin.gif'])
    await delay(25) // A click arrives on a later event-loop turn than the reply.
    assert.equal(stopped, false, 'the default lifetime keeps the collector alive')
    await click()
    await delay(0)
    assert.equal(edits.length, 1)
    assert.deepEqual(edits[0].files, ['open.gif'])
    assert.deepEqual(edits[0].components, [])
  }
  finally {
    await bot.stop()
  }
}

check().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
