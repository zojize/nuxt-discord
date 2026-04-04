import type { ContextMenu, NuxtDiscordContext } from '../types'
import { globSync } from 'node:fs'
import path from 'node:path'

const USER_MENU_RE = /\.user\.ts$/
const MESSAGE_MENU_RE = /\.message\.ts$/
const CONTEXT_MENU_EXT_RE = /\.(?:user|message)\.ts$/

export default function collectContextMenus(ctx: NuxtDiscordContext) {
  const contextMenuDir = ctx.resolve.root(ctx.options.dir, 'context-menus')
  const allFiles = globSync(`${contextMenuDir}/**/*.ts`)

  ctx.contextMenus = []

  for (const file of allFiles) {
    if (USER_MENU_RE.test(file)) {
      ctx.contextMenus.push(parseContextMenuFile(file, 'user'))
    }
    else if (MESSAGE_MENU_RE.test(file)) {
      ctx.contextMenus.push(parseContextMenuFile(file, 'message'))
    }
  }
}

function parseContextMenuFile(file: string, type: 'user' | 'message'): ContextMenu {
  const basename = path.basename(file)
  const name = basename.replace(CONTEXT_MENU_EXT_RE, '')

  return {
    name,
    type,
    path: file,
  }
}
