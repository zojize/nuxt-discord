import type { NuxtDiscordContext } from '../types'
import { extendPages, installModule } from '@nuxt/kit'

export async function prepareClient(ctx: NuxtDiscordContext) {
  ctx.nuxt.options.css.push(ctx.resolve.module('runtime/client/style.css'))

  await installModule('@nuxt/ui')

  extendPages((pages) => {
    pages.unshift(
      {
        name: 'discord-overview',
        path: '/discord',
        file: ctx.resolve.module('./runtime/client/pages/overview.vue'),
        mode: 'client',
      },
      {
        name: 'discord-slash-commands',
        path: '/discord/slash-commands',
        file: ctx.resolve.module('./runtime/client/pages/slash-commands.vue'),
        mode: 'client',
      },
      {
        name: 'discord-context-menus',
        path: '/discord/context-menus',
        file: ctx.resolve.module('./runtime/client/pages/context-menus.vue'),
        mode: 'client',
      },
      {
        name: 'discord-listeners',
        path: '/discord/listeners',
        file: ctx.resolve.module('./runtime/client/pages/listeners.vue'),
        mode: 'client',
      },
      {
        name: 'discord-activity',
        path: '/discord/activity',
        file: ctx.resolve.module('./runtime/client/pages/activity.vue'),
        mode: 'client',
      },
    )
  })
}
