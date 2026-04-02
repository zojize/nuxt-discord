import MyModule from '../../../src/module'

export default defineNuxtConfig({
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
