import type { ContextMenu, NuxtDiscordContext } from '../types'
import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

export default function collectContextMenus(ctx: NuxtDiscordContext) {
  const contextMenuDir = ctx.resolve.root(ctx.options.dir, 'context-menus')
  const allFiles = globSync(`${contextMenuDir}/**/*.ts`)

  ctx.contextMenus = []

  for (const file of allFiles) {
    const menu = processContextMenuFile(ctx, file)
    if (menu) {
      ctx.contextMenus.push(menu)
    }
  }
}

export function processContextMenuFile(ctx: NuxtDiscordContext, file: string): ContextMenu | undefined {
  const source = readFileSync(file, 'utf-8')
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)

  let type: 'user' | 'message' | undefined
  let nameFromDefine: string | undefined

  // Find defineUserContextMenu or defineMessageContextMenu call
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isExportAssignment(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression
      if (ts.isIdentifier(call.expression)) {
        const fnName = call.expression.escapedText as string
        if (fnName === 'defineUserContextMenu') {
          type = 'user'
        }
        else if (fnName === 'defineMessageContextMenu') {
          type = 'message'
        }

        // Check if first arg is a string literal (the name)
        if (type && call.arguments.length > 0) {
          const firstArg = call.arguments[0]!
          if (ts.isStringLiteral(firstArg)) {
            nameFromDefine = firstArg.text
          }
        }
      }
    }
  })

  if (!type) {
    ctx.logger.warn(`No defineUserContextMenu or defineMessageContextMenu call found in ${file}`)
    return
  }

  // Name priority: define('Name') > @name JSDoc > filename
  let name = nameFromDefine

  if (!name) {
    // Check JSDoc @name tag
    const jsDocName = getJSDocTag(sourceFile, 'name')
    if (jsDocName) {
      name = jsDocName
    }
  }

  if (!name) {
    // Fallback to filename (strip .ts)
    name = path.basename(file, '.ts')
  }

  // Parse @middleware JSDoc tags
  const middleware = getJSDocTags(sourceFile, 'middleware')

  return { name, type, path: file, ...(middleware.length > 0 ? { middleware } : {}) }
}

function getJSDocTags(sourceFile: ts.SourceFile, tagName: string): string[] {
  const results: string[] = []
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isExportAssignment(node)) {
      for (const tag of ts.getJSDocTags(node)) {
        if (tag.tagName.escapedText === tagName && tag.comment)
          results.push(tag.comment.toString().trim())
      }
      if (results.length === 0) {
        for (const doc of ts.getJSDocCommentsAndTags(node)) {
          if (ts.isJSDoc(doc) && doc.tags) {
            for (const tag of doc.tags) {
              if (tag.tagName.escapedText === tagName && tag.comment)
                results.push(tag.comment.toString().trim())
            }
          }
        }
      }
    }
  })
  return results
}

function getJSDocTag(sourceFile: ts.SourceFile, tagName: string): string | undefined {
  let result: string | undefined
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isExportAssignment(node)) {
      const tags = ts.getJSDocTags(node)
      for (const tag of tags) {
        if (tag.tagName.escapedText === tagName && tag.comment) {
          result = tag.comment.toString().trim()
        }
      }
      // Also check parent for JSDoc on arrow functions
      if (!result) {
        const comments = ts.getJSDocCommentsAndTags(node)
        for (const doc of comments) {
          if (ts.isJSDoc(doc) && doc.tags) {
            for (const tag of doc.tags) {
              if (tag.tagName.escapedText === tagName && tag.comment) {
                result = tag.comment.toString().trim()
              }
            }
          }
        }
      }
    }
  })
  return result
}
