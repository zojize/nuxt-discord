import type { NuxtDiscordContext } from '../types'
import { extendPages, installModule } from '@nuxt/kit'

export async function prepareClient(ctx: NuxtDiscordContext) {
  ctx.nuxt.options.css.push(ctx.resolve.module('runtime/client/style.css'))

  await installModule('@nuxt/ui')

  extendPages((pages) => {
    pages.unshift(
      {
        name: 'slash-commands',
        path: '/discord/slash-commands',
        file: ctx.resolve.module('./runtime/client/pages/slash-commands.vue'),
        mode: 'client',
      },
    )
  })
}
