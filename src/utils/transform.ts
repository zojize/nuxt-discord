import type { InputPluginOption } from 'rollup'
import type { NuxtDiscordContext } from '../types'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { extractMacroCalls, findCommandExport, isMacroCallExpression } from './collect'

export default (ctx: NuxtDiscordContext): InputPluginOption => {
  const commandsDir = `${ctx.resolve.root(ctx.options.dir, 'commands').split(path.sep).join('/')}/`
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })

  return {
    name: 'transform-slash-commands',
    load(id) {
      if (!id.split(path.sep).join('/').startsWith(commandsDir) || !id.endsWith('.ts'))
        return
      const source = ts.createSourceFile(id, fs.readFileSync(id, 'utf-8'), ts.ScriptTarget.Latest, true)
      const command = findCommandExport(source)
      if (!command || !command.handler.body)
        return

      const runtime = createRuntimeExport(command.handler, command.handler.body)
      const statements = source.statements.map(statement => statement === command.statement ? runtime : statement)
      return printer.printFile(ts.factory.updateSourceFile(source, statements))
    },
  }
}

function createRuntimeExport(
  handler: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction,
  originalBody: ts.ConciseBody,
) {
  const [macroCalls] = extractMacroCalls(originalBody)
  const body = ts.isBlock(originalBody)
    ? ts.factory.updateBlock(originalBody, originalBody.statements.filter(statement => !isMacroCallExpression(statement)))
    : originalBody
  let execute: ts.Expression
  if (ts.isArrowFunction(handler)) {
    execute = ts.factory.updateArrowFunction(handler, handler.modifiers, handler.typeParameters, handler.parameters, handler.type, handler.equalsGreaterThanToken, body)
  }
  else {
    execute = ts.factory.createFunctionExpression(
      ts.getModifiers(handler)?.filter(modifier => modifier.kind !== ts.SyntaxKind.ExportKeyword && modifier.kind !== ts.SyntaxKind.DefaultKeyword),
      handler.asteriskToken,
      handler.name,
      handler.typeParameters,
      handler.parameters,
      handler.type,
      body as ts.Block, // Function declarations and function expressions always have a block body.
    )
  }

  // Build middlewareEntries from useMiddleware calls:
  // useMiddleware(ref) → { name: ref.name, fn: ref.fn }
  // useMiddleware(ref, opts) → { name: ref.name, fn: ref.fn, options: opts }
  const middlewareCalls = macroCalls
    .filter(m => m.expression.escapedText === 'useMiddleware' && m.arguments.length >= 1)
  const middlewareEntries = middlewareCalls.map((m) => {
    const ref = m.arguments[0]!
    const props: ts.PropertyAssignment[] = [
      ts.factory.createPropertyAssignment('name', ts.factory.createPropertyAccessExpression(ref, 'name')),
      ts.factory.createPropertyAssignment('fn', ts.factory.createPropertyAccessExpression(ref, 'fn')),
    ]
    if (m.arguments.length > 1) {
      props.push(ts.factory.createPropertyAssignment('options', m.arguments[1]!))
    }
    return ts.factory.createObjectLiteralExpression(props)
  })

  return ts.factory.createExportAssignment(
    [],
    false,
    ts.factory.createObjectLiteralExpression([
      ts.factory.createPropertyAssignment('execute', execute),
      ts.factory.createPropertyAssignment(
        'optionMacros',
        ts.factory.createObjectLiteralExpression(
          macroCalls
            .filter(m => m.expression.escapedText === 'describeOption' && m.arguments.length > 1 && ts.isIdentifier(m.arguments[0]!))
            .map(m => ts.factory.createPropertyAssignment((m.arguments[0] as ts.Identifier).escapedText!, m.arguments[1]!)),
        ),
      ),
      ...(middlewareEntries.length > 0
        ? [ts.factory.createPropertyAssignment(
            'middlewareEntries',
            ts.factory.createArrayLiteralExpression(middlewareEntries),
          )]
        : []),
    ]),
  )
}
