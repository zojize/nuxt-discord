import type { ClientOptions } from 'discord.js'
import type { WatchEvent } from 'nuxt/schema'
import type { SlashCommand, SlashCommandRuntime } from '~/src/types'
// ok this is unreliable but its the best I can do for now...
import slashCommands from 'discord/slashCommands'
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
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
      // this isn't relevant anymore since we rely on the full nitro server
      // to be rebuilt each time and hmr is not really needed, I can't seem
      // to figure out how actually make it hot reload without a full rebuild
      // TODO: come back if I figure out how to make it work

      const data = JSON.parse(event.data) as
        | { event: WatchEvent, path: string, command: SlashCommand | null }
        | { event: 'full-update', commands: SlashCommand[] }
      if (data.event === 'full-update') {
        const commands: SlashCommand[] = []
        for (const cmd of data.commands) {
          const runtimeCommand = cmd as SlashCommandRuntime
          // this won't work when command is updated because auto-imports
          // in dynamic imports can't be resolved
          runtimeCommand.load = () => import(cmd.path).then(m => m.default)
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

    socket.addEventListener('open', () => {
      // request a full update immediately, since serverTemplate
      // updates don't seem to be reliable
      socket.send(JSON.stringify({ event: 'full-update' }))
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
