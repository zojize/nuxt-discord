export default defineNuxtConfig({
  modules: ['nuxt-discord'],
  nitro: { prerender: { routes: ['/build-check'] } },
})
