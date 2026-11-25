import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

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

try {
  cpSync(source, app, { recursive: true })
  cpSync(join(consumer, 'app.vue'), join(app, 'app.vue'))
  const build = spawnSync(process.execPath, [join(consumer, 'node_modules/nuxt/bin/nuxt.mjs'), 'build'], {
    cwd: app,
    env,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  })
  const output = build.stdout + build.stderr
  assert.equal(build.status, 0, output)
  assert.doesNotMatch(output, /Failed to initialize Discord client|DISCORD_TOKEN environment variable is not set/, 'prerender must not start a Discord client')
  cpSync(join(app, '.output'), deployment, { recursive: true, verbatimSymlinks: true })
  const manifest = JSON.parse(readFileSync(join(deployment, 'nitro.json'), 'utf8'))
  assert.equal(manifest.preset, 'node-server')
  assert.deepEqual(JSON.parse(readFileSync(join(deployment, 'public/build-check'), 'utf8')), {
    prerender: true,
    discordInitialized: false,
  })
  await checkServer('ready')
  await checkServer('missing')
  await checkServer('rejected')
  console.log('Standalone production server passed credential-free build, Discord dispatch, startup failures and graceful shutdown.')
}
finally {
  rmSync(deployment, { recursive: true, force: true })
}

async function checkServer(mode) {
  const runtimeEnv = { ...env, NODE_ENV: 'production', NITRO_PORT: '0', NITRO_HOST: '127.0.0.1', TEST_GATEWAY: mode, FIXTURE_RUNTIME_REPLY: 'pong' }
  if (mode !== 'missing')
    Object.assign(runtimeEnv, { DISCORD_TOKEN: 'fixture-only', DISCORD_CLIENT_ID: '100000000000000001' })
  const child = spawn(process.execPath, ['--import', join(source, 'transport.mjs'), 'server/index.mjs'], {
    cwd: deployment,
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
      const built = await fetch(new URL('/build-check', url))
      assert.equal(built.status, 200)
      assert.deepEqual(await built.json(), { prerender: true, discordInitialized: false })
      child.kill('SIGTERM')
      assert.deepEqual(await closed, [0, null], log)
      assert.match(log, /fixture gateway closed/)
    }
    else {
      const [code, signal] = await closed
      assert.equal(signal, null, `Server did not exit on ${mode} credentials: ${log}`)
      assert.ok(code && code > 0, log)
      assert.match(log, mode === 'missing' ? /DISCORD_TOKEN/ : /fixture gateway rejected login/)
    }
  }
  finally {
    clearTimeout(timeout)
    if (child.exitCode === null && !child.signalCode)
      child.kill('SIGKILL')
    await closed
  }
}
