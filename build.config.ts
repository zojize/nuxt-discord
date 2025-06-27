import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    'src/module',
  ],
  externals: [
    'node:fs',
    'node:process',
    'node:http',
    'typescript',
    'discord.js',
    'nuxt',
    'nuxt/schema',
    '@nuxt/kit',
    '@nuxt/schema',
    '@unocss/core',
  ],
  rollup: {
    inlineDependencies: true,
  },
})
