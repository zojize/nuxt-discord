import type { NuxtDiscordContext } from '~/src/types'

export function prepareRuntimeConfig(ctx: NuxtDiscordContext) {
  ctx.nuxt.hook('nitro:config', (config) => {
    config.runtimeConfig ??= {}
    config.runtimeConfig.discord ??= {}
    config.runtimeConfig.discord.intents = ctx.options.intents
    config.runtimeConfig.discord.autoStart = ctx.options.autoStart
    config.runtimeConfig.discord.sync = ctx.options.watch.sync ?? false
    config.runtimeConfig.discord.dir = ctx.resolve.root(ctx.options.dir)
    config.runtimeConfig.discord.buildDir = ctx.nuxt.options.buildDir
    config.runtimeConfig.discord.rootDir = ctx.nuxt.options.rootDir
  })
}
