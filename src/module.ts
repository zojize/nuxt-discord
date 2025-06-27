import type { NuxtDiscordOptions } from './types'
import { addImports, addServerScanDir, defineNuxtModule } from '@nuxt/kit'
import { GatewayIntentBits } from 'discord.js'
import { createContext } from './context'
import { prepareClient } from './utils/client'
import collectSlashCommands from './utils/collect'
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
    intents: [GatewayIntentBits.Guilds],
    dir: 'discord',
    autoStart: true,
    watch: {
      enabled: true,
      port: 4222,
      showURL: false,
      sync: {
        debounce: 1000, // milliseconds
      },
    },
  },
  setup(discordOptions, nuxt) {
    const ctx = createContext(discordOptions, nuxt)

    addServerScanDir(ctx.resolve.module('runtime/server'))
    // this prevents not found errors in the client
    addImports([{
      name: 'defineSlashCommand',
      as: 'defineSlashCommand',
      from: ctx.resolve.module('runtime/server/utils/defineSlashCommand'),
    }])

    prepareRuntimeConfig(ctx)

    collectSlashCommands(ctx)

    prepareTemplates(ctx)

    prepareHMR(ctx)

    prepareClient(ctx)
  },
})
