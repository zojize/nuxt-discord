import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import process from 'node:process'

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
  await bot.start({ intents: [] })
  async function dispatch(name, userId = 'member', userMenu = false) {
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
        return {}
      },
    })
    return response
  }
  try {
    assert.equal((await dispatch('ping'))?.content, 'pong', 'production /ping replies through the Discord event handler')
    assert.equal((await dispatch('owner'))?.flags, 64)
    assert.equal(globalThis.ownerExecutions, undefined)
    assert.equal((await dispatch('owner', 'owner'))?.content, 'owner action')
    assert.equal(globalThis.ownerExecutions, 1)
    assert.equal((await dispatch('User Info', 'member', true))?.flags, 64)
    assert.equal(await dispatch('User Info', 'owner', true), 'fixture user')
  }
  finally {
    await bot.stop()
  }
}

check().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
