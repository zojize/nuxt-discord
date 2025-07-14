import type { Listener } from 'listhen'
import type { Buffer } from 'node:buffer'
import type { IncomingMessage } from 'node:http'
import type { InputOptions, OutputOptions, RollupBuild } from 'rollup'
import type { WebSocket } from 'ws'
import type { NuxtDiscordContext } from '../types'
import fs from 'node:fs'
import path from 'node:path'
import { addVitePlugin, isIgnored, resolveAlias, updateTemplates } from '@nuxt/kit'
import chokidar from 'chokidar'
import { listen } from 'listhen'
import { rollup } from 'rollup'
import { WebSocketServer } from 'ws'
import collectSlashCommands, { processCommandFile } from './collect'
import TransformPlugin from './transform'

type RollupConfig = InputOptions & {
  output: OutputOptions
}

export function prepareHMR(ctx: NuxtDiscordContext) {
  const { nuxt, options } = ctx

  if (nuxt.options.dev) {
    const commandsDir = ctx.resolve.root(options.dir, 'commands')

    const ignoreCommandsDir = (file: string) => {
      if (file.startsWith(commandsDir)) {
        return true
      }
      return isIgnored(file)
    }

    // nitro dev server ignore discord commands directory
    let rollupConfig: RollupConfig

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

      // @ts-expect-error - i don't understand why ts complains about this
      const originalBeforeHook = nitroConfig.hooks?.['rollup:before']
      nitroConfig.hooks = {
        ...nitroConfig.hooks,
        'rollup:before': (nitroCtx, config) => {
          originalBeforeHook?.(nitroCtx, config)
          // TODO: might need to merge with user nuxt config.server.rollupConfig.plugins
          config.plugins = [
            config.plugins,
            TransformPlugin(ctx),
          ]
          rollupConfig = config
        },
      }
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
    if (websocketOptions.enabled) {
      nuxt.hook('nitro:init', async (nitro) => {
        websocket = createWebSocket()

        // Listen dev server
        listener = await listen(() => 'Nuxt Discord', websocketOptions)

        // Register ws url
        nitro.options.runtimeConfig.public.discord = {
          wsUrl: listener.url.replace('http', 'ws'),
        }

        listener.server.on('upgrade', websocket.serve)

        websocket.on('full-update', (client) => {
          collectSlashCommands(ctx)
          try {
            client.send(JSON.stringify({
              event: 'full-update',
              commands: ctx.slashCommands,
            }))
          }
          catch {
          }
        })
      })
    }

    const commandsBuildDir = path.join(ctx.nuxt.options.buildDir, 'discord', 'commands')
    // clears the commands build directory
    fs.rmSync(commandsBuildDir, { recursive: true, force: true })
    fs.mkdirSync(commandsBuildDir, { recursive: true })

    chokidar.watch(ctx.resolve.root(ctx.options.dir, 'commands'), { ignoreInitial: true })
      .on('all', async (event, path) => {
        if (event === 'all' || event === 'error' || event === 'raw') {
          return
        }

        const fullPath = ctx.resolve.root(path)
        if (fullPath.startsWith(commandsDir)) {
          path = ctx.resolve.root(path)
          const command = processCommandFile(ctx, path) ?? null
          if (event === 'add' || event === 'change') {
            ctx.logger.log(`Dynamically loading slash command at ${path}`)
            await generateDynamicCommandBuild(path, rollupConfig, ctx)
          }
          websocket?.broadcast({ event, path, command })

          // I don't think this is doing anything at all...
          await updateTemplates({
            filter: template => template.filename === 'discord/slashCommands',
          })
        }
      })

    nuxt.hook('close', () => {
      listener?.server.close()
      websocket?.close()
    })

    // generate unocss for client vue components when developing the module
    const packageJson = ctx.resolve.module('../package.json')
    if (fs.existsSync(packageJson) && JSON.parse(fs.readFileSync(packageJson, 'utf-8')).name === 'nuxt-discord') {
      (async () => {
        const { createGenerator } = await import('unocss')
        // @ts-expect-error - suppress builder error
        const config = (await import('../runtime/client/uno.config.ts')).default
        const generator = await createGenerator(config)
        const clientDir = ctx.resolve.module('runtime/client')

        const generateCSS = async (path: string) => {
          if (path.startsWith(clientDir) && path.endsWith('.vue')) {
            const content = fs.readFileSync(path, 'utf-8')
            const tokens = await generator.applyExtractors(content, path)
            const { css } = await generator.generate(tokens)
            fs.writeFileSync(path.replace('.vue', '.css'), css, 'utf-8')
          }
        }

        const globPattern = `${clientDir}/**/*.vue`
        fs.globSync(globPattern).forEach(generateCSS)

        addVitePlugin({
          name: 'dev-nuxt-discord-generate-css',
          configureServer(server) {
            server.watcher.add(globPattern)
            server.watcher.on('change', generateCSS)
          },
        })
      })()
    }
  }
}

/**
 * Source: https://github.com/nuxt/content/blob/e2d274b7fee9edcba742619c5baedf65ab8475ab/src/utils/dev.ts
 *
 * WebSocket server useful for live content reload.
 */
export function createWebSocket() {
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

async function generateDynamicCommandBuild(file: string, config: RollupConfig, ctx: NuxtDiscordContext) {
  let bundle: RollupBuild
  try {
    bundle = await rollup({
      ...config,
      input: file,
      plugins: [
        config.plugins,
        {
          name: 'discord:resolve-alias-and-externalize',
          resolveId: (id) => {
            // externalize all modules except the command file itself, excluding .ts files
            if (!id.includes(file) && !id.endsWith('.ts')) {
              return { id: resolveAlias(id), external: true }
            }
          },
        },
      ],
    })
    const { output } = await bundle.generate({ ...config.output, sourcemap: false })
    fs.mkdirSync(path.join(ctx.nuxt.options.buildDir, 'discord', 'commands'), { recursive: true })
    fs.writeFileSync(file
      .replace(ctx.resolve.root(ctx.nuxt.options.rootDir), ctx.nuxt.options.buildDir)
      .replace('.ts', '.mjs'), output[0].code, { encoding: 'utf-8', flush: true })
  }
  catch (error) {
    ctx.logger.error(`Error processing command file ${file}:`, error)
    return
  }

  await bundle.close()
}
