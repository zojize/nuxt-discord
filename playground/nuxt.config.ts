export default defineNuxtConfig({
  modules: ['../src/module'],
  devtools: { enabled: true },
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
