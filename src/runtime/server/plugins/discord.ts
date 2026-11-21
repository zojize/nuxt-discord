import type { SlashCommandRuntime } from '../../../types'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import contextMenus from 'discord/contextMenus'
import listeners from 'discord/listeners'
import slashCommands from 'discord/slashCommands'
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { logger } from '../../logger'
import { DiscordClient } from '../utils/client'

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

    // Broadcast activity log entries to dashboard clients
    client.onActivity((entry) => {
      try {
        socket.send(JSON.stringify({ event: 'activity', entry }))
      }
      catch { /* ignore */ }
    })

    socket.addEventListener('error', (error) => {
      console.error('WebSocket error:', error)
    })

    let syncTimer: ReturnType<typeof setTimeout>
    let closed = false
    const sync = runtimeConfig.discord.sync
    function scheduleSync() {
      if (!sync || closed)
        return
      clearTimeout(syncTimer)
      syncTimer = setTimeout(() => {
        void client.syncCommandRegistrations({ changedOnly: true }).then((results) => {
          if (results.length && socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ event: 'registration-updated' }))
        }).catch(error => logger.error('Command sync failed:', error))
      }, sync.debounce ?? 1000)
    }
    let requested = 0
    socket.addEventListener('open', () => socket.send(JSON.stringify({ event: 'command-revision' })))
    socket.addEventListener('message', async (event) => {
      const data = JSON.parse(event.data)
      if (data.event !== 'command-revision' || !Number.isSafeInteger(data.revision) || data.revision <= requested)
        return
      const revision = requested = data.revision
      const url = pathToFileURL(join(runtimeConfig.discord.buildDir, 'discord/hmr', String(revision), 'commands.mjs'))
      try {
        const { default: commands } = await import(url.href)
        if (revision === requested) {
          client.clearSlashCommands()
          client.addSlashCommands(commands)
          scheduleSync()
        }
      }
      catch (error) {
        logger.error('Could not load updated slash commands:', error)
      }
    })

    nitro.hooks.hook('close', () => {
      closed = true
      clearTimeout(syncTimer)
      socket.close()
    })
  }

  client.addSlashCommands(slashCommands as SlashCommandRuntime[])
  client.addContextMenus(contextMenus)
  client.registerListeners(listeners)
  nitro.hooks.hook('close', () => client.stop())

  try {
    if (runtimeConfig.discord.sync)
      await client.syncCommandRegistrations().catch(error => logger.error('Command sync failed:', error))

    if (runtimeConfig.discord.autoStart)
      await client.start(runtimeConfig.discord.client)
  }
  catch (error) {
    logger.error('Failed to start Discord client:', error)
  }
})
