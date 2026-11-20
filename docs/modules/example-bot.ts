import type { SlashCommand, SlashCommandSubcommand, SlashCommandSubcommandGroup } from '../../src/types'
import type { CommandSourceContext } from '../../src/utils/collect'
import { spawnSync } from 'node:child_process'
import { relative, resolve } from 'node:path'
import { addTemplate, createResolver, defineNuxtModule, useLogger } from '@nuxt/kit'
import { ApplicationCommandOptionType } from 'discord.js'
import collectSlashCommands from '../../src/utils/collect'
import collectContextMenus from '../../src/utils/collectContextMenus'

type Command = SlashCommand | SlashCommandSubcommand | SlashCommandSubcommandGroup

export default defineNuxtModule({
  setup(_, nuxt) {
    const root = resolve(nuxt.options.rootDir, '../playground')
    const directory = 'discord'
    const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout?.trim() || 'main'
    nuxt.options.watch.push(resolve(root, directory))
    addTemplate({
      filename: 'example-bot.json',
      write: true,
      getContents() {
        const ctx: CommandSourceContext = {
          options: { dir: directory },
          resolve: { root: createResolver(root).resolve },
          logger: useLogger('example-bot'),
          slashCommands: [],
          contextMenus: [],
        }
        collectSlashCommands(ctx)
        collectContextMenus(ctx)

        function describe(command: Command, name: string) {
          return {
            name,
            description: command.description,
            source: relative(root, command.path).split('\\').join('/'),
            options: command.options.map(option => ({
              name: option.name,
              description: option.description,
              type: option.type,
              required: option.required,
              hasAutocomplete: option.hasAutocomplete,
              typeName: ApplicationCommandOptionType[option.type],
              min: 'min' in option ? option.min : undefined,
              max: 'max' in option ? option.max : undefined,
              choices: 'choices' in option ? option.choices : undefined,
              minLength: 'minLength' in option ? option.minLength : undefined,
              maxLength: 'maxLength' in option ? option.maxLength : undefined,
            })),
            middleware: command.middleware ?? [],
          }
        }
        function flatten(commands: Command[], prefix = ''): ReturnType<typeof describe>[] {
          return commands.flatMap((command) => {
            const name = prefix + command.name
            return command.subcommands.length ? flatten(command.subcommands, `${name} `) : [describe(command, name)]
          })
        }
        return JSON.stringify({
          revision,
          commands: flatten(ctx.slashCommands).toSorted((a, b) => a.name.localeCompare(b.name)),
          menus: ctx.contextMenus.map(({ name, type }) => ({ name, type })).toSorted((a, b) => a.name.localeCompare(b.name)),
        })
      },
    })
  },
})
