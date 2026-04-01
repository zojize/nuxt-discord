import type { NuxtDiscordContext, SlashCommand } from '../src/types'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ApplicationCommandOptionType } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { processCommandFile, processSubcommands } from '../src/utils/collect'

function createMockContext(commandsDir: string): NuxtDiscordContext {
  return {
    nuxt: {} as any,
    options: { dir: 'discord' } as any,
    slashCommands: [],
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
})
