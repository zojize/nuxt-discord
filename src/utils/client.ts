import type { NuxtDiscordContext } from '../types'
import { extendPages } from '@nuxt/kit'

declare module '@nuxt/schema' {
  interface NuxtHooks {
    // eslint-disable-next-line ts/method-signature-style -- Match the overload when @nuxt/icon's declarations are also loaded.
    'icon:clientBundleIcons'(icons: Set<string>): void
  }
}

export function prepareClient(ctx: NuxtDiscordContext) {
  // The application's icon scanner does not see components shipped in this package.
  ctx.nuxt.hook('icon:clientBundleIcons', (icons) => {
    for (const name of [
      'lucide:blocks',
      'lucide:circle-x',
      'lucide:eye',
      'lucide:gift',
      'lucide:pin',
      'lucide:plus',
      'lucide:send-horizontal',
      'lucide:shapes',
      'lucide:smile',
      'lucide:sticker',
      'simple-icons:discord',
      'simple-icons:github',
    ]) icons.add(name)
  })
  ctx.nuxt.options.css.push(ctx.resolve.module('runtime/client/style.css'))

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
