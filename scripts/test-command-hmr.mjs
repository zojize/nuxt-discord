import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile, unlink, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'

const app = process.argv[2]
const socket = createServer().listen(0, '127.0.0.1')
await once(socket, 'listening')
const { port } = socket.address()
await new Promise(resolve => socket.close(resolve))
const server = spawn(process.execPath, ['node_modules/nuxt/bin/nuxt.mjs', 'dev', '--no-fork', '--host', '127.0.0.1', '--port', String(port)], {
  cwd: app,
  env: { ...process.env, DISCORD_TOKEN: 'fixture-only', DISCORD_CLIENT_ID: '100000000000000001', NUXT_TELEMETRY_DISABLED: '1', NITRO_PRESET: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
const closed = once(server, 'exit')
let log = ''
for (const stream of [server.stdout, server.stderr])
  stream.on('data', (data) => { log = (log + data).slice(-16000) })

async function probe(name) {
  const response = await fetch(`http://127.0.0.1:${port}/api/probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(5000),
  })
  assert.ok(response.ok, await response.clone().text())
  return name === 'version' ? response.text() : (await response.json()).content
}
async function waitForVersion(version) {
  const deadline = Date.now() + 45000
  do {
    if (server.exitCode !== null)
      throw new Error('Dev server exited')
    if (await probe('version').catch(() => '') === version)
      return
    await setTimeout(150)
  } while (Date.now() < deadline)
  throw new Error(`Timed out waiting for ${version}`)
}
async function checkDashboardStyles() {
  const page = await fetch(`http://127.0.0.1:${port}/discord/slash-commands`)
  assert.equal(page.status, 200)
  const html = await page.text()
  const href = html.match(/<link[^>]+href="([^"]*nuxt-discord[^"]*\/style\.css[^"]*)"/)?.[1]
  assert.ok(href, 'Dashboard links the installed module stylesheet')
  const response = await fetch(new URL(href, page.url), { headers: { Accept: 'text/css' } })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /text\/css/)
  const css = await response.text()
  assert.match(css, /--color-chat-canvas:\s*#(?:ffffff|fff);/)
  assert.match(css, /:root:where\(\.dark\)\s*\{[^}]*--color-chat-canvas:\s*#1b1b1f;/)
  assert.match(css, /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:where\(:not\(\.light,\s*\.dark\)\)\s*\{[^}]*--color-chat-canvas:\s*#1b1b1f;/)
  assert.match(css, /@media\s*\(forced-colors:\s*active\)\s*\{\s*:root\s*\{[^}]*--color-chat-canvas:\s*Canvas;/)
}

try {
  await waitForVersion('First version')
  await checkDashboardStyles()
  assert.equal(await probe('pull'), 'one/pool/1')
  assert.equal(await probe('ten'), '11')
  const command = join(app, 'discord/commands/pull.ts')
  const source = await readFile(command, 'utf8')
  const edited = source.replace('First version', 'Edited version')
    .replace('one/', 'edited/')
    .replace('return ref(', 'if (!(getExecutor(user, pool) instanceof Executor)) throw new Error("Duplicate executor module");\n  return ref(')
  await writeFile(command, `import { Executor } from 'pool-engine'\n${edited}`)
  await waitForVersion('Edited version')
  assert.equal(await probe('pull'), 'edited/pool/12')
  assert.equal(await probe('ten'), '22')
  // A broken edit must leave the running commands intact and allow the next save.
  for (const broken of [`import './missing-helper'\n${edited}`, 'export default =', 'export {}']) {
    log = ''
    await writeFile(command, broken)
    const until = Date.now() + 15000
    while (!log.includes('Could not reload slash commands:') && Date.now() < until)
      await setTimeout(100)
    assert.match(log, /Could not reload slash commands:/)
    assert.equal(await probe('version'), 'Edited version')
  }
  assert.equal(await probe('pull'), 'edited/pool/23')
  await writeFile(command, source.replace('First version', 'Recovered version'))
  await waitForVersion('Recovered version')
  assert.equal(await probe('pull'), 'one/pool/24')
  await unlink(command)
  await waitForVersion('(removed)')
  assert.equal(await probe('ten'), '34')
  console.log('Gacha command HMR passed: 1 → 11 → edit → 12 → 22')
}
catch (error) {
  console.error(log)
  throw error
}
finally {
  server.kill()
  await closed
}
