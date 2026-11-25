import type { NuxtDiscordContext, SlashCommand, SlashCommandSubcommand, SlashCommandSubcommandGroup } from '../types'
import { addServerTemplate, addTemplate, addTypeTemplate } from '@nuxt/kit'
import { genArrayFromRaw, genImport, genSafeVariableName, genString } from 'knitwork'

export function prepareTemplates(ctx: NuxtDiscordContext) {
  addServerTemplate({
    filename: 'discord/slashCommands',
    getContents: () => getSlashCommandTemplateContent(ctx, /* commandRuntime */ true),
  })

  addTemplate({
    filename: 'discord/slashCommands',
    getContents: () => getSlashCommandTemplateContent(ctx, /* commandRuntime */ false),
  })

  // Context menu template (server — includes handlers)
  addServerTemplate({
    filename: 'discord/contextMenus',
    getContents: () => {
      if (ctx.contextMenus.length === 0) {
        return 'export default []'
      }
      const entries = ctx.contextMenus.map((cm, i) => {
        const varName = `cm_${i}`
        return {
          importLine: `import ${varName} from '${cm.path}'`,
          entry: `{ ...${varName}, name: ${JSON.stringify(cm.name)}, middleware: ${JSON.stringify(cm.middleware ?? [])}, guilds: ${JSON.stringify(cm.guilds)}, path: ${JSON.stringify(cm.path)} }`,
        }
      })
      return [
        ...entries.map(e => e.importLine),
        `export default [${entries.map(e => e.entry).join(', ')}]`,
      ].join('\n')
    },
  })

  // Context menu template (client — metadata only)
  addTemplate({
    filename: 'discord/contextMenus',
    getContents: () => {
      return `export default ${JSON.stringify(ctx.contextMenus.map(cm => ({
        name: cm.name,
        type: cm.type,
        guilds: cm.guilds,
        path: cm.path,
      })))}`
    },
  })

  // Listener template (server — includes handlers)
  addServerTemplate({
    filename: 'discord/listeners',
    getContents: () => {
      if (ctx.listeners.length === 0) {
        return 'export default []'
      }
      const imports = ctx.listeners.map((l, i) => {
        const name = `listener_${i}`
        return { name, code: `import ${name} from '${l.path}'` }
      })
      return [
        ...imports.map(i => i.code),
        `export default [${imports.map(i => i.name).join(', ')}]`,
      ].join('\n')
    },
  })

  // Listener template (client — metadata only)
  addTemplate({
    filename: 'discord/listeners',
    getContents: () => {
      return `export default ${JSON.stringify(ctx.listeners.map(l => ({
        event: l.event,
        once: l.once ?? false,
        path: l.path,
      })))}`
    },
  })

  addTypeTemplate({
    filename: 'discord/types.d.ts',
    getContents: () => `
declare module 'discord/slashCommands' {
  const slashCommands: import('nuxt-discord').SlashCommandRuntime[]
  export default slashCommands
}

declare module '#build/discord/slashCommands' {
  const slashCommands: import('nuxt-discord').SlashCommand[]
  export default slashCommands
}

declare module '#build/discord/contextMenus' {
  const contextMenus: import('nuxt-discord').ContextMenu[]
  export default contextMenus
}

declare module '#build/discord/listeners' {
  const listeners: import('nuxt-discord').Listener[]
  export default listeners
}

declare module 'discord/contextMenus' {
  const contextMenus: (import('nuxt-discord/types').ContextMenuDefinition & { name: string, path: string })[]
  export default contextMenus
}

declare module 'discord/listeners' {
  const listeners: import('nuxt-discord/types').ListenerDefinition[]
  export default listeners
}

type integer = import('nuxt-discord').integer
`,
  }, { nuxt: true, nitro: true })

  addTypeTemplate({
    filename: 'discord/augmentations.d.ts',
    getContents: () => `
import type { DiscordClient, DiscordClientError, DiscordRuntimeConfig, NuxtDiscordOptions } from 'nuxt-discord/types'
import type { Interaction } from 'discord.js'

declare module 'nitropack/types' {
  interface NitroRuntimeHooks {
    'discord:client:config': (options: NuxtDiscordOptions['client']) => void
    'discord:client:ready': (client: DiscordClient) => void
    'discord:client:error': (error: DiscordClientError) => void
    'discord:interaction:before': (ctx: { interaction: Interaction, type: 'command' | 'context-menu' }) => void
    'discord:interaction:after': (ctx: { interaction: Interaction, type: 'command' | 'context-menu', status: 'ok' | 'denied' | 'error', detail?: string }) => void
    'discord:interaction:denied': (ctx: { interaction: Interaction, type: 'command' | 'context-menu', reason: string, middleware: string }) => void
  }
}

declare module '@nuxt/schema' {
  interface RuntimeConfig {
    discord: DiscordRuntimeConfig
  }
  interface PublicRuntimeConfig {
    discord: { wsUrl?: string }
  }
}
`,
  }, { nuxt: true, nitro: true })
}

export function getSlashCommandTemplateContent(ctx: NuxtDiscordContext, commandRuntime: boolean) {
  const imports = commandRuntime
    ? Object.fromEntries(ctx.slashCommands.flatMap(
        function getImports(cmd: SlashCommand | SlashCommandSubcommandGroup | SlashCommandSubcommand): [string, { name: string, code: string }][] {
          const name = genSafeVariableName(cmd.path)
          return [
            [cmd.path, { name, code: genImport(cmd.path, [{ name: 'default', as: name }]) }],
            ...('subcommands' in cmd ? cmd.subcommands.flatMap(getImports) : []),
          ]
        },
      ))
    : {}

  return [
    ...Object.values(imports)
      .map(({ code }) => code),
    `export default [\n${
      ctx.slashCommands.map(cmd => genCommandObject(cmd)).join(',\n')
    }]`,
  ].join('\n')

  function genCommandObject(
    {
      options,
      parents,
      subcommands,
      ...rest
    }: (SlashCommand | SlashCommandSubcommand | SlashCommandSubcommandGroup),
  ): string {
    return `  {
    ${Object.entries(rest).filter(([, v]) => v !== undefined).map(([key, value]) => `${key}: ${typeof value === 'string' ? genString(value) : JSON.stringify(value)}`).join(',\n    ')},
    options: ${genArrayFromRaw(options, undefined, { preserveTypes: true })},
    ${subcommands.length > 0 ? `subcommands: [${subcommands.map(genCommandObject).join(',')}],` : ''}
    ${commandRuntime ? `...${imports[rest.path]!.name},` : ''}
  }`
  }
}
