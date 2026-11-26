import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { signInDashboard } from '../test/fixtures/production/dashboard-login.mjs'
import { testGatewayResume } from './test-gateway-resume.mjs'

const consumer = process.argv[2]
const source = fileURLToPath(new URL('../test/fixtures/production/', import.meta.url))
const app = join(consumer, 'standalone')
const deployment = mkdtempSync(join(tmpdir(), 'nuxt-discord-deployment-'))
const env = { ...process.env, NUXT_TELEMETRY_DISABLED: '1' }
delete env.NITRO_PRESET
delete env.SERVER_PRESET
delete env.DISCORD_TOKEN
delete env.DISCORD_CLIENT_ID
delete env.FIXTURE_RUNTIME_REPLY
delete env.FIXTURE_DISCORD_API
delete env.FIXTURE_HOSTED_DASHBOARD
delete env.DISCORD_DASHBOARD_PASSWORD_SHA256
delete env.DISCORD_DASHBOARD_ORIGIN

try {
  cpSync(source, app, { recursive: true })
  cpSync(join(consumer, 'app.vue'), join(app, 'app.vue'))
  buildServer(deployment, env)
  assert.deepEqual(JSON.parse(readFileSync(join(deployment, 'public/build-check'), 'utf8')), {
    prerender: true,
    discordInitialized: false,
  })
  await checkServer('ready')
  await checkServer('missing')
  await checkServer('rejected')
  await testGatewayResume(deployment, env)

  writeFileSync(join(app, 'app.vue'), '<template><NuxtPage /></template>')
  const hosted = join(deployment, 'hosted')
  buildServer(hosted, { ...env, FIXTURE_HOSTED_DASHBOARD: '1' })
  for (const path of ['discord', 'api/discord'])
    assert.equal(existsSync(join(hosted, 'public', path)), false, `prerendered private route: ${path}`)
  await checkServer('ready', hosted)
  console.log('Standalone production server passed credentials, gateway, private dashboard and graceful shutdown checks.')
}
finally {
  rmSync(deployment, { recursive: true, force: true })
}

function buildServer(target, buildEnv) {
  const build = spawnSync(process.execPath, [join(consumer, 'node_modules/nuxt/bin/nuxt.mjs'), 'build'], {
    cwd: app,
    env: buildEnv,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
  const output = build.stdout + build.stderr
  assert.equal(build.status, 0, output)
  assert.doesNotMatch(output, /Failed to initialize Discord client|DISCORD_TOKEN environment variable is not set/, 'prerender must not start a Discord client')
  cpSync(join(app, '.output'), target, { recursive: true, verbatimSymlinks: true })
  const manifest = JSON.parse(readFileSync(join(target, 'nitro.json'), 'utf8'))
  assert.equal(manifest.preset, 'node-server')
  const assets = join(target, 'public/_nuxt')
  const dashboardRouter = readdirSync(assets).filter(file => file.endsWith('.js')).some(file =>
    readFileSync(join(assets, file), 'utf8').includes('discord-slash-commands'))
  assert.equal(dashboardRouter, buildEnv.FIXTURE_HOSTED_DASHBOARD === '1', 'compiled Vue router contains dashboard pages only in opted-in builds')
}

async function checkServer(mode, hosted) {
  const runtimeEnv = { ...env, NODE_ENV: 'production', NITRO_PORT: '0', NITRO_HOST: '127.0.0.1', TEST_GATEWAY: mode, FIXTURE_RUNTIME_REPLY: 'pong' }
  if (hosted) {
    const port = createServer().listen(0, '127.0.0.1')
    await once(port, 'listening')
    runtimeEnv.NITRO_PORT = String(port.address().port)
    await new Promise(resolve => port.close(resolve))
    runtimeEnv.DISCORD_DASHBOARD_ORIGIN = `http://127.0.0.1:${runtimeEnv.NITRO_PORT}`
    runtimeEnv.DISCORD_DASHBOARD_PASSWORD_SHA256 = createHash('sha256').update('fixture-only').digest('hex')
  }
  if (mode !== 'missing')
    Object.assign(runtimeEnv, { DISCORD_TOKEN: 'fixture-only', DISCORD_CLIENT_ID: '100000000000000001' })
  const child = spawn(process.execPath, ['--import', join(source, 'transport.mjs'), 'server/index.mjs'], {
    cwd: hosted ?? deployment,
    env: runtimeEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let log = ''
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (data) => { log += data })
  const closed = once(child, 'close')
  const timeout = setTimeout(() => child.kill('SIGKILL'), 15000)
  try {
    if (mode === 'ready') {
      while (!log.includes('fixture reply pong') || !log.includes('Listening on ')) {
        if (child.exitCode !== null || child.signalCode)
          assert.fail(log)
        await delay(50)
      }
      const url = log.match(/Listening on (http:\/\/\S+)/)?.[1]
      assert.ok(url, log)
      if (hosted) {
        await checkDashboard(url)
      }
      else {
        const built = await fetch(new URL('/build-check', url))
        assert.equal(built.status, 200)
        assert.deepEqual(await built.json(), { prerender: true, discordInitialized: false })
        const catalog = await fetch(new URL('/api/discord/catalog', url))
        assert.ok(catalog.status === 404 || !catalog.headers.get('content-type')?.includes('json'))
      }
      child.kill('SIGTERM')
      assert.deepEqual(await closed, [0, null], log)
      assert.match(log, /fixture gateway closed/)
    }
    else {
      const [code, signal] = await closed
      assert.equal(signal, null, `Server did not exit on ${mode} credentials: ${log}`)
      assert.ok(code && code > 0, log)
      assert.match(log, mode === 'missing' ? /DISCORD_TOKEN/ : /TokenInvalid/)
      assert.doesNotMatch(log, /fixture-private-login-error/)
    }
  }
  finally {
    clearTimeout(timeout)
    if (child.exitCode === null && !child.signalCode)
      child.kill('SIGKILL')
    await closed
  }
}

async function checkDashboard(url) {
  const get = (path, headers = {}) => fetch(new URL(path, url), { headers })
  const post = (path, cookie, origin = new URL(url).origin) => fetch(new URL(path, url), {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/json', cookie, origin },
    body: JSON.stringify({ name: 'ping' }),
  })
  const guest = await get('/discord/slash-commands', { accept: 'text/html' })
  assert.equal(guest.status, 401)
  assert.match(await guest.text(), /href="\/__discord-auth\/login"/)
  assert.equal((await get('/__discord-auth/session')).status, 401)
  const obsolete = `Basic ${Buffer.from('admin:fixture-only').toString('base64')}`
  assert.equal((await get('/api/discord/activity', { authorization: obsolete })).status, 401)

  const owner = await signInDashboard(url, 'owner')
  assert.deepEqual(await (await get('/__discord-auth/session', { cookie: owner })).json(), { access: 'manage' })
  assert.equal((await get('/discord/slash-commands', { cookie: owner })).status, 200)
  const catalog = await (await get('/api/discord/catalog', { cookie: owner })).json()
  assert.equal(catalog.commands[0].path, 'discord/commands/ping.ts')
  const activity = await (await get('/api/discord/activity', { cookie: owner })).json()
  assert.ok(activity.some(entry => entry.name === '/ping' && entry.userId === 'fixture' && entry.status === 'ok'), 'dashboard sees the bot gateway dispatch')
  const run = '/api/discord/slash-command/test'
  assert.equal((await post(run, owner, 'https://other.example')).status, 403)
  assert.equal((await (await post(run, owner)).json()).response, 'pong')

  const reader = await signInDashboard(url, 'reader')
  assert.deepEqual(await (await get('/__discord-auth/session', { cookie: reader })).json(), { access: 'read' })
  assert.equal((await get('/api/discord/activity', { cookie: reader })).status, 200)
  assert.equal((await post(run, reader)).status, 403)
  assert.equal((await post('/api/discord/slash-command/register', reader)).status, 403)

  const outsider = await signInDashboard(url, 'outsider')
  const denied = await get('/discord', { cookie: outsider, accept: 'text/html' })
  assert.equal(denied.status, 403)
  assert.match(await denied.text(), /<form method="post" action="\/__discord-auth\/logout">/)
  assert.equal((await get('/__discord-auth/session', { cookie: outsider })).status, 403)
  const logout = await post('/__discord-auth/logout', owner)
  assert.equal(logout.status, 303)
  assert.equal((await get('/__discord-auth/session', { cookie: owner })).status, 401)
}
