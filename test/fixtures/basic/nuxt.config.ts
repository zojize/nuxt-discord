import MyModule from '../../../src/module'

export default defineNuxtConfig({
  ui: { fonts: false },
  modules: [
    MyModule,
  ],
  discord: {
    autoStart: false,
    watch: {
      enabled: false,
      sync: false,
    },
  },
})
