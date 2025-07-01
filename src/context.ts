import type { Nuxt } from 'nuxt/schema'
import type { NuxtDiscordContext, NuxtDiscordOptions } from './types'
import { createResolver } from '@nuxt/kit'
import { logger } from './runtime/logger'

export function createContext(options: NuxtDiscordOptions, nuxt: Nuxt): NuxtDiscordContext {
  return {
    nuxt,
    options,
    slashCommands: [],
    resolve: {
      root: createResolver(nuxt.options.rootDir).resolve,
      module: createResolver(import.meta.url).resolve,
    },
    logger,
  }
}
