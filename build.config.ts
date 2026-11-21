import fs from 'node:fs'
import path from 'node:path'
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
    'chokidar',
    'rollup',
  ],
  rollup: {
    inlineDependencies: true,
  },
  hooks: {
    'mkdist:entry:options': function (_ctx, _entry, options) {
      // Consumers compile the dashboard's Tailwind directives in their own app.
      options.postcss = false
    },
    // workaround until this gets fixed
    // https://github.com/nuxt/module-builder/issues/647
    'rollup:done': function (ctx) {
      const dts = path.resolve(ctx.options.outDir, 'types.d.mts')
      if (fs.existsSync(dts))
        fs.cpSync(dts, path.resolve(ctx.options.outDir, 'types.d.ts'))
    },
  },
})
