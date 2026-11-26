import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'

// Resolve the copy that was traced into the deployed server, outside the consumer project.
const require = createRequire(resolve('server/index.mjs'))
const { Client, Events, REST } = require('discord.js')

REST.prototype.get = async () => []
REST.prototype.put = async (_route, { body }) => body.map((command, index) => ({ ...command, id: String(index + 1) }))

if (process.env.DISCORD_DASHBOARD_ORIGIN) {
  const accounts = { owner: '100000000000000002', reader: '100000000000000003', outsider: '100000000000000004' }
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const { origin, pathname } = new URL(request.url)
    assert.equal(origin, 'https://discord.com')
    assert.equal(request.redirect, 'error')
    const authorization = request.headers.get('authorization')
    if (pathname === '/api/v10/oauth2/token') {
      assert.equal(request.method, 'POST')
      assert.equal(authorization, null)
      const form = new URLSearchParams(await request.text())
      assert.equal(form.get('client_id'), process.env.DISCORD_CLIENT_ID)
      assert.equal(form.get('redirect_uri'), `${process.env.DISCORD_DASHBOARD_ORIGIN}/__discord-auth/callback`)
      const [account, challenge] = form.get('code').split('.')
      assert.ok(Object.hasOwn(accounts, account))
      assert.equal(challenge, createHash('sha256').update(form.get('code_verifier')).digest('base64url'))
      return Response.json({ token_type: 'Bearer', access_token: `fixture-${account}` })
    }
    if (pathname === '/api/v10/users/@me') {
      const account = authorization?.match(/^Bearer fixture-(owner|reader|outsider)$/)?.[1]
      assert.ok(account)
      return Response.json({ id: accounts[account] })
    }
    assert.equal(pathname, '/api/v10/applications/@me')
    assert.equal(authorization, 'Bot fixture-only')
    return Response.json({
      id: process.env.DISCORD_CLIENT_ID,
      team: {
        owner_user_id: accounts.owner,
        members: [{ user: { id: accounts.reader }, membership_state: 2, role: 'read_only' }],
      },
    })
  }
}

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
