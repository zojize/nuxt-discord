import type { Listener, NuxtDiscordContext } from '../types'
import { globSync, readFileSync } from 'node:fs'
import ts from 'typescript'

export default function collectListeners(ctx: NuxtDiscordContext) {
  const listenersDir = ctx.resolve.root(ctx.options.dir, 'listeners')
  const listenerFiles = globSync(`${listenersDir}/**/*.ts`)
  ctx.listeners = []

  for (const file of listenerFiles) {
    const listener = processListenerFile(ctx, file)
    if (listener) {
      ctx.listeners.push(listener)
    }
  }
}

export function processListenerFile(ctx: NuxtDiscordContext, file: string): Listener | undefined {
  const source = readFileSync(file, 'utf-8')
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)

  let event: string | undefined
  let once = false

  // Find defineListener('eventName', ...) call
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isExportAssignment(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression
      if (ts.isIdentifier(call.expression) && call.expression.escapedText === 'defineListener') {
        const firstArg = call.arguments[0]
        if (firstArg && ts.isStringLiteral(firstArg)) {
          event = firstArg.text
        }
        // Check for options.once in third argument
        const thirdArg = call.arguments[2]
        if (thirdArg && ts.isObjectLiteralExpression(thirdArg)) {
          for (const prop of thirdArg.properties) {
            if (ts.isPropertyAssignment(prop)
              && ts.isIdentifier(prop.name)
              && prop.name.escapedText === 'once'
              && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
              once = true
            }
          }
        }
      }
    }
  })

  if (!event) {
    ctx.logger.warn(`No defineListener call found in ${file}`)
    return
  }

  return { path: file, event, once }
}
