export default defineNuxtConfig({
  ui: { fonts: false },
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

  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/', '/getting-started', '/guide/middleware', '/guide/use-text-channel'],
      failOnError: true,
    },
  },

  css: ['~/assets/css/main.css'],

  srcDir: '.',

  compatibilityDate: '2025-01-01',
})
