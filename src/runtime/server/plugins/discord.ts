import type { ClientOptions } from 'discord.js'
import type { WatchEvent } from 'nuxt/schema'
import type { SlashCommand, SlashCommandRuntime } from '~/src/types'
import { existsSync } from 'node:fs'
import slashCommands from 'discord/slashCommands'
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { logger } from '../../../logger'
import { DiscordClient } from '../utils/client'

export default defineNitroPlugin(async (nitro) => {
  const runtimeConfig = useRuntimeConfig()

  const client = new DiscordClient()
  ;(globalThis as any)[Symbol.for('discord-client')] = client

  if ('wsUrl' in (runtimeConfig.public.discord ?? {}) && typeof runtimeConfig.public.discord.wsUrl === 'string') {
    const socket = new WebSocket(runtimeConfig.public.discord.wsUrl)

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
            .replace(/\.ts$/, '.mjs')
          const existingCommand = slashCommands.find(c => c.path === cmd.path)
          if (existsSync(buildPath)) {
            logger.log(`Dynamically loading slash command at ${buildPath}`)
            // workaround to force dynamic import to reload the module
            runtimeCommand.load = () => import(`${buildPath}?${Date.now()}`).then(m => m.default)
          }
          else if (existingCommand) {
            runtimeCommand.execute = existingCommand.execute
          }
          else {
            logger.error(`Unable to dynamically load slash command at ${cmd.path}`)
            continue
          }

          commands.push(runtimeCommand)
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

  if (runtimeConfig.discord.sync) {
    await client.registerSlashCommands()
  }

  if (runtimeConfig.discord.autoStart) {
    const options: ClientOptions = { intents: runtimeConfig.discord.intents }
    await client.start(options)
  }
})
