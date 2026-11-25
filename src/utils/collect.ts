import type { NuxtDiscordContext, SlashCommand, SlashCommandOptionTypeIdentifier, SlashCommandSubcommand, SlashCommandSubcommandGroup } from '../types'
import { globSync, readFileSync }
  from 'node:fs'
import path from 'node:path'
import { Locale } from 'discord.js'
import ts from 'typescript'
import { typeIdentifierToEnum } from '../types'
import { macros } from './macros'
import { readMiddlewareTags } from './middlewareTags'

function isOptionTypeIdentifier(s: string): s is SlashCommandOptionTypeIdentifier {
  return s in typeIdentifierToEnum
}

const validLocales: Set<string> = new Set(Object.values(Locale))
const LOCALE_TAG_RE = /^\.([a-z]{2}(?:-[A-Z]{2})?)\s(.+)$/s

const modifiersMap: Record<SlashCommandOptionTypeIdentifier, string[]> = {
  string: ['minLength', 'maxLength', 'choices'],
  number: ['min', 'max', 'choices'],
  integer: ['min', 'max', 'choices'],
  boolean: [],
  User: [],
  Channel: [],
  Role: [],
  Mentionable: [],
  Attachment: [],
}

export interface CommandSourceContext {
  options: Pick<NuxtDiscordContext['options'], 'dir'>
  resolve: Pick<NuxtDiscordContext['resolve'], 'root'>
  logger: Pick<NuxtDiscordContext['logger'], 'warn'>
  slashCommands: NuxtDiscordContext['slashCommands']
  contextMenus: NuxtDiscordContext['contextMenus']
}

type Command = SlashCommand | SlashCommandSubcommand | SlashCommandSubcommandGroup

function containsCommandFile(commands: Command[], file: string): boolean {
  return commands.some(command => command.path === file || containsCommandFile(command.subcommands, file))
}

export default function collectSlashCommands(ctx: CommandSourceContext, changed?: ReadonlySet<string>) {
  const commandFiles = globSync(`${ctx.resolve.root(ctx.options.dir, 'commands')}/**/*.ts`)
  const previous = ctx.slashCommands
  // During HMR check syntax before TypeScript's recovering parser can turn an
  // unfinished save into a valid, but incomplete, command registry.
  const options: ts.CompilerOptions = { noLib: true, noResolve: true, types: [] }
  const changes = changed && ts.createProgram(
    commandFiles.filter(file => changed.has(file.split(path.sep).join('/'))),
    options,
    ts.createCompilerHost(options, true),
  )
  const problem = changes?.getSyntacticDiagnostics()[0]
  if (problem) {
    throw new SyntaxError(ts.formatDiagnostic(problem, {
      getCanonicalFileName: file => file,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => '\n',
    }))
  }
  ctx.slashCommands = []
  for (const file of commandFiles) {
    const checkedSource = changes?.getSourceFile(file)
    const command = processCommandFile(ctx, file, checkedSource)
    if (command) {
      ctx.slashCommands.push(command)
    }
    else if (checkedSource && containsCommandFile(previous, file)) {
      throw new Error(`Edited command has no supported default handler in ${file}`)
    }
  }

  processSubcommands(ctx)
  applyLocalizations(ctx)
}

interface LocaleCommandEntry {
  name?: string
  description?: string
  options?: Record<string, { name?: string, description?: string }>
}

/**
 * Load locale files from discord/locales/*.json and apply
 * name_localizations / description_localizations to commands and options.
 */
function applyLocalizations(ctx: CommandSourceContext) {
  const localesDir = ctx.resolve.root(ctx.options.dir, 'locales')
  const localeFiles = globSync(`${localesDir}/*.json`)

  if (localeFiles.length === 0)
    return

  for (const localeFile of localeFiles) {
    const localeName = path.parse(localeFile).name
    if (!validLocales.has(localeName)) {
      ctx.logger.warn(`Unknown locale "${localeName}" in ${localeFile}, skipping. Valid locales: ${[...validLocales].join(', ')}`)
      continue
    }
    const locale = localeName as Locale
    let entries: Record<string, LocaleCommandEntry>
    try {
      entries = JSON.parse(readFileSync(localeFile, 'utf-8'))
    }
    catch {
      ctx.logger.warn(`Failed to parse locale file: ${localeFile}`)
      continue
    }

    for (const [commandName, entry] of Object.entries(entries)) {
      const command = ctx.slashCommands.find(c => c.name === commandName)
      if (!command) {
        ctx.logger.warn(`Locale "${locale}": command "${commandName}" not found`)
        continue
      }

      if (entry.name) {
        command.nameLocalizations ??= {}
        command.nameLocalizations[locale] = entry.name
      }
      if (entry.description) {
        command.descriptionLocalizations ??= {}
        command.descriptionLocalizations[locale] = entry.description
      }

      if (entry.options) {
        for (const [optionName, optionEntry] of Object.entries(entry.options)) {
          const option = command.options.find(o => o.name === optionName)
          if (!option) {
            ctx.logger.warn(`Locale "${locale}": option "${optionName}" not found in command "${commandName}"`)
            continue
          }
          if (optionEntry.name) {
            option.nameLocalizations ??= {}
            option.nameLocalizations[locale] = optionEntry.name
          }
          if (optionEntry.description) {
            option.descriptionLocalizations ??= {}
            option.descriptionLocalizations[locale] = optionEntry.description
          }
        }
      }
    }
  }
}

export function readGuildTags(tags: readonly ts.JSDocTag[]): true | string[] | undefined {
  const guildTags = tags.filter(tag => tag.tagName.text === 'guild')
  if (!guildTags.length)
    return undefined
  const ids = guildTags.flatMap(tag => tag.comment?.toString().trim() || [])
  return ids.length ? ids : true
}

export function processCommandFile(ctx: CommandSourceContext, file: string, sourceFile = ts.createSourceFile(file, readFileSync(file).toString(), ts.ScriptTarget.Latest, true)): SlashCommand | undefined {
  const commandDefinition = findCommandExport(sourceFile)?.handler

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

  const jsDocComment = getJSDocComment(commandDefinition)
  const jsDocTags = getJSDocTags(commandDefinition)
  const isBaseTag = (tag: ts.JSDocTag) => !tag.comment?.toString().startsWith('.')
  const nameTag = jsDocTags.find(tag => tag.tagName.escapedText === 'name' && isBaseTag(tag))
  const descriptionTag = jsDocTags.find(tag => tag.tagName.escapedText === 'description' && isBaseTag(tag))

  command.name = nameTag?.comment?.toString() ?? command.name
  // @description tag takes priority, then JSDoc body text
  command.description = descriptionTag?.comment?.toString()
    ?? jsDocComment

  // Command-level JSDoc tags
  const nsfwTag = jsDocTags.find(tag => tag.tagName.escapedText === 'nsfw')
  if (nsfwTag) {
    command.nsfw = nsfwTag.comment?.toString().trim() !== 'false'
  }

  const dmTag = jsDocTags.find(tag => tag.tagName.escapedText === 'dm')
  if (dmTag) {
    const allowDm = dmTag.comment?.toString().trim() !== 'false'
    // InteractionContextType: Guild=0, BotDM=1, PrivateChannel=2
    command.contexts = allowDm ? [0, 1, 2] : [0]
  }

  const permissionsTag = jsDocTags.find(tag => tag.tagName.escapedText === 'defaultMemberPermissions')
  if (permissionsTag && permissionsTag.comment) {
    command.defaultMemberPermissions = permissionsTag.comment.toString().trim()
  }

  command.guilds = readGuildTags(jsDocTags)

  // @middleware tags
  const middleware = readMiddlewareTags(sourceFile, commandDefinition)
  if (middleware.length)
    command.middleware = middleware

  // Inline localization: @name.ja ピング, @description.fr Ping le bot
  for (const tag of jsDocTags) {
    const tagName = tag.tagName.escapedText as string
    const comment = tag.comment?.toString()
    if (!comment)
      continue

    if (tagName === 'name' || tagName === 'description') {
      // Check if comment starts with a locale code: ".ja text" or ".zh-CN text"
      const localeMatch = comment.match(LOCALE_TAG_RE)
      if (localeMatch) {
        const [, locale, value] = localeMatch
        if (!validLocales.has(locale!)) {
          ctx.logger.warn(`Unknown locale "${locale}" in @${tagName}.${locale} for ${file}`)
          continue
        }
        const key = tagName === 'name' ? 'nameLocalizations' : 'descriptionLocalizations'
        command[key] ??= {}
        command[key]![locale as Locale] = value!.trim()
      }
    }
  }

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

  const getType = (type: ts.TypeNode | undefined, initializer?: ts.Expression): {
    type: SlashCommandOptionTypeIdentifier
    choices?: (string | number)[]
  } => {
    if (!type) {
      if (initializer) {
        if (ts.isNumericLiteral(initializer) || (ts.isPrefixUnaryExpression(initializer) && [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken].includes(initializer.operator) && ts.isNumericLiteral(initializer.operand)))
          return { type: 'number' }
        if (initializer.kind === ts.SyntaxKind.TrueKeyword || initializer.kind === ts.SyntaxKind.FalseKeyword)
          return { type: 'boolean' }
        if (ts.isStringLiteralLike(initializer))
          return { type: 'string' }
      }
      ctx.logger.warn(`No type found for slash command option in ${file}, defaulting to string`)
      return { type: 'string' }
    }

    if (ts.isUnionTypeNode(type)) {
      const types = new Set(type.types.map(t => whichLiteral(t)))
      if (types.size !== 1) {
        ctx.logger.warn(`Union type with multiple conflicting types found in ${file}, defaulting to string`)
        return { type: 'string' }
      }
      const typeName = types.values().next().value
      if (!typeName || !isOptionTypeIdentifier(typeName)) {
        ctx.logger.warn(`Unrecognizable type ${type.getText(sourceFile)}, defaulting to string`)
        return { type: 'string' }
      }
      return {
        type: typeName,
        choices: typeName === 'string'
          ? type.types.map(t => t.getText(sourceFile).slice(1, -1))
          : type.types.map(t => Number(t.getText(sourceFile))),
      }
    }

    if (ts.isLiteralTypeNode(type)) {
      const typeName = whichLiteral(type)
      if (!typeName) {
        ctx.logger.warn(`Unrecognizable literal type ${type.getText(sourceFile)}, defaulting to string`)
        return { type: 'string' }
      }
      if (!(typeName in typeIdentifierToEnum)) {
        ctx.logger.warn(`Unrecognizable literal type ${type.getText(sourceFile)}, defaulting to string`)
        return { type: 'string' }
      }
      return {
        type: typeName,
        choices: typeName === 'string'
          ? [type.literal.getText(sourceFile).slice(1, -1)]
          : [Number(type.literal.getText(sourceFile))],
      }
    }

    const typeName = type.getText(sourceFile)
    if (typeName && isOptionTypeIdentifier(typeName)) {
      return { type: typeName }
    }

    ctx.logger.warn(`Unknown slash command option type: ${type.getText(sourceFile)} in ${file}, defaulting to string`)
    return { type: 'string' }
  }

  for (const param of commandDefinition.parameters) {
    const name = param.name.getText(sourceFile)
    let { type, choices } = getType(param.type, param.initializer)

    const jsDocTagIdx = jsDocTags
      .findIndex(tag => ts.isJSDocParameterTag(tag) && tag.name.getText() === name)

    const findModifiers = <K extends string>(modifiers: K[]): Record<K, any> => {
      let idx = jsDocTagIdx
      const ret = {} as Record<K, any>
      while (idx >= 0) {
        const tag = jsDocTags[idx]!
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
      ? jsDocTags[jsDocTagIdx]!.comment?.toString() ?? ''
      : ''

    const modifiers = findModifiers(modifiersMap[type])

    choices = choices ?? modifiers.choices

    command.options!.push({
      name,
      type: typeIdentifierToEnum[type],
      description: jsdocDescription,
      required: !param.questionToken && !param.initializer,
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
  // Discord requires a description even for commands declared without JSDoc.
  command.description ||= command.name

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
      path.resolve(commandsDir, parents[0]!, `${parents[1]}.ts`),
    ]
  }
  else {
    (command as SlashCommand).parents = []
  }

  return command as SlashCommand
}

export function processSubcommands(ctx: CommandSourceContext) {
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

export function findCommandExport(sourceFile: ts.SourceFile) {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword))
      return { statement, handler: statement }

    if (!ts.isExportAssignment(statement) || statement.isExportEquals)
      continue
    const expression = statement.expression
    if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression))
      return { statement, handler: expression }

    if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression) && expression.expression.text === 'defineSlashCommand') {
      const handler = expression.arguments[0]
      if (handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)))
        return { statement, handler }
    }
  }
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

/** Extract the JSDoc body comment (text before any tags) */
function getJSDocComment(node: ts.Node): string | undefined {
  const jsDocs = ts.getJSDocCommentsAndTags(node)
  for (const doc of jsDocs) {
    if (ts.isJSDoc(doc) && doc.comment) {
      return typeof doc.comment === 'string' ? doc.comment : doc.comment.map(c => c.text).join('')
    }
  }

  // Walk up to parent (for arrow functions inside export default)
  if (node.parent) {
    return getJSDocComment(node.parent)
  }
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
