import process from 'node:process'

const hosted = process.env.FIXTURE_HOSTED_DASHBOARD === '1'
export default defineNuxtConfig({
  modules: [['nuxt-discord', { dashboard: hosted }]],
  ui: { fonts: false },
  nitro: { prerender: { routes: hosted ? ['/discord', '/discord/slash-commands', '/api/discord/catalog'] : ['/build-check'] } },
})
