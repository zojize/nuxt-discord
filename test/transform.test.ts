import type { NuxtDiscordContext } from '../src/types'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import createTransformPlugin from '../src/utils/transform'

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

describe('transform', () => {
  let tmpDir: string
  let commandsDir: string
  let ctx: NuxtDiscordContext

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuxt-discord-transform-'))
    commandsDir = path.join(tmpDir, 'discord', 'commands')
    fs.mkdirSync(commandsDir, { recursive: true })
    ctx = createMockContext(commandsDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should transform a simple command into execute + optionMacros', async () => {
    const filePath = path.join(commandsDir, 'ping.ts')
    fs.writeFileSync(filePath, `
/**
 * @name ping
 * @description Ping
 */
export default () => {
  return 'pong!'
}
`)
    const plugin = createTransformPlugin(ctx) as any
    const result = await plugin.load(filePath)

    expect(result).toBeDefined()
    expect(result).toContain('execute')
    expect(result).toContain('optionMacros')
    expect(result).toContain('pong!')
  })

  it('should strip describeOption macros from the output', async () => {
    const filePath = path.join(commandsDir, 'add.ts')
    fs.writeFileSync(filePath, `
/**
 * @name add
 * @description Add
 * @param a First
 * @param b Second
 */
export default (a: number, b: number) => {
  describeOption(a, { min: 0, max: 100 })
  describeOption(b, { min: 0, max: 100 })
  return \`\${a + b}\`
}
`)
    const plugin = createTransformPlugin(ctx) as any
    const result = await plugin.load(filePath)

    expect(result).toBeDefined()
    // macros should be in optionMacros, not in execute body
    expect(result).toContain('optionMacros')
    expect(result).toContain('min: 0')
    expect(result).toContain('max: 100')
    // The execute body should not contain describeOption calls
    // Check that the function body still has the return statement
    expect(result).toContain('a + b')
  })

  it('should strip describeCommand macros from the output', async () => {
    const filePath = path.join(commandsDir, 'test.ts')
    fs.writeFileSync(filePath, `
export default () => {
  describeCommand({ name: 'test', description: 'A test' })
  return 'ok'
}
`)
    const plugin = createTransformPlugin(ctx) as any
    const result = await plugin.load(filePath)

    expect(result).toBeDefined()
    expect(result).toContain('execute')
    expect(result).toContain('ok')
  })

  it('should ignore non-command files', async () => {
    const filePath = path.join(tmpDir, 'other.ts')
    fs.writeFileSync(filePath, `export const x = 42`)

    const plugin = createTransformPlugin(ctx) as any
    const result = await plugin.load(filePath)

    expect(result).toBeUndefined()
  })

  it('should handle function declaration exports', async () => {
    const filePath = path.join(commandsDir, 'hello.ts')
    fs.writeFileSync(filePath, `
/**
 * @description Says hello
 */
export default function hello() {
  return 'hello!'
}
`)
    const plugin = createTransformPlugin(ctx) as any
    const result = await plugin.load(filePath)

    expect(result).toBeDefined()
    expect(result).toContain('execute')
    expect(result).toContain('hello!')
  })
})
