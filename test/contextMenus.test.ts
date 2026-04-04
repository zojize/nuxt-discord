import type { NuxtDiscordContext } from '../src/types'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import collectContextMenus from '../src/utils/collectContextMenus'

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

describe('context menus', () => {
  let tmpDir: string
  let commandsDir: string
  let ctx: NuxtDiscordContext

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuxt-discord-ctxmenu-'))
    commandsDir = path.join(tmpDir, 'discord', 'context-menus')
    fs.mkdirSync(commandsDir, { recursive: true })
    ctx = createMockContext(commandsDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('should collect user context menu from .user.ts file', () => {
    fs.writeFileSync(
      path.join(commandsDir, 'Get Info.user.ts'),
      `export default defineUserContextMenu(async (i) => { await i.reply('info') })`,
    )
    collectContextMenus(ctx)
    expect(ctx.contextMenus).toHaveLength(1)
    expect(ctx.contextMenus[0]!.name).toBe('Get Info')
    expect(ctx.contextMenus[0]!.type).toBe('user')
  })

  it('should collect message context menu from .message.ts file', () => {
    fs.writeFileSync(
      path.join(commandsDir, 'Bookmark.message.ts'),
      `export default defineMessageContextMenu(async (i) => { await i.reply('saved') })`,
    )
    collectContextMenus(ctx)
    expect(ctx.contextMenus).toHaveLength(1)
    expect(ctx.contextMenus[0]!.name).toBe('Bookmark')
    expect(ctx.contextMenus[0]!.type).toBe('message')
  })

  it('should collect multiple context menus', () => {
    fs.writeFileSync(path.join(commandsDir, 'A.user.ts'), `export default defineUserContextMenu(async () => {})`)
    fs.writeFileSync(path.join(commandsDir, 'B.user.ts'), `export default defineUserContextMenu(async () => {})`)
    fs.writeFileSync(path.join(commandsDir, 'C.message.ts'), `export default defineMessageContextMenu(async () => {})`)
    collectContextMenus(ctx)
    expect(ctx.contextMenus).toHaveLength(3)
    expect(ctx.contextMenus.filter(m => m.type === 'user')).toHaveLength(2)
    expect(ctx.contextMenus.filter(m => m.type === 'message')).toHaveLength(1)
  })

  it('should not collect regular .ts files as context menus', () => {
    fs.writeFileSync(path.join(commandsDir, 'ping.ts'), `export default () => 'pong'`)
    collectContextMenus(ctx)
    expect(ctx.contextMenus).toHaveLength(0)
  })
})
