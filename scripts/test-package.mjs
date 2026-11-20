import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const app = mkdtempSync(join(tmpdir(), 'nuxt-discord-consumer-'))
const env = {
  ...process.env,
  DISCORD_TOKEN: 'fixture-only',
  DISCORD_CLIENT_ID: '100000000000000001',
  DISCORD_OWNER_ID: 'owner',
  NUXT_TELEMETRY_DISABLED: '1',
  NITRO_PRESET: 'node-listener',
}
function run(command, args, cwd) {
  execFileSync(command, args, { cwd, env, stdio: 'inherit' })
}
try {
  run('bun', ['run', 'prepack'], root)
  run('bun', ['pm', 'pack', '--ignore-scripts', '--destination', app], root)
  writeFileSync(join(app, 'package.json'), JSON.stringify({
    name: 'release-consumer',
    private: true,
    type: 'module',
    dependencies: {
      'nuxt-discord': `file:./nuxt-discord-${pkg.version}.tgz`,
      'nuxt': pkg.devDependencies.nuxt,
      'discord.js': pkg.peerDependencies['discord.js'],
    },
  }))
  cpSync(join(root, 'test/fixtures/basic/discord'), join(app, 'discord'), { recursive: true })
  cpSync(join(root, 'test/fixtures/packed/check.mjs'), join(app, 'check.mjs'))
  writeFileSync(join(app, 'nuxt.config.ts'), `export default defineNuxtConfig({
    modules: ['nuxt-discord'],
    ui: { fonts: false },
    discord: { autoStart: false, interactionTimeout: 1, watch: { enabled: false, sync: false } },
  })`)
  writeFileSync(join(app, 'app.vue'), '<template><main>Consumer app</main></template>')
  run('bun', ['install'], app)
  run('bun', ['run', 'nuxt', 'build'], app)
  run(process.execPath, ['check.mjs'], app)
  cpSync(join(root, 'test/fixtures/hmr'), app, { recursive: true })
  run(process.execPath, [join(root, 'scripts/test-command-hmr.mjs'), app], app)
}
finally {
  rmSync(app, { recursive: true, force: true })
}
