import type { NuxtDiscordContext } from '../types'
import { addServerTemplate, addTemplate, addTypeTemplate } from '@nuxt/kit'
import defu from 'defu'
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

  const typesTemplateDst = addTypeTemplate({
    filename: 'discord/types.d.ts',
    // proposal-string-dedent when?
    getContents: () => `
declare module 'discord/slashCommands' {
  declare const slashCommands: import('nuxt-discord').SlashCommandRuntime[]
  export default slashCommands
}

type integer = import('nuxt-discord').integer

declare global {
  declare module 'nitropack/types' {
    interface NitroRuntimeHooks {
      'discord:client:config': (options: import('nuxt-discord').NuxtDiscordOptions['client']) => void
      'discord:client:ready': (client: DiscordClient) => void
      'discord:client:error': (error: DiscordClientError) => void
    }
  }

  declare module '@nuxt/schema' {
    interface RuntimeConfig {
      discord: import('nuxt-discord').DiscordRuntimeConfig
    }
    interface PublicRuntimeConfig {
      discord: {
        wsUrl?: string
      }
    }
  }
}
`,
  }).dst
  ctx.nuxt.options.nitro.typescript ||= {}
  ctx.nuxt.options.nitro.typescript.tsConfig = defu(ctx.nuxt.options.nitro.typescript.tsConfig, {
    include: [typesTemplateDst],
  })
}

function getSlashCommandTemplateContent(ctx: NuxtDiscordContext, commandRuntime: boolean) {
  const imports = commandRuntime
    ? ctx.slashCommands.map(({ path }) => {
        const name = genSafeVariableName(path)
        return { name, code: genImport(path, [{ name: 'default', as: name }]) }
      })
    : []

  return [
    ...imports.map(({ code }) => code),
    `export default [\n${
      ctx.slashCommands.map(({ options, ...rest }, i) => `  {\n    ${
        Object.entries(rest).map(([key, value]) => `${key}: ${genString(value)}`).join(',\n    ')},\n
    options: ${genArrayFromRaw(options, undefined, { preserveTypes: true })},\n${commandRuntime ? `\n    ...${imports[i].name},\n` : ''}
  },\n`).join('')
    }]`,
  ].join('\n')
}
