import type { NuxtDiscordOptions } from './types'
import { addImports, addServerScanDir, defineNuxtModule } from '@nuxt/kit'
import { GatewayIntentBits } from 'discord.js'
import { createContext } from './context'
import { prepareClient } from './utils/client'
import collectSlashCommands from './utils/collect'
import collectContextMenus from './utils/collectContextMenus'
import collectListeners from './utils/collectListeners'
import { prepareHMR } from './utils/hmr'
import { prepareRuntimeConfig } from './utils/runtimeConfig'
import { prepareTemplates } from './utils/templates'

export type * from './types'

export default defineNuxtModule<NuxtDiscordOptions>({
  meta: {
    name: 'nuxt-discord',
    configKey: 'discord',
  },
  defaults: {
    client: {
      intents: [GatewayIntentBits.Guilds],
      deferOnPromise: true,
    },
    dir: 'discord',
    autoStart: true,
    watch: {
      enabled: true,
      port: 5720,
      showURL: false,
      sync: {
        debounce: 1000, // milliseconds
      },
    },
  },
  setup(discordOptions, nuxt) {
    const ctx = createContext(discordOptions, nuxt)

    // Disable SSR for the client-only admin UI pages
    nuxt.options.routeRules ??= {}
    nuxt.options.routeRules['/discord/**'] = { ssr: false }

    addServerScanDir(ctx.resolve.module('runtime/server'))
    // this prevents not found errors in the client
    addImports([
      {
        name: 'defineSlashCommand',
        as: 'defineSlashCommand',
        from: ctx.resolve.module('runtime/server/utils/defineSlashCommand'),
      },
      {
        name: 'defineListener',
        as: 'defineListener',
        from: ctx.resolve.module('runtime/server/utils/defineListener'),
      },
      {
        name: 'defineUserContextMenu',
        as: 'defineUserContextMenu',
        from: ctx.resolve.module('runtime/server/utils/defineContextMenu'),
      },
      {
        name: 'defineMessageContextMenu',
        as: 'defineMessageContextMenu',
        from: ctx.resolve.module('runtime/server/utils/defineContextMenu'),
      },
      {
        name: 'defineMiddleware',
        as: 'defineMiddleware',
        from: ctx.resolve.module('runtime/server/utils/defineMiddleware'),
      },
      {
        name: 'MiddlewareError',
        as: 'MiddlewareError',
        from: ctx.resolve.module('runtime/server/utils/defineMiddleware'),
      },
      {
        name: 'useMiddleware',
        as: 'useMiddleware',
        from: ctx.resolve.module('runtime/server/utils/defineMiddleware'),
      },
      {
        name: 'useMiddlewareContext',
        as: 'useMiddlewareContext',
        from: ctx.resolve.module('runtime/server/utils/defineMiddleware'),
      },
      {
        name: 'guildOnly',
        as: 'guildOnly',
        from: ctx.resolve.module('runtime/server/utils/middleware/guildOnly'),
      },
      {
        name: 'ownerOnly',
        as: 'ownerOnly',
        from: ctx.resolve.module('runtime/server/utils/middleware/ownerOnly'),
      },
      {
        name: 'cooldown',
        as: 'cooldown',
        from: ctx.resolve.module('runtime/server/utils/middleware/cooldown'),
      },
      {
        name: 'requireRole',
        as: 'requireRole',
        from: ctx.resolve.module('runtime/server/utils/middleware/requireRole'),
      },
    ])

    prepareRuntimeConfig(ctx)

    collectSlashCommands(ctx)
    collectContextMenus(ctx)
    collectListeners(ctx)

    prepareTemplates(ctx)

    prepareHMR(ctx)

    prepareClient(ctx)
  },
})
