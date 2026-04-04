import type { NuxtDiscordContext } from '../src/types'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { processListenerFile } from '../src/utils/collectListeners'

function createMockContext(listenersDir: string): NuxtDiscordContext {
  return {
    nuxt: {} as any,
    options: { dir: 'discord' } as any,
    slashCommands: [],
    contextMenus: [],
    listeners: [],
    resolve: {
      root: (...parts: string[]) => path.resolve(listenersDir, '..', '..', ...parts),
      module: vi.fn() as any,
    },
    logger: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any,
  }
}

function writeListener(dir: string, filename: string, content: string): string {
  const filePath = path.join(dir, filename)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
  return filePath
}

describe('listeners', () => {
  let tmpDir: string
  let listenersDir: string
  let ctx: NuxtDiscordContext

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuxt-discord-listener-'))
    listenersDir = path.join(tmpDir, 'discord', 'listeners')
    fs.mkdirSync(listenersDir, { recursive: true })
    ctx = createMockContext(listenersDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should parse a basic listener', () => {
    const file = writeListener(listenersDir, 'welcome.ts', `
export default defineListener('guildMemberAdd', (member) => {
  member.guild.systemChannel?.send('Welcome!')
})
`)
    const listener = processListenerFile(ctx, file)
    expect(listener).toBeDefined()
    expect(listener!.event).toBe('guildMemberAdd')
    expect(listener!.once).toBeFalsy()
  })

  it('should parse a once listener', () => {
    const file = writeListener(listenersDir, 'ready.ts', `
export default defineListener('ready', (client) => {
  console.log('Ready!')
}, { once: true })
`)
    const listener = processListenerFile(ctx, file)
    expect(listener).toBeDefined()
    expect(listener!.event).toBe('ready')
    expect(listener!.once).toBe(true)
  })

  it('should parse messageCreate listener', () => {
    const file = writeListener(listenersDir, 'msg.ts', `
export default defineListener('messageCreate', (message) => {
  if (message.content === '!ping') message.reply('pong')
})
`)
    const listener = processListenerFile(ctx, file)
    expect(listener).toBeDefined()
    expect(listener!.event).toBe('messageCreate')
  })

  it('should warn when no defineListener call found', () => {
    const file = writeListener(listenersDir, 'bad.ts', `
export default () => {}
`)
    const listener = processListenerFile(ctx, file)
    expect(listener).toBeUndefined()
    expect(ctx.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No defineListener call found'),
    )
  })
})
