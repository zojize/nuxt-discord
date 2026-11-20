import type { Listener } from 'listhen'
import type { Buffer } from 'node:buffer'
import type { IncomingMessage } from 'node:http'
import type { InputOptions, OutputOptions } from 'rollup'
import type { WebSocket } from 'ws'
import type { NuxtDiscordContext } from '../types'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isIgnored, updateTemplates } from '@nuxt/kit'
import chokidar from 'chokidar'
import { listen } from 'listhen'
import { rollup } from 'rollup'
import { WebSocketServer } from 'ws'
import collectSlashCommands from './collect'
import { captureCommandImports, registryEntry, reuseCommandDependencies } from './commandDependencies'
import { getSlashCommandTemplateContent } from './templates'
import TransformPlugin from './transform'

type RollupConfig = InputOptions & {
  output: OutputOptions
}

export function prepareHMR(ctx: NuxtDiscordContext) {
  const { nuxt, options } = ctx

  const watching = nuxt.options.dev && options.watch.enabled
  const commandsDir = ctx.resolve.root(options.dir, 'commands') + path.sep
  const hotDir = path.join(nuxt.options.buildDir, 'discord', 'hmr')
  let dependencies = new Set<string>()
  const updated = new Map<string, string>()
  let revision = 0
  let nextRevision = 0
  let rollupConfig: RollupConfig
  nuxt.hook('nitro:init', (nitro) => {
    nitro.hooks.hook('rollup:before', (_nitro, config) => {
      config.plugins = [config.plugins, TransformPlugin(ctx)]
      if (watching) {
        rollupConfig = { ...config, plugins: config.plugins as InputOptions['plugins'] }
        config.plugins = [config.plugins, captureCommandImports(nuxt.options.rootDir, nuxt.options.buildDir, ctx.resolve.module('runtime/server'), (ids) => {
          dependencies = ids
          updated.clear()
          revision = 0
        })]
      }
    })
  })

  if (watching) {
    const ignoreCommandsDir = (file: string) => {
      if (file === commandsDir.slice(0, -1) || file.startsWith(commandsDir)) {
        return true
      }
      return isIgnored(file)
    }

    // nitro dev server ignore discord commands directory

    nuxt.hook('nitro:config', (nitroConfig) => {
      nitroConfig.watchOptions ??= {}
      const existingNitroIgnored = nitroConfig.watchOptions.ignored
      const nitroIgnored: typeof nitroConfig.watchOptions.ignored & any[] = [ignoreCommandsDir]
      if (existingNitroIgnored != null) {
        if (Array.isArray(existingNitroIgnored))
          nitroIgnored.push(...existingNitroIgnored)
        else
          nitroIgnored.push(existingNitroIgnored)
      }
      nitroConfig.watchOptions.ignored = nitroIgnored
    })

    // vite dev server ignore discord commands directory
    nuxt.options.vite.server ??= {}
    nuxt.options.vite.server.watch ??= {}
    const existingViteIgnored = nuxt.options.vite.server.watch.ignored
    const viteIgnored: typeof nuxt.options.vite.server.watch.ignored = [ignoreCommandsDir]
    if (existingViteIgnored != null) {
      if (Array.isArray(existingViteIgnored)) {
        viteIgnored.push(...existingViteIgnored)
      }
      else {
        viteIgnored.push(existingViteIgnored)
      }
    }
    nuxt.options.vite.server.watch.ignored = viteIgnored

    let websocket: ReturnType<typeof createWebSocket>
    let listener: Listener
    const websocketOptions = options.watch || {}
    nuxt.hook('nitro:init', async (nitro) => {
      websocket = createWebSocket()

      await rm(hotDir, { recursive: true, force: true })

      // Listen dev server
      listener = await listen(() => 'Nuxt Discord', websocketOptions)

      // Register ws url
      nitro.options.runtimeConfig.public.discord = {
        wsUrl: listener.url.replace('http', 'ws'),
      }

      listener.server.on('upgrade', websocket.serve)

      websocket.on('full-update', (client) => {
        try {
          client.send(JSON.stringify({
            event: 'full-update',
            commands: ctx.slashCommands,
          }))
        }
        catch {
        }
      })

      websocket.on('command-revision', (client) => {
        if (revision)
          client.send(JSON.stringify({ event: 'command-revision', revision }))
      })

      // Relay activity events from server plugin to all browser clients
      websocket.on('activity', (_client, message) => {
        websocket.broadcast(message)
      })
    })

    const dirty = new Set<string>()
    const modified = new Set<string>()
    nuxt.hook('nitro:init', (nitro) => {
      nitro.hooks.hook('compiled', () => {
        modified.forEach(file => dirty.add(file))
        void rebuild()
      })
    })
    let building = false
    let closed = false
    async function rebuild() {
      if (building || !rollupConfig || closed)
        return
      building = true
      try {
        while (dirty.size) {
          if (closed)
            return
          const changed = new Set(dirty)
          dirty.clear()
          const version = ++nextRevision
          const initial = dependencies
          const outputDir = path.join(hotDir, String(version))
          try {
            const snapshot = { ...ctx }
            collectSlashCommands(snapshot)
            const source = getSlashCommandTemplateContent(snapshot, true)
            const additions = await buildCommandUpdate(rollupConfig, source, outputDir, initial, updated, changed)
            if (initial !== dependencies || closed) {
              changed.forEach(file => dirty.add(file))
              continue
            }
            ctx.slashCommands = snapshot.slashCommands
            for (const id of changed)
              updated.delete(id)
            additions.forEach((url, id) => updated.set(id, url))
            revision = version
            websocket?.broadcast({ event: 'command-revision', revision })
            websocket?.broadcast({ event: 'full-update', commands: ctx.slashCommands })
            await updateTemplates({ filter: template => template.filename === 'discord/slashCommands' })
          }
          catch (error) {
            ctx.logger.error('Could not reload slash commands:', error)
            // Retry failed files along with the next edit.
            const retry = dirty.size > 0
            changed.forEach(file => dirty.add(file))
            if (!retry)
              break
          }
        }
      }
      finally { building = false }
    }

    const watcher = chokidar.watch(commandsDir, { ignoreInitial: true })
      .on('all', (event, file) => {
        if (['add', 'change', 'unlink'].includes(event) && file.endsWith('.ts')) {
          const id = path.resolve(file).split(path.sep).join('/')
          dirty.add(id)
          modified.add(id)
          void rebuild()
        }
      })
    nuxt.hook('close', async () => {
      closed = true
      await watcher.close()
      listener?.server.close()
      websocket?.close()
    })
  }
}

async function buildCommandUpdate(
  config: RollupConfig,
  source: string,
  outputDir: string,
  dependencies: Set<string>,
  updated: Map<string, string>,
  changed: Set<string>,
) {
  const additions = new Map<string, string>()
  const bundle = await rollup({
    ...config,
    input: registryEntry,
    treeshake: false,
    preserveEntrySignatures: 'strict',
    plugins: [
      { name: 'discord:hot-registry', resolveId: id => id === registryEntry ? id : null, load: id => id === registryEntry ? source : null },
      reuseCommandDependencies(dependencies, updated, changed),
      config.plugins,
    ],
  })
  try {
    const { output } = await bundle.write({
      ...config.output,
      dir: outputDir,
      entryFileNames: chunk => chunk.facadeModuleId === registryEntry ? 'commands.mjs' : '[name]-[hash].mjs',
      inlineDynamicImports: false,
      preserveModules: true,
      minifyInternalExports: false,
      manualChunks: undefined,
      sourcemap: false,
    })
    for (const chunk of output) {
      if (chunk.type === 'chunk' && chunk.facadeModuleId)
        additions.set(chunk.facadeModuleId, pathToFileURL(path.join(outputDir, chunk.fileName)).href)
    }
  }
  finally { await bundle.close() }
  return additions
}

/**
 * Source: https://github.com/nuxt/content/blob/e2d274b7fee9edcba742619c5baedf65ab8475ab/src/utils/dev.ts
 *
 * WebSocket server useful for live content reload.
 */
function createWebSocket() {
  const wss = new WebSocketServer({ noServer: true })

  const serve = (req: IncomingMessage, socket = req.socket, head: Buffer) =>
    wss.handleUpgrade(req, socket, head, (client: WebSocket) => {
      wss.emit('connection', client, req)
    })

  const broadcast = (data: unknown) => {
    const message = JSON.stringify(data)

    for (const client of wss.clients) {
      try {
        client.send(message)
      }
      catch (err) {
        /* Ignore error (if client not ready to receive event) */
        console.error(err)
      }
    }
  }

  const listeners = new Map<string, ((...args: any[]) => void)[]>()
  const on = (event: string, listener: (client: WebSocket, message: any) => void) => {
    listeners.set(event, [...(listeners.get(event) || []), listener])
  }

  wss.on('connection', (client: WebSocket) => {
    client.on('message', (data: WebSocket.Data) => {
      let message
      try {
        message = JSON.parse(data.toString())
      }
      catch {
        return
      }
      const event = message.event
      const eventListeners = listeners.get(event) ?? []
      for (const listener of eventListeners) {
        try {
          listener(client, message)
        }
        catch {
          // ignore errors
        }
      }
    })
  })

  return {
    serve,
    broadcast,
    on,
    close: () => {
      // disconnect all clients
      wss.clients.forEach(client => client.close())
      // close the server
      return new Promise(resolve => wss.close(resolve))
    },
  }
}
