import type { NuxtDiscordContext, SlashCommand, SlashCommandOptionTypeIdentifier, SlashCommandSubcommand, SlashCommandSubcommandGroup } from '../types'
import { globSync, readFileSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { typeIdentifierToEnum } from '../types'
import { macros } from './macros'

export default function collectSlashCommands(ctx: NuxtDiscordContext) {
  const commandFiles = globSync(`${ctx.resolve.root(ctx.options.dir, 'commands')}/**/*.ts`)
  ctx.slashCommands = []
  for (const file of commandFiles) {
    const command = processCommandFile(ctx, file)
    if (command) {
      ctx.slashCommands.push(command)
    }
  }

  processSubcommands(ctx)
}

export function processCommandFile(ctx: NuxtDiscordContext, file: string): SlashCommand | undefined {
  const sourceFile = ts.createSourceFile(file, readFileSync(file).toString(), ts.ScriptTarget.Latest, /* setParentNodes */ true)
  const commandDefinition = extractCommandDefinition(sourceFile)

  if (!commandDefinition) {
    ctx.logger.warn(`No command definition found for ${file}`)
    return
  }

  const { name } = path.parse(file)
  const command: Partial<SlashCommand> = {
    path: file,
    options: [],
    subcommands: [],
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

  const whichLiteral = (node: ts.TypeNode): SlashCommandOptionTypeIdentifier | undefined => {
    if (ts.isLiteralTypeNode(node)) {
      if (ts.isStringLiteral(node.literal)) {
        return 'string'
      }
      if (ts.isNumericLiteral(node.literal)) {
        return 'number'
      }
    }
  }

  const getType = (type: ts.TypeNode | undefined): {
    type: SlashCommandOptionTypeIdentifier
    choices?: (string | number)[]
  } => {
    if (!type) {
      ctx.logger.warn(`No type found for slash command option in ${file}, defaulting to string`)
      return { type: 'string' as const }
    }

    if (ts.isUnionTypeNode(type)) {
      const types = new Set(type.types.map(t => whichLiteral(t)))
      if (types.size !== 1) {
        ctx.logger.warn(`Union type with multiple conflicting types found in ${file}, defaulting to string`)
        return { type: 'string' as const }
      }
      const typeName = types.values().next().value
      if (!(typeName! in typeIdentifierToEnum)) {
        ctx.logger.warn(`Unrecognizable type ${type.getText(sourceFile)}, defaulting to string`)
        return { type: 'string' as const }
      }
      return {
        type: typeName as SlashCommandOptionTypeIdentifier,
        choices: typeName === 'string'
          ? type.types.map(t => t.getText(sourceFile).slice(1, -1))
          : type.types.map(t => Number(t.getText(sourceFile))),
      }
    }

    if (ts.isLiteralTypeNode(type)) {
      const typeName = whichLiteral(type)
      if (!typeName) {
        ctx.logger.warn(`Unrecognizable literal type ${type.getText(sourceFile)}, defaulting to string`)
        return { type: 'string' as const }
      }
      if (!(typeName in typeIdentifierToEnum)) {
        ctx.logger.warn(`Unrecognizable literal type ${type.getText(sourceFile)}, defaulting to string`)
        return { type: 'string' as const }
      }
      return {
        type: typeName,
        choices: typeName === 'string'
          ? [type.literal.getText(sourceFile).slice(1, -1)]
          : [Number(type.literal.getText(sourceFile))],
      }
    }

    const typeName = type.getText(sourceFile)
    if (typeName && typeName in typeIdentifierToEnum) {
      return { type: typeName as SlashCommandOptionTypeIdentifier }
    }

    ctx.logger.warn(`Unknown slash command option type: ${type.getText(sourceFile)} in ${file}, defaulting to string`)
    return { type: 'string' as const }
  }

  for (const param of commandDefinition.parameters) {
    const name = param.name.getText(sourceFile)
    // let type = param.type?.getText(sourceFile)
    let { type, choices } = getType(param.type)

    const jsDocTagIdx = jsDocTags
      .findIndex(tag => ts.isJSDocParameterTag(tag) && tag.name.getText() === name)

    const findModifiers = <K extends string>(modifiers: K[]): Record<K, any> => {
      let idx = jsDocTagIdx
      const ret = {} as Record<K, any>
      while (idx >= 0) {
        const tag = jsDocTags[idx]
        if (modifiers.includes(tag.tagName.escapedText as string as K) && tag.comment) {
          ret[tag.tagName.escapedText as string as K] = JSON.parse(tag.comment.toString())
        }
        else {
          return ret
        }
        idx -= 1
      }
      return ret
    }

    const jsdocDescription = jsDocTagIdx !== -1
      ? jsDocTags[jsDocTagIdx].comment?.toString() ?? ''
      : ''

    const modifiersMap = {
      string: ['minLength', 'maxLength', 'choices'],
      number: ['min', 'max', 'choices'],
      integer: ['min', 'max', 'choices'],
      boolean: [],
    }

    const modifiers = findModifiers(modifiersMap[type as SlashCommandOptionTypeIdentifier])

    choices = choices ?? modifiers.choices

    command.options!.push({
      name,
      // TODO: remove this type assertion
      type: typeIdentifierToEnum[type as SlashCommandOptionTypeIdentifier],
      description: jsdocDescription,
      required: !param.questionToken,
      varname: name,
      hasAutocomplete: false,
      ...modifiers,
      ...choices
        ? {
            choices: choices.map((choice) => {
              if (typeof choice === 'string') {
                return { name: choice, value: choice }
              }
              return { name: String(choice), value: choice }
            }) as any, // hmm... is it possible to not use `any` here?
          }
        : {},
    })
  }

  const [macroCalls, outOfRangMacroCalls] = extractMacroCalls(commandDefinition.body)
  for (const macroCall of macroCalls) {
    const macroName = macroCall.expression.escapedText as keyof typeof macros
    macros[macroName](ctx, macroCall, command)
  }

  if (outOfRangMacroCalls.length > 0) {
    // TODO: warn specific macros and line numbers
    ctx.logger.warn(`Macros in file ${file} must be called at the top of the file`)
  }

  const commandsDir = ctx.resolve.root(ctx.options.dir, 'commands')
  const parents = path.relative(commandsDir, file)
    .split(path.sep)
    .slice(0, -1)

  if (parents.length > 2) {
    ctx.logger.warn(`Only 2 levels of subcommand nesting are supported, see https://discord.com/developers/docs/interactions/application-commands#subcommands-and-subcommand-groups`)
    return
  }
  else if (parents.length === 1) {
    (command as unknown as SlashCommandSubcommand | SlashCommandSubcommandGroup).parents = [
      path.resolve(commandsDir, `${parents[0]}.ts`),
    ]
  }
  else if (parents.length === 2) {
    (command as unknown as SlashCommandSubcommand).parents = [
      path.resolve(commandsDir, `${parents[0]}.ts`),
      path.resolve(commandsDir, parents[0], `${parents[1]}.ts`),
    ]
  }
  else {
    (command as SlashCommand).parents = []
  }

  return command as SlashCommand
}

export function processSubcommands(ctx: NuxtDiscordContext) {
  for (let i = 0; i < 2; i++) {
    const done: number[] = []
    ;(ctx.slashCommands as (SlashCommand | SlashCommandSubcommand | SlashCommandSubcommandGroup)[]).forEach((command, i) => {
      if (command.parents.length > 0) {
        const rootCommand = ctx.slashCommands.find(c => c.path === command.parents[0])
        if (rootCommand) {
          if (command.parents.length === 1) {
            done.unshift(i)
            rootCommand.subcommands.push(command as SlashCommandSubcommand | SlashCommandSubcommandGroup)
          }
          else {
            const subcommandGroup = rootCommand.subcommands.find(
              c => c.path === command.parents[1],
            ) as SlashCommandSubcommandGroup | undefined
            if (subcommandGroup) {
              done.unshift(i)
              subcommandGroup.subcommands.push(command as SlashCommandSubcommand)
            }
          }
        }
      }
    })

    // remove processed commands
    done.forEach(i => ctx.slashCommands.splice(i, 1))
  }

  const notProcessed = ctx.slashCommands.filter(c => c.parents.length > 0)
  for (const command of notProcessed) {
    ctx.logger.warn(`Slash command ${command.name} is not processed, please create dummy parent command files:
${command.parents.map(p => `  - ${p}`).join('\n')}`)
  }

  ctx.slashCommands = ctx.slashCommands.filter(c => c.parents.length === 0)
}

export function extractCommandDefinition(sourceFile: ts.SourceFile) {
  let commandDefinition: ts.ArrowFunction | ts.FunctionDeclaration | ts.FunctionExpression | undefined

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isExportAssignment(node)) {
      if (ts.isArrowFunction(node.expression)) {
        commandDefinition = node.expression
      }
      else if (ts.isCallExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.escapedText === 'defineSlashCommand'
        && (ts.isArrowFunction(node.expression.arguments[0]) || ts.isFunctionExpression(node.expression.arguments[0]))) {
        commandDefinition = node.expression.arguments[0]
      }
    }
    else if (ts.isFunctionDeclaration(node) && !!(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.ExportDefault)) {
      commandDefinition = node
    }
  })

  return commandDefinition
}

type MacroCall = ts.CallExpression & {
  expression: ts.Identifier
}

export function extractMacroCalls(
  definitionBody: ts.ConciseBody,
): [MacroCall[], MacroCall[]] {
  let macrosEnd = false
  const macroCalls: ts.CallExpression[] = []
  const outOfRangMacroCalls: ts.CallExpression[] = []
  ts.forEachChild(definitionBody, (node) => {
    if (isMacroCallExpression(node)) {
      if (macrosEnd) {
        outOfRangMacroCalls.push(node.expression)
        return
      }

      macroCalls.push(node.expression)
    }
    else {
      macrosEnd = true
    }
  })

  return [
    macroCalls as MacroCall[],
    outOfRangMacroCalls as MacroCall[],
  ]
}

export function isMacroCallExpression(node: ts.Node): node is ts.Node & { expression: MacroCall } {
  return ts.isExpressionStatement(node)
    && ts.isCallExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && (node.expression.expression.escapedText as string) in macros
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
