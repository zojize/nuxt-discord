import type { NuxtDiscordContext, SlashCommand } from '../src/types'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ApplicationCommandOptionType } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import collectSlashCommands, { processCommandFile, processSubcommands } from '../src/utils/collect'

function createMockContext(commandsDir: string): NuxtDiscordContext {
  return {
    nuxt: {} as any,
    options: { dir: 'discord' } as any,
    slashCommands: [],
    contextMenus: [],
    listeners: [],
    resolve: {
      root: (...parts: string[]) => path.resolve(commandsDir, '..', '..', ...parts),
      module: vi.fn() as any,
    },
    logger: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any,
  }
}

function writeCommand(dir: string, filename: string, content: string): string {
  const filePath = path.join(dir, filename)
  const dirPath = path.dirname(filePath)
  fs.mkdirSync(dirPath, { recursive: true })
  fs.writeFileSync(filePath, content)
  return filePath
}

describe('collect', () => {
  let tmpDir: string
  let commandsDir: string
  let ctx: NuxtDiscordContext

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuxt-discord-test-'))
    commandsDir = path.join(tmpDir, 'discord', 'commands')
    fs.mkdirSync(commandsDir, { recursive: true })
    ctx = createMockContext(commandsDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('processCommandFile', () => {
    it('should parse a simple arrow function command', () => {
      const file = writeCommand(commandsDir, 'ping.ts', `
/**
 * @name ping
 * @description Responds with pong
 */
export default () => {
  return 'pong!'
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.name).toBe('ping')
      expect(command!.description).toBe('Responds with pong')
      expect(command!.options).toEqual([])
    })

    it('should parse a named function declaration', () => {
      const file = writeCommand(commandsDir, 'hello.ts', `
/**
 * @description Says hello
 */
export default function greet() {
  return 'hello!'
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.name).toBe('greet')
      expect(command!.description).toBe('Says hello')
    })

    it('should use filename as fallback name', () => {
      const file = writeCommand(commandsDir, 'mycommand.ts', `
/**
 * @description A command
 */
export default () => {
  return 'ok'
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.name).toBe('mycommand')
    })

    it('should use JSDoc body text as description', () => {
      const file = writeCommand(commandsDir, 'simple.ts', `
/** A simple command that does things */
export default () => {
  return 'ok'
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.description).toBe('A simple command that does things')
    })

    it('should prefer @description tag over body text', () => {
      const file = writeCommand(commandsDir, 'prio.ts', `
/**
 * Body text description
 * @description Tag description wins
 */
export default () => {
  return 'ok'
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.description).toBe('Tag description wins')
    })

    it('should parse @nsfw tag', () => {
      const file = writeCommand(commandsDir, 'adult.ts', `
/**
 * @description An NSFW command
 * @nsfw
 */
export default () => {
  return 'ok'
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.nsfw).toBe(true)
    })

    it('should parse @nsfw false', () => {
      const file = writeCommand(commandsDir, 'safe.ts', `
/**
 * @description A safe command
 * @nsfw false
 */
export default () => {
  return 'ok'
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.nsfw).toBe(false)
    })

    it('should parse @dm false to restrict to guild-only', () => {
      const file = writeCommand(commandsDir, 'guild.ts', `
/**
 * @description Guild only command
 * @dm false
 */
export default () => {
  return 'ok'
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.contexts).toEqual([0]) // Guild only
    })

    it('should parse @dm to allow DMs', () => {
      const file = writeCommand(commandsDir, 'everywhere.ts', `
/**
 * @description Available everywhere
 * @dm
 */
export default () => {
  return 'ok'
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.contexts).toEqual([0, 1, 2])
    })

    it('should parse @defaultMemberPermissions', () => {
      const file = writeCommand(commandsDir, 'admin.ts', `
/**
 * @description Admin only
 * @defaultMemberPermissions 8
 */
export default () => {
  return 'ok'
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.defaultMemberPermissions).toBe('8')
    })

    it('should parse bare @guild tag as true', () => {
      const file = writeCommand(commandsDir, 'guildcmd.ts', `
/**
 * @description Guild-only command
 * @guild
 */
export default () => {
  return 'ok'
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.guilds).toBe(true)
    })

    it('should parse @guild with specific ID', () => {
      const file = writeCommand(commandsDir, 'specific.ts', `
/**
 * @description Specific guild command
 * @guild 123456789012345678
 */
export default () => 'ok'
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.guilds).toEqual(['123456789012345678'])
    })

    it('should parse multiple @guild tags as array of IDs', () => {
      const file = writeCommand(commandsDir, 'multi.ts', `
/**
 * @description Multi-guild command
 * @guild 111111111111111111
 * @guild 222222222222222222
 */
export default () => 'ok'
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.guilds).toEqual(['111111111111111111', '222222222222222222'])
    })

    it('should not set guilds when @guild tag is absent', () => {
      const file = writeCommand(commandsDir, 'globalcmd.ts', `
/**
 * @description Global command
 */
export default () => {
  return 'ok'
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.guilds).toBeUndefined()
    })

    it('should parse inline @name.ja localization', () => {
      const file = writeCommand(commandsDir, 'i18ncmd.ts', `
/**
 * A command
 * @name.ja ピング
 * @description.ja ポンと返す
 * @description.fr Renvoie pong
 */
export default () => 'pong'
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.nameLocalizations).toEqual({ ja: 'ピング' })
      expect(command!.descriptionLocalizations).toEqual({ ja: 'ポンと返す', fr: 'Renvoie pong' })
    })

    it('should warn on invalid inline locale', () => {
      const file = writeCommand(commandsDir, 'badlocale.ts', `
/**
 * @description.xx Bad locale
 */
export default () => 'ok'
`)
      processCommandFile(ctx, file)
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown locale "xx"'),
      )
    })

    it('should parse string parameters', () => {
      const file = writeCommand(commandsDir, 'greet.ts', `
/**
 * @name greet
 * @description Greet someone
 * @param name The person to greet
 */
export default (name: string) => {
  return \`Hello \${name}!\`
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.options).toHaveLength(1)
      expect(command!.options[0]).toMatchObject({
        name: 'name',
        type: ApplicationCommandOptionType.String,
        description: 'The person to greet',
        required: true,
        varname: 'name',
      })
    })

    it('should parse number parameters', () => {
      const file = writeCommand(commandsDir, 'add.ts', `
/**
 * @name add
 * @description Add two numbers
 * @param a First number
 * @param b Second number
 */
export default (a: number, b: number) => {
  return \`\${a + b}\`
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.options).toHaveLength(2)
      expect(command!.options[0]!.type).toBe(ApplicationCommandOptionType.Number)
      expect(command!.options[1]!.type).toBe(ApplicationCommandOptionType.Number)
    })

    it('should parse integer parameters', () => {
      const file = writeCommand(commandsDir, 'roll.ts', `
/**
 * @name roll
 * @description Roll a die
 * @param sides Number of sides
 */
export default (sides: integer) => {
  return \`Rolled: \${sides}\`
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.options[0]!.type).toBe(ApplicationCommandOptionType.Integer)
    })

    it('should parse boolean parameters', () => {
      const file = writeCommand(commandsDir, 'toggle.ts', `
/**
 * @name toggle
 * @description Toggle something
 * @param enabled Whether to enable
 */
export default (enabled: boolean) => {
  return \`Set to \${enabled}\`
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.options[0]!.type).toBe(ApplicationCommandOptionType.Boolean)
    })

    it('should parse User parameters', () => {
      const file = writeCommand(commandsDir, 'ban.ts', `
/**
 * @name ban
 * @description Ban a user
 * @param target The user to ban
 */
export default (target: User) => {
  return \`Banned \${target}\`
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.options[0]!.type).toBe(ApplicationCommandOptionType.User)
    })

    it('should parse Role parameters', () => {
      const file = writeCommand(commandsDir, 'assign.ts', `
/**
 * @name assign
 * @description Assign a role
 * @param role The role to assign
 */
export default (role: Role) => {
  return \`Assigned \${role}\`
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.options[0]!.type).toBe(ApplicationCommandOptionType.Role)
    })

    it('should parse Mentionable parameters', () => {
      const file = writeCommand(commandsDir, 'mention.ts', `
/**
 * @name mention
 * @description Mention someone
 * @param target The target to mention
 */
export default (target: Mentionable) => {
  return \`Mentioned \${target}\`
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.options[0]!.type).toBe(ApplicationCommandOptionType.Mentionable)
    })

    it('should parse Attachment parameters', () => {
      const file = writeCommand(commandsDir, 'upload.ts', `
/**
 * @name upload
 * @description Upload a file
 * @param file The file to upload
 */
export default (file: Attachment) => {
  return \`Uploaded \${file}\`
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.options[0]!.type).toBe(ApplicationCommandOptionType.Attachment)
    })

    it('should parse optional parameters', () => {
      const file = writeCommand(commandsDir, 'say.ts', `
/**
 * @name say
 * @description Say something
 * @param message The message
 * @param loud Whether to shout
 */
export default (message: string, loud?: boolean) => {
  return loud ? message.toUpperCase() : message
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.options[0]!.required).toBe(true)
      expect(command!.options[1]!.required).toBe(false)
    })

    it('should parse union type as choices', () => {
      const file = writeCommand(commandsDir, 'color.ts', `
/**
 * @name color
 * @description Pick a color
 * @param color The color
 */
export default (color: 'red' | 'green' | 'blue') => {
  return color
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.options[0]!.type).toBe(ApplicationCommandOptionType.String)
      expect(command!.options[0]).toHaveProperty('choices')
      const opt = command!.options[0] as any
      expect(opt.choices).toEqual([
        { name: 'red', value: 'red' },
        { name: 'green', value: 'green' },
        { name: 'blue', value: 'blue' },
      ])
    })

    it('should parse describeCommand macro', () => {
      const file = writeCommand(commandsDir, 'test.ts', `
/**
 * @description Fallback
 */
export default () => {
  describeCommand({ name: 'overridden', description: 'Overridden description' })
  return 'ok'
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.name).toBe('overridden')
      expect(command!.description).toBe('Overridden description')
    })

    it('should parse describeOption macro with constraints', () => {
      const file = writeCommand(commandsDir, 'add.ts', `
/**
 * @description Add numbers
 * @param a First number
 * @param b Second number
 */
export default (a: number, b: number) => {
  describeOption(a, { min: -100, max: 100 })
  describeOption(b, { min: 0, max: 50 })
  return a + b
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.options[0]!).toMatchObject({ name: 'a', min: -100, max: 100 })
      expect(command!.options[1]!).toMatchObject({ name: 'b', min: 0, max: 50 })
    })

    it('should parse describeOption with string constraints', () => {
      const file = writeCommand(commandsDir, 'say.ts', `
/**
 * @description Say something
 * @param msg The message
 */
export default (msg: string) => {
  describeOption(msg, { minLength: 1, maxLength: 200 })
  return msg
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.options[0]!).toMatchObject({ name: 'msg', minLength: 1, maxLength: 200 })
    })

    it('should detect autocomplete in describeOption', () => {
      const file = writeCommand(commandsDir, 'search.ts', `
/**
 * @description Search
 * @param query The query
 */
export default (query: string) => {
  describeOption(query, {
    autocomplete(value) {
      return [{ name: value, value }]
    },
  })
  return query
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.options[0]!.hasAutocomplete).toBe(true)
    })

    it('should parse defineSlashCommand wrapper', () => {
      const file = writeCommand(commandsDir, 'wrapped.ts', `
/**
 * @description A wrapped command
 */
export default defineSlashCommand(() => {
  return 'wrapped'
})
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeDefined()
      expect(command!.description).toBe('A wrapped command')
    })

    it('should set parents for nested commands', () => {
      const parentFile = writeCommand(commandsDir, 'group.ts', `
/**
 * @name group
 * @description A group command
 */
export default () => {
  return 'group'
}
`)
      const childFile = writeCommand(commandsDir, 'group/sub.ts', `
/**
 * @name sub
 * @description A subcommand
 */
export default () => {
  return 'sub'
}
`)
      const parent = processCommandFile(ctx, parentFile)
      const child = processCommandFile(ctx, childFile)
      expect(parent).toBeDefined()
      expect(child).toBeDefined()
      expect(parent!.parents).toEqual([])
      expect(child!.parents).toHaveLength(1)
      expect((child!.parents as string[])[0]).toBe(parentFile)
    })

    it('should warn on more than 2 levels of nesting', () => {
      fs.mkdirSync(path.join(commandsDir, 'a', 'b', 'c'), { recursive: true })
      const file = writeCommand(commandsDir, 'a/b/c/deep.ts', `
/**
 * @name deep
 * @description Too deep
 */
export default () => {
  return 'deep'
}
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeUndefined()
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Only 2 levels'),
      )
    })

    it('should return undefined for files without command definition', () => {
      const file = writeCommand(commandsDir, 'empty.ts', `
const x = 42
`)
      const command = processCommandFile(ctx, file)
      expect(command).toBeUndefined()
      expect(ctx.logger.warn).toHaveBeenCalled()
    })
  })

  describe('processSubcommands', () => {
    it('should nest subcommands under parent commands', () => {
      const parentFile = path.join(commandsDir, 'parent.ts')
      const childFile = path.join(commandsDir, 'parent', 'child.ts')

      const parent: SlashCommand = {
        name: 'parent',
        description: 'Parent command',
        path: parentFile,
        options: [],
        parents: [],
        subcommands: [],
      }

      const child = {
        name: 'child',
        description: 'Child command',
        path: childFile,
        options: [],
        parents: [parentFile] as [string],
        subcommands: [] as [],
      }

      ctx.slashCommands = [parent, child as any]
      processSubcommands(ctx)

      expect(ctx.slashCommands).toHaveLength(1)
      expect(ctx.slashCommands[0]!.name).toBe('parent')
      expect(ctx.slashCommands[0]!.subcommands).toHaveLength(1)
      expect(ctx.slashCommands[0]!.subcommands[0]!.name).toBe('child')
    })

    it('should nest two levels of subcommands', () => {
      const parentFile = path.join(commandsDir, 'parent.ts')
      const groupFile = path.join(commandsDir, 'parent', 'group.ts')
      const leafFile = path.join(commandsDir, 'parent', 'group', 'leaf.ts')

      const parent: SlashCommand = {
        name: 'parent',
        description: 'Parent',
        path: parentFile,
        options: [],
        parents: [],
        subcommands: [],
      }

      const group = {
        name: 'group',
        description: 'Group',
        path: groupFile,
        options: [],
        parents: [parentFile] as [string],
        subcommands: [],
      }

      const leaf = {
        name: 'leaf',
        description: 'Leaf',
        path: leafFile,
        options: [],
        parents: [parentFile, groupFile] as [string, string],
        subcommands: [] as [],
      }

      ctx.slashCommands = [parent, group as any, leaf as any]
      processSubcommands(ctx)

      expect(ctx.slashCommands).toHaveLength(1)
      expect(ctx.slashCommands[0]!.subcommands).toHaveLength(1)
      expect(ctx.slashCommands[0]!.subcommands[0]!.name).toBe('group')
      expect((ctx.slashCommands[0]!.subcommands[0] as any).subcommands).toHaveLength(1)
      expect((ctx.slashCommands[0]!.subcommands[0] as any).subcommands[0]!.name).toBe('leaf')
    })

    it('should warn about orphaned subcommands', () => {
      const child = {
        name: 'orphan',
        description: 'Orphan',
        path: path.join(commandsDir, 'missing', 'orphan.ts'),
        options: [],
        parents: [path.join(commandsDir, 'missing.ts')] as [string],
        subcommands: [] as [],
      }

      ctx.slashCommands = [child as any]
      processSubcommands(ctx)

      expect(ctx.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('not processed'),
      )
      expect(ctx.slashCommands).toHaveLength(0)
    })
  })

  describe('localization', () => {
    it('should apply name and description localizations from locale files', () => {
      writeCommand(commandsDir, 'ping.ts', `
/** Ping the bot */
export default () => {
  return 'pong'
}
`)
      const localesDir = path.join(tmpDir, 'discord', 'locales')
      fs.mkdirSync(localesDir, { recursive: true })
      fs.writeFileSync(path.join(localesDir, 'ja.json'), JSON.stringify({
        ping: { name: 'ピング', description: 'ボットにピングする' },
      }))
      fs.writeFileSync(path.join(localesDir, 'fr.json'), JSON.stringify({
        ping: { description: 'Ping le bot' },
      }))

      collectSlashCommands(ctx)

      expect(ctx.slashCommands).toHaveLength(1)
      const cmd = ctx.slashCommands[0]!
      expect(cmd.nameLocalizations).toEqual({ ja: 'ピング' })
      expect(cmd.descriptionLocalizations).toEqual({ ja: 'ボットにピングする', fr: 'Ping le bot' })
    })

    it('should apply option localizations from locale files', () => {
      writeCommand(commandsDir, 'greet.ts', `
/**
 * @description Greet someone
 * @param name The person
 */
export default (name: string) => {
  return name
}
`)
      const localesDir = path.join(tmpDir, 'discord', 'locales')
      fs.mkdirSync(localesDir, { recursive: true })
      fs.writeFileSync(path.join(localesDir, 'ja.json'), JSON.stringify({
        greet: {
          description: '挨拶する',
          options: {
            name: { description: '挨拶する人' },
          },
        },
      }))

      collectSlashCommands(ctx)

      const cmd = ctx.slashCommands.find(c => c.name === 'greet')!
      expect(cmd.descriptionLocalizations).toEqual({ ja: '挨拶する' })
      expect(cmd.options[0]!.descriptionLocalizations).toEqual({ ja: '挨拶する人' })
    })

    it('should warn on invalid locale filenames', () => {
      writeCommand(commandsDir, 'ping.ts', `
/** Ping */
export default () => 'pong'
`)
      const localesDir = path.join(tmpDir, 'discord', 'locales')
      fs.mkdirSync(localesDir, { recursive: true })
      fs.writeFileSync(path.join(localesDir, 'invalid-locale.json'), JSON.stringify({
        ping: { name: 'test' },
      }))

      collectSlashCommands(ctx)

      expect(ctx.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Unknown locale'),
      )
    })

    it('should warn on unknown command in locale file', () => {
      writeCommand(commandsDir, 'ping.ts', `
/** Ping */
export default () => 'pong'
`)
      const localesDir = path.join(tmpDir, 'discord', 'locales')
      fs.mkdirSync(localesDir, { recursive: true })
      fs.writeFileSync(path.join(localesDir, 'ja.json'), JSON.stringify({
        nonexistent: { name: 'test' },
      }))

      collectSlashCommands(ctx)

      expect(ctx.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('command "nonexistent" not found'),
      )
    })
  })
})
