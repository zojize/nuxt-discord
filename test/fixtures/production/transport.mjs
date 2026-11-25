import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'

// Resolve the copy that was traced into the deployed server, outside the consumer project.
const require = createRequire(resolve('server/index.mjs'))
const { Client, Events, REST } = require('discord.js')

REST.prototype.get = async () => []
REST.prototype.put = async (_route, { body }) => body.map((command, index) => ({ ...command, id: String(index + 1) }))

Client.prototype.login = async function (token) {
  assert.equal(token, 'fixture-only')
  if (process.env.TEST_GATEWAY === 'rejected')
    throw Object.assign(new Error('fixture-private-login-error'), { code: 'TokenInvalid' })
  this.emit(Events.ClientReady, this)
  setImmediate(() => this.emit(Events.InteractionCreate, {
    commandName: 'ping',
    user: { id: 'fixture' },
    createdTimestamp: Date.now(),
    options: { get: () => null },
    isAutocomplete: () => false,
    isChatInputCommand: () => true,
    isMessageContextMenuCommand: () => false,
    isUserContextMenuCommand: () => false,
    async reply(payload) {
      process.stdout.write(`fixture reply ${payload.content}\n`)
      return {}
    },
  }))
  return token
}

Client.prototype.destroy = async () => {
  process.stdout.write('fixture gateway closed\n')
}
