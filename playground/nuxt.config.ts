import process from 'node:process'

export default defineNuxtConfig({
  modules: ['../src/module'],
  devtools: { enabled: true },
  devServer: { port: 3434 },
  routeRules: {
    '/': {
      redirect: '/discord/slash-commands',
    },
  },
  discord: {
    dashboard: process.env.DISCORD_BUILD_DASHBOARD === '1',
    autoStart: true,
    client: {
      intents: ['Guilds', 'GuildMessages'],
    },
    watch: {
      sync: false,
    },
  },
})
