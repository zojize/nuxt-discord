export default defineNuxtConfig({
  modules: [
    '@nuxt/content',
    '@nuxt/ui',
  ],

  app: {
    // eslint-disable-next-line node/prefer-global/process
    baseURL: process.env.NUXT_APP_BASE_URL ?? '/',
  },

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

  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/getting-started', '/guide/middleware'],
    },
  },

  css: ['~/assets/css/main.css'],

  srcDir: '.',

  compatibilityDate: '2025-01-01',
})
