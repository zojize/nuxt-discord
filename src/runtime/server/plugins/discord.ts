import type { SlashCommandRuntime } from '../../../types'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { Events } from 'discord.js'
import contextMenus from 'discord/contextMenus'
import listeners from 'discord/listeners'
import slashCommands from 'discord/slashCommands'
import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'
import { logDiscordFailure } from '../../diagnostics'
import { DiscordClient } from '../utils/client'

export default defineNitroPlugin(async (nitro) => {
  if (import.meta.prerender)
    return

  const runtimeConfig = useRuntimeConfig()
  let closed = false
  function fail(message: string, error?: unknown) {
    logDiscordFailure(message, error)
    if (!import.meta.dev && runtimeConfig.discord.autoStart && !closed)
      process.exit(1)
  }

  let client: DiscordClient
  try {
    client = new DiscordClient()
  }
  catch (error) {
    fail('Failed to initialize Discord client:', error)
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
      logDiscordFailure('Dashboard WebSocket error:', error)
    })

    let syncTimer: ReturnType<typeof setTimeout>
    const sync = runtimeConfig.discord.sync
    function scheduleSync() {
      if (!sync || closed)
        return
      clearTimeout(syncTimer)
      syncTimer = setTimeout(() => {
        void client.syncCommandRegistrations({ changedOnly: true }).then((results) => {
          if (results.length && socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ event: 'registration-updated' }))
        }).catch(error => logDiscordFailure('Command sync failed:', error))
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
        logDiscordFailure('Could not load updated slash commands:', error)
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
  nitro.hooks.hook('close', () => {
    closed = true
    return client.stop()
  })

  // Let the application's Nitro plugins register their configuration and ready hooks.
  await Promise.resolve()
  if (closed)
    return

  if (runtimeConfig.discord.autoStart) {
    try {
      await client.start(runtimeConfig.discord.client)
      const gateway = client.internalClient
      gateway?.on(Events.ShardDisconnect, (event, shard) => {
        if (client.internalClient === gateway && !closed)
          fail(`Discord shard ${shard} disconnected and cannot reconnect. Close code: ${event.code}`)
      })
    }
    catch (error) {
      if (!closed)
        fail('Failed to start Discord client:', error)
      return
    }
  }

  if (!closed && runtimeConfig.discord.sync) {
    try {
      await client.syncCommandRegistrations()
    }
    catch (error) {
      logDiscordFailure('Command sync failed:', error)
    }
  }
})
