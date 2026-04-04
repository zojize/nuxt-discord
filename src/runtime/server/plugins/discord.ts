import type { WatchEvent } from 'nuxt/schema'
import type { SlashCommand, SlashCommandRuntime } from '../../../types'
import fs from 'node:fs'
import process from 'node:process'
import contextMenus from 'discord/contextMenus'
import listeners from 'discord/listeners'
import slashCommands from 'discord/slashCommands'
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { logger } from '../../logger'
import { DiscordClient } from '../utils/client'

const TS_EXT_RE = /\.ts$/

export default defineNitroPlugin(async (nitro) => {
  const runtimeConfig = useRuntimeConfig()

  let client: DiscordClient
  try {
    client = new DiscordClient()
  }
  catch (error) {
    logger.error('Failed to initialize Discord client:', error)
    return
  }
  ;(globalThis as any)[Symbol.for('discord-client')] = client

  const publicDiscord = (runtimeConfig.public as any).discord as { wsUrl?: string } | undefined
  if (publicDiscord?.wsUrl) {
    const socket = new WebSocket(publicDiscord.wsUrl)

    socket.addEventListener('error', (error) => {
      console.error('WebSocket error:', error)
    })

    socket.addEventListener('message', async (event) => {
      const data = JSON.parse(event.data) as
        | { event: WatchEvent, path: string, command: SlashCommand | null }
        | { event: 'full-update', commands: SlashCommand[] }
      if (data.event === 'full-update') {
        const commands: SlashCommand[] = []
        for (const cmd of data.commands) {
          const runtimeCommand = cmd as SlashCommandRuntime
          const buildPath = cmd.path
            .replace(runtimeConfig.discord.rootDir, runtimeConfig.discord.buildDir)
            .replace(TS_EXT_RE, '.mjs')
          const existingCommand = client.getSlashCommands().find(c => c.path === cmd.path)

          if (fs.existsSync(buildPath)) {
            // get the last modified time of the file
            const lastModified = fs.statSync(buildPath).mtimeMs
            // workaround to force dynamic import to reload the module
            runtimeCommand.load = () => import(`${buildPath}?${lastModified}`).then(m => m.default)
          }
          else if (existingCommand) {
            runtimeCommand.execute = existingCommand.execute
          }
          else {
            logger.error(`Unable to dynamically load slash command at ${cmd.path}`)
            continue
          }

          commands.push(runtimeCommand as SlashCommand)
        }
        client.clearSlashCommands()
        client.addSlashCommands(commands)
        // TODO: sync if enabled
      }
      else {
        // alway request a full update on any change
        socket.send(JSON.stringify({ event: 'full-update' }))
      }
    })

    nitro.hooks.hook('close', () => socket.close())
  }

  client.addSlashCommands(slashCommands as SlashCommandRuntime[])
  client.addContextMenus(contextMenus)

  try {
    if (runtimeConfig.discord.sync) {
      // Support DISCORD_GUILD_ID env var (comma-separated) as fallback for guild IDs
      const envGuilds = process.env.DISCORD_GUILD_ID?.split(',').map(id => id.trim()).filter(Boolean) ?? []
      const guildIds = runtimeConfig.discord.guilds.length > 0
        ? runtimeConfig.discord.guilds
        : envGuilds
      await client.registerSlashCommands(guildIds)
    }

    if (runtimeConfig.discord.autoStart) {
      await client.start(runtimeConfig.discord.client)
      client.registerListeners(listeners)
    }
  }
  catch (error) {
    logger.error('Failed to start Discord client:', error)
  }
})
