import type { NuxtDiscordContext, SlashCommand, SlashCommandOptionTypeIdentifier } from '../types'
import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { typeIdentifierToEnum } from '../types'
import { macros } from './macros'

export default function collectSlashCommands(ctx: NuxtDiscordContext, out?: SlashCommand[]) {
  const commandFiles = globSync(`${ctx.resolve.root(ctx.options.dir, 'commands')}/**/*.ts`)
  out ??= ctx.slashCommands
  for (const file of commandFiles) {
    const command = processCommandFile(ctx, file)
    if (command) {
      out.push(command)
    }
  }
}

export function processCommandFile(ctx: NuxtDiscordContext, file: string): SlashCommand | undefined {
  const sourceFile = ts.createSourceFile(file, readFileSync(file).toString(), ts.ScriptTarget.Latest, true)
  let commandDefinition: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression | undefined

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isExportAssignment(node)) {
      if (ts.isArrowFunction(node.expression)) {
        commandDefinition = node.expression
      }
      else if (ts.isCallExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.escapedText === 'defineSlashCommand'
        && (ts.isArrowFunction(node.expression.arguments[0]) || ts.isFunctionExpression(node.expression.arguments[0]))
      ) {
        commandDefinition = node.expression.arguments[0]
      }
    }
    else if (ts.isFunctionDeclaration(node) && !!(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.ExportDefault)) {
      commandDefinition = node
    }
  })

  if (!commandDefinition) {
    ctx.logger.warn(`No command definition found for ${file}`)
    return
  }

  const { name } = path.parse(file)
  const command: Partial<SlashCommand> = {
    path: file,
    options: [],
    name,
  }

  if (
    (ts.isFunctionDeclaration(commandDefinition) || ts.isFunctionExpression(commandDefinition))
    && !!commandDefinition.name
    && ts.isIdentifier(commandDefinition.name)
    && commandDefinition.name.escapedText
  ) {
    command.name = commandDefinition.name.escapedText
  }

  const jsDocTags = getJSDocTags(commandDefinition)
  const nameTag = jsDocTags.find(tag => tag.tagName.escapedText === 'name')
  const descriptionTag = jsDocTags.find(tag => tag.tagName.escapedText === 'description')

  command.name = nameTag?.comment?.toString() ?? command.name
  command.description = descriptionTag?.comment?.toString() ?? command.description

  if (!commandDefinition.body) {
    ctx.logger.warn(`No body found for command definition in ${file}`)
    return
  }

  for (const param of commandDefinition.parameters) {
    const name = param.name.getText(sourceFile)
    let type = param.type?.getText(sourceFile)

    // TODO: support literal union types

    if (!type || !(type in typeIdentifierToEnum)) {
      ctx.logger.warn(`Unknown slash command option type: ${type} for parameter ${name} in ${file}, defaulting to string`)
      type = 'string' as const
    }

    const jsdocDescription = jsDocTags
      .find(tag => ts.isJSDocParameterTag(tag) && tag.name.getText() === name)
      ?.comment
      ?.toString() ?? ''

    command.options!.push({
      name,
      // TODO: remove this type assertion
      type: typeIdentifierToEnum[type as SlashCommandOptionTypeIdentifier],
      description: jsdocDescription,
      required: !param.questionToken,
    })
  }

  let macrosEnd = false
  let warned = false
  ts.forEachChild(commandDefinition.body, (node) => {
    if (
      ts.isExpressionStatement(node)
      && ts.isCallExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && (node.expression.expression.escapedText as string) in macros
    ) {
      if (macrosEnd) {
        if (!warned) {
          ctx.logger.warn(`${node.expression.expression.escapedText} macro must be called at the top in file ${file}`)
          warned = true
        }
        return
      }

      macros[node.expression.expression.escapedText as keyof typeof macros](ctx, node.expression, command)
    }
    else {
      macrosEnd = true
    }
  })

  return command as SlashCommand
}

// ts.getJSDocTags does not seem to always work
function getJSDocTags(node: ts.Node): readonly ts.JSDocTag[] {
  const tags = ts.getJSDocTags(node)
  if (tags.length > 0) {
    return tags
  }

  if ('jsDoc' in node) {
    const tags = (node.jsDoc as ts.JSDoc).tags
    if (tags?.length) {
      return tags
    }
  }

  if (node.parent) {
    return getJSDocTags(node.parent)
  }

  return []
}
