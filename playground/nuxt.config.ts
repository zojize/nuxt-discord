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
    autoStart: true,
    client: {
      intents: ['Guilds', 'GuildMessages'],
    },
    watch: {
      sync: false,
    },
  },
})
