import type { PublicRuntimeConfig, RuntimeConfig } from '@nuxt/schema'
import type { NitroApp } from 'nitropack/types'
import menus from 'discord/contextMenus'
import listeners from 'discord/listeners'
import commands from 'discord/slashCommands'
import metadata from '#build/discord/slashCommands'

export function checkConsumer(app: NitroApp, config: RuntimeConfig, publicConfig: PublicRuntimeConfig, count: integer) {
  app.hooks.hook('discord:client:ready', (client) => {
    client.isReady()
    // @ts-expect-error A ready client has no such method.
    client.missingMethod()
  })
  app.hooks.hook('discord:client:error', (error) => {
    if (error.type === 'MissingRequiredOptionError')
      error.option.toUpperCase()
  })
  const guilds: string[] = config.discord.guilds
  const url: string | undefined = publicConfig.discord.wsUrl
  // @ts-expect-error Client metadata should never expose an executable handler.
  metadata[0]?.execute()
  return { guilds, url, count, handler: commands[0]?.execute, menu: menus[0]?.name, event: listeners[0]?.event }
}
