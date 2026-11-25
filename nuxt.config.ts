// Module-builder checks the source tree here. Resolve self-imports in generated
// declarations to that same tree even when dist contains a packed build.
export default defineNuxtConfig({
  typescript: {
    tsConfig: {
      compilerOptions: {
        paths: {
          'nuxt-discord': ['../src/module.ts'],
          'nuxt-discord/types': ['../src/types.ts'],
        },
      },
    },
  },
})
