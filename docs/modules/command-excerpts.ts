import { addVitePlugin, defineNuxtModule } from '@nuxt/kit'
import { codeToHtml } from 'shiki'

export default defineNuxtModule({
  setup() {
    addVitePlugin({
      name: 'command-excerpts',
      enforce: 'pre',
      async transform(source, id) {
        if (!id.endsWith('.ts?command-excerpt'))
          return

        const lines = source.trimEnd().split('\n')
        const excerpt = lines.filter((line, index) =>
          line.startsWith('export default') || line.trimStart().startsWith('return ') || index === lines.length - 1,
        ).join('\n')
        const html = await codeToHtml(excerpt, {
          lang: 'ts',
          themes: { light: 'light-plus', dark: 'dark-plus' },
          defaultColor: false,
          tabindex: false,
        })
        return { code: `export default ${JSON.stringify(html)}`, map: null }
      },
    })
  },
})
