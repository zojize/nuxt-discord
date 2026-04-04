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
    watch: {
      sync: false,
    },
  },
})
