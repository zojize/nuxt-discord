export default defineNuxtConfig({
  modules: [
    '@nuxt/content',
    '@nuxt/ui',
  ],

  content: {
    build: {
      markdown: {
        highlight: {
          langs: ['ts', 'vue', 'bash', 'json', 'css'],
        },
      },
    },
  },

  routeRules: {
    '/': { redirect: '/getting-started' },
  },

  css: ['~/assets/css/main.css'],

  srcDir: '.',

  compatibilityDate: '2025-01-01',
})
