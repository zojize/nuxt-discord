import type { ModuleDependencies } from 'nuxt/schema'
import type { NuxtDiscordOptions } from './types'
import { addImports, addServerHandler, addServerImportsDir, addServerPlugin, addServerScanDir, defineNuxtModule, extendRouteRules, loadNuxtModuleInstance } from '@nuxt/kit'
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
  async moduleDependencies(nuxt): Promise<ModuleDependencies> {
    if (nuxt.options.dev || nuxt.options._prepare)
      return { '@nuxt/ui': {} }
    // Nuxt resolves module dependencies before merging inline module options.
    let hosted = nuxt.options.discord && nuxt.options.discord.dashboard
    for (const entry of nuxt.options.modules) {
      if (!Array.isArray(entry) || typeof entry[1]?.dashboard !== 'boolean')
        continue
      const { nuxtModule } = await loadNuxtModuleInstance(entry[0], nuxt)
      if ((await nuxtModule.getMeta?.())?.name === 'nuxt-discord') {
        hosted = entry[1].dashboard
        break
      }
    }
    return hosted ? { '@nuxt/ui': {} } : {}
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
    const development = nuxt.options.dev || nuxt.options._prepare
    const hostedDashboard = !development && discordOptions.dashboard === true

    if (hostedDashboard) {
      addServerHandler({ middleware: true, handler: ctx.resolve.module('runtime/dashboard/auth') })
      for (const route of ['/discord', '/discord/**', '/api/discord', '/api/discord/**'])
        extendRouteRules(route, { prerender: false, cache: false }, { override: true })
      for (const [path, method] of [
        ['catalog', 'get'],
        ['activity', 'get'],
        ['slash-command/all', 'get'],
        ['slash-command/remote-all', 'get'],
        ['slash-command/remote-diff', 'post'],
        ['slash-command/register', 'post'],
        ['slash-command/test', 'post'],
        ['slash-command/autocomplete', 'post'],
      ] as const) {
        addServerHandler({
          route: `/api/discord/${path}`,
          method,
          handler: ctx.resolve.module(`runtime/server/api/discord/${path}.${method}`),
        })
      }
    }

    if (development || hostedDashboard) {
      extendRouteRules('/discord', { ssr: false })
      extendRouteRules('/discord/**', { ssr: false })
      prepareClient(ctx)
    }
    if (development) {
      addServerScanDir(ctx.resolve.module('runtime/server'))
    }
    else {
      const plugin = ctx.resolve.module('runtime/server/plugins/discord')
      addServerPlugin(plugin)
      // The prerenderer builds a separate Nitro app. Importing the bot plugin
      // there would evaluate every command and its runtime-only dependencies.
      nuxt.hook('nitro:init', (nitro) => {
        nitro.hooks.hook('prerender:config', (config) => {
          config.plugins = config.plugins?.filter(entry => entry !== plugin)
        })
      })
      addServerImportsDir(ctx.resolve.module('runtime/server/utils'))
      addServerImportsDir(ctx.resolve.module('runtime/server/utils/middleware'))
    }
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
      {
        name: 'useTextChannel',
        as: 'useTextChannel',
        from: ctx.resolve.module('runtime/server/utils/useTextChannel'),
      },
    ])

    prepareRuntimeConfig(ctx)

    collectSlashCommands(ctx)
    collectContextMenus(ctx)
    collectListeners(ctx)

    prepareTemplates(ctx)

    prepareHMR(ctx)
  },
})
