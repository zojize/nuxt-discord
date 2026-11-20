import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: ['nuxt-discord'],
  devtools: { enabled: false },
  ui: { fonts: false },
  alias: { 'pool-engine': fileURLToPath(new URL('./lib/executor.ts', import.meta.url)) },
  nitro: { virtual: { 'virtual:gacha-pool': 'export const pool = "standard"' } },
  discord: { autoStart: false, watch: { enabled: true, hostname: '127.0.0.1', port: 0, sync: false } },
})
