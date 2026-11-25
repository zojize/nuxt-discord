import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import process from 'node:process'
import { ApplicationCommandType, GatewayCloseCodes, GatewayDispatchEvents, GatewayOpcodes, InteractionResponseType, InteractionType } from 'discord.js'
import { WebSocketServer } from 'ws'

const bot = { id: '100000000000000001', username: 'fixture', discriminator: '0000', avatar: null, bot: true }
const app = { id: bot.id, flags: 0 }
const user = { id: '100000000000000002', username: 'member', discriminator: '0000', avatar: null }

export async function testGatewayResume(deployment, env) {
  for (const closeCode of [GatewayCloseCodes.DisallowedIntents, GatewayCloseCodes.AuthenticationFailed])
    await runGateway(deployment, env, closeCode)
  console.log('Standalone Discord gateway resumed its session, replied after reconnect, and exited on fatal shard closes.')
}

async function runGateway(deployment, env, closeCode) {
  const exchanges = []
  const callbacks = []
  const session = 'loopback-session'
  const failed = Promise.withResolvers()
  const http = createServer((req, res) => handleRequest(req, res).catch(failed.reject))
  const gateway = new WebSocketServer({ server: http })
  http.listen(0, '127.0.0.1')
  await once(http, 'listening')
  const origin = `127.0.0.1:${http.address().port}`
  const wsURL = `ws://${origin}`

  let sequence = 0
  let socket
  let identifiedSocket
  gateway.on('connection', (connection) => {
    socket = connection
    connection.send(JSON.stringify({ op: GatewayOpcodes.Hello, d: { heartbeat_interval: 1000 } }))
    connection.on('message', (data) => {
      try {
        const { op, d } = JSON.parse(data)
        if (op === GatewayOpcodes.Heartbeat) {
          connection.send(JSON.stringify({ op: GatewayOpcodes.HeartbeatAck, d: null }))
        }
        else if (op === GatewayOpcodes.Identify) {
          assert.deepEqual(exchanges, [], 'a reconnect should resume the existing session')
          identifiedSocket = connection
          exchanges.push('identify')
          dispatch(GatewayDispatchEvents.Ready, { v: 10, session_id: session, resume_gateway_url: wsURL, user: bot, guilds: [], application: app })
          sendPing()
        }
        else if (op === GatewayOpcodes.Resume) {
          assert.deepEqual(exchanges, ['identify', 'reply'])
          assert.notEqual(connection, identifiedSocket, 'resume on a new WebSocket connection')
          assert.equal(d.session_id, session)
          assert.equal(d.seq, sequence)
          exchanges.push('resume')
          dispatch(GatewayDispatchEvents.Resumed, {})
          sendPing()
        }
      }
      catch (error) {
        failed.reject(error)
      }
    })
  })
  function dispatch(event, data) {
    socket.send(JSON.stringify({ op: GatewayOpcodes.Dispatch, t: event, s: ++sequence, d: data }))
  }
  function sendPing() {
    // Discord.js derives the interaction deadline from its snowflake's timestamp.
    const id = String((BigInt(Date.now() - 1420070400000) << 22n) + BigInt(sequence))
    const token = `fixture-${sequence}`
    callbacks.push(`/api/v10/interactions/${id}/${token}/callback`)
    dispatch(GatewayDispatchEvents.InteractionCreate, {
      id,
      application_id: app.id,
      token,
      type: InteractionType.ApplicationCommand,
      version: 1,
      user,
      entitlements: [],
      authorizing_integration_owners: {},
      locale: 'en-US',
      data: { id: '100000000000000003', name: 'ping', type: ApplicationCommandType.ChatInput },
    })
  }
  async function handleRequest(req, res) {
    const path = new URL(req.url, 'http://localhost').pathname
    if (req.method === 'GET' && path === '/api/v10/gateway/bot') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ url: wsURL, shards: 1, session_start_limit: { total: 1000, remaining: 999, reset_after: 60000, max_concurrency: 1 } }))
      return
    }
    assert.equal(req.method, 'POST')
    assert.equal(path, callbacks.shift(), 'acknowledge the interaction that the gateway dispatched')
    const chunks = []
    for await (const chunk of req)
      chunks.push(chunk)
    const payload = JSON.parse(Buffer.concat(chunks).toString())
    assert.equal(payload.type, InteractionResponseType.ChannelMessageWithSource)
    assert.equal(payload.data.content, 'pong')
    res.writeHead(204).end()
    exchanges.push('reply')
    if (exchanges.length === 2)
      socket.send(JSON.stringify({ op: GatewayOpcodes.Reconnect, d: null }))
    else
      socket.close(closeCode, 'fixture fatal disconnect')
  }

  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: deployment,
    env: {
      ...env,
      NODE_ENV: 'production',
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: '0',
      DISCORD_TOKEN: 'fixture-only',
      DISCORD_CLIENT_ID: bot.id,
      FIXTURE_RUNTIME_REPLY: 'pong',
      FIXTURE_DISCORD_API: `http://${origin}/api`,
      NUXT_DISCORD_SYNC: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (chunk) => { log += chunk })
  const closed = once(child, 'close')
  const timeout = setTimeout(() => failed.reject(new Error(`Timed out at ${exchanges.join(' → ')}.\n${log}`)), 20000)
  try {
    const [code, signal] = await Promise.race([closed, failed.promise])
    assert.deepEqual([code, signal], [1, null], log)
    assert.deepEqual(exchanges, ['identify', 'reply', 'resume', 'reply'], log)
    assert.match(log, new RegExp(`Discord shard 0.*${closeCode}`))
  }
  finally {
    clearTimeout(timeout)
    if (child.exitCode === null && !child.signalCode)
      child.kill('SIGKILL')
    for (const ws of gateway.clients)
      ws.terminate()
    gateway.close()
    http.closeAllConnections()
    await Promise.all([closed, new Promise(resolve => http.close(resolve))])
  }
}
