import type { InputPluginOption } from 'rollup'
import type { NuxtDiscordContext } from '../types'
import fs from 'node:fs'
import ts, { isArrowFunction, isFunctionExpression } from 'typescript'
import { extractCommandDefinition, extractMacroCalls, isMacroCallExpression } from './collect'

export default (ctx: NuxtDiscordContext): InputPluginOption => {
  const commandsDir = ctx.resolve.root(ctx.options.dir, 'commands')

  return {
    name: 'transform-slash-commands',
    async load(id) {
      if (!id.startsWith(commandsDir)) {
        return
      }
      try {
        const sourceFile = ts.createSourceFile(id, fs.readFileSync(id, 'utf-8'), ts.ScriptTarget.Latest, /* setParentNodes */ true)
        let commandDefinition = extractCommandDefinition(sourceFile)
        if (!commandDefinition || !commandDefinition.body) {
          return
        }

        const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
          return (sourceFile) => {
            const visitor = (node: ts.Node): ts.Node => {
              if (
                ts.isExportAssignment(node)
                || (ts.isFunctionDeclaration(node) && !!(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.ExportDefault))
              ) {
                if (ts.isFunctionDeclaration(commandDefinition!)) {
                  commandDefinition = ts.factory.createFunctionExpression(
                    ts.getModifiers(commandDefinition)
                      ?.filter(m => m.kind !== ts.SyntaxKind.ExportKeyword && m.kind !== ts.SyntaxKind.DefaultKeyword),
                    commandDefinition.asteriskToken,
                    commandDefinition.name,
                    commandDefinition.typeParameters,
                    commandDefinition.parameters,
                    commandDefinition.type,
                    commandDefinition.body!,
                  )
                }

                // ts should really be smarter than this...
                commandDefinition = commandDefinition as Exclude<typeof commandDefinition, ts.FunctionDeclaration | undefined>

                const [macroCalls] = extractMacroCalls(commandDefinition.body)

                if (ts.isBlock(commandDefinition.body)) {
                // Remove macro calls from the command body
                  if (isFunctionExpression(commandDefinition)) {
                    commandDefinition = ts.factory.createFunctionExpression(
                      commandDefinition.modifiers,
                      commandDefinition.asteriskToken,
                      commandDefinition.name,
                      commandDefinition.typeParameters,
                      commandDefinition.parameters,
                      commandDefinition.type,
                      ts.factory.createBlock(
                        commandDefinition.body.statements.filter(s => !isMacroCallExpression(s)),
                        true,
                      ),
                    )
                  }
                  else if (isArrowFunction(commandDefinition)) {
                    commandDefinition = ts.factory.createArrowFunction(
                      commandDefinition.modifiers,
                      commandDefinition.typeParameters,
                      commandDefinition.parameters,
                      commandDefinition.type,
                      commandDefinition.equalsGreaterThanToken,
                      ts.factory.createBlock(
                        commandDefinition.body.statements.filter(s => !isMacroCallExpression(s)),
                        true,
                      ),
                    )
                  }
                }

                return ts.factory.createExportAssignment(
                  [],
                  false,
                  ts.factory.createObjectLiteralExpression([
                    ts.factory.createPropertyAssignment('execute', commandDefinition),
                    ts.factory.createPropertyAssignment(
                      'optionMacros',
                      ts.factory.createObjectLiteralExpression(
                        macroCalls
                          .filter(m => m.expression.escapedText === 'describeOption' && ts.isIdentifier(m.arguments[0]) && m.arguments.length > 1)
                          .map(m => ts.factory.createPropertyAssignment((m.arguments[0] as ts.Identifier).escapedText!, m.arguments[1])),
                      ),
                    ),
                  ]),
                )
              }
              return ts.visitEachChild(node, visitor, context)
            }
            return ts.visitNode(sourceFile, visitor) as ts.SourceFile
          }
        }

        const res = ts.transform(sourceFile, [transformer])

        const printer = ts.createPrinter({
          newLine: ts.NewLineKind.LineFeed,
          removeComments: false,
        })

        const transformed = printer.printFile(res.transformed[0])

        // no source map but this shouldn't cause issues
        return transformed
      }
      catch {
        return null
      }
    },
  }
}
