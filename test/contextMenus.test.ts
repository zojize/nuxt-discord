import type { NuxtDiscordContext } from '../src/types'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import collectContextMenus, { processContextMenuFile } from '../src/utils/collectContextMenus'

function createMockContext(contextMenuDir: string): NuxtDiscordContext {
  return {
    nuxt: {} as any,
    options: { dir: 'discord' } as any,
    slashCommands: [],
    contextMenus: [],
    listeners: [],
    resolve: {
      root: (...parts: string[]) => path.resolve(contextMenuDir, '..', '..', ...parts),
      module: vi.fn() as any,
    },
    logger: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as any,
  }
}

function writeFile(dir: string, filename: string, content: string): string {
  const filePath = path.join(dir, filename)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
  return filePath
}

describe('context menus', () => {
  let tmpDir: string
  let contextMenuDir: string
  let ctx: NuxtDiscordContext

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nuxt-discord-ctxmenu-'))
    contextMenuDir = path.join(tmpDir, 'discord', 'context-menus')
    fs.mkdirSync(contextMenuDir, { recursive: true })
    ctx = createMockContext(contextMenuDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('name from define function', () => {
    it('should get name from defineUserContextMenu first arg', () => {
      const file = writeFile(contextMenuDir, 'info.ts', `
export default defineUserContextMenu('User Info', async (i) => { await i.reply('hi') })
`)
      const menu = processContextMenuFile(ctx, file)
      expect(menu).toBeDefined()
      expect(menu!.name).toBe('User Info')
      expect(menu!.type).toBe('user')
    })

    it('should get name from defineMessageContextMenu first arg', () => {
      const file = writeFile(contextMenuDir, 'save.ts', `
export default defineMessageContextMenu('Save Message', async (i) => { await i.reply('saved') })
`)
      const menu = processContextMenuFile(ctx, file)
      expect(menu).toBeDefined()
      expect(menu!.name).toBe('Save Message')
      expect(menu!.type).toBe('message')
    })
  })

  describe('name from JSDoc', () => {
    it('should get name from @name JSDoc tag', () => {
      const file = writeFile(contextMenuDir, 'report.ts', `
/**
 * @name Report User
 */
export default defineUserContextMenu(async (i) => { await i.reply('reported') })
`)
      const menu = processContextMenuFile(ctx, file)
      expect(menu).toBeDefined()
      expect(menu!.name).toBe('Report User')
      expect(menu!.type).toBe('user')
    })

    it('should prefer define name over JSDoc name', () => {
      const file = writeFile(contextMenuDir, 'test.ts', `
/**
 * @name JSDoc Name
 */
export default defineUserContextMenu('Define Name', async (i) => { await i.reply('hi') })
`)
      const menu = processContextMenuFile(ctx, file)
      expect(menu).toBeDefined()
      expect(menu!.name).toBe('Define Name')
    })
  })

  describe('name from filename', () => {
    it('should fall back to filename when no name in define or JSDoc', () => {
      const file = writeFile(contextMenuDir, 'bookmark.ts', `
export default defineMessageContextMenu(async (i) => { await i.reply('ok') })
`)
      const menu = processContextMenuFile(ctx, file)
      expect(menu).toBeDefined()
      expect(menu!.name).toBe('bookmark')
      expect(menu!.type).toBe('message')
    })
  })

  describe('type detection', () => {
    it('should detect user type from defineUserContextMenu', () => {
      const file = writeFile(contextMenuDir, 'a.ts', `
export default defineUserContextMenu(async () => {})
`)
      const menu = processContextMenuFile(ctx, file)
      expect(menu!.type).toBe('user')
    })

    it('should detect message type from defineMessageContextMenu', () => {
      const file = writeFile(contextMenuDir, 'b.ts', `
export default defineMessageContextMenu(async () => {})
`)
      const menu = processContextMenuFile(ctx, file)
      expect(menu!.type).toBe('message')
    })
  })

  describe('error handling', () => {
    it('should warn and skip files without define call', () => {
      const file = writeFile(contextMenuDir, 'bad.ts', `
export default () => {}
`)
      const menu = processContextMenuFile(ctx, file)
      expect(menu).toBeUndefined()
      expect(ctx.logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No defineUserContextMenu or defineMessageContextMenu'),
      )
    })
  })

  describe('collectContextMenus', () => {
    it('should collect all context menus from directory', () => {
      writeFile(contextMenuDir, 'a.ts', `export default defineUserContextMenu('A', async () => {})`)
      writeFile(contextMenuDir, 'b.ts', `export default defineMessageContextMenu('B', async () => {})`)
      writeFile(contextMenuDir, 'c.ts', `export default defineUserContextMenu(async () => {})`)

      collectContextMenus(ctx)

      expect(ctx.contextMenus).toHaveLength(3)
      expect(ctx.contextMenus.find(m => m.name === 'A')!.type).toBe('user')
      expect(ctx.contextMenus.find(m => m.name === 'B')!.type).toBe('message')
      expect(ctx.contextMenus.find(m => m.name === 'c')!.type).toBe('user')
    })

    it('should handle empty directory', () => {
      collectContextMenus(ctx)
      expect(ctx.contextMenus).toHaveLength(0)
    })
  })
})
