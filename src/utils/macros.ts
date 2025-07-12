import type { DescribeCommandOptions } from '../runtime/server/utils/describeCommand'
import type { NuxtDiscordContext, SlashCommand, SlashCommandOption } from '../types'
import ts from 'typescript'

export const macros = {
  describeCommand(ctx, node, command) {
    if (node.arguments.length === 0 || !ts.isObjectLiteralExpression(node.arguments[0])) {
      ctx.logger.warn('describeCommand macro requires a object literal as the first argument')
      return
    }

    const describeCommandOptions = ['name', 'description']
    const isValidOption = (key: string): key is keyof DescribeCommandOptions =>
      describeCommandOptions.includes(key)

    const options: DescribeCommandOptions = {}
    for (const prop of node.arguments[0].properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        const key = prop.name.escapedText as string
        if (!isValidOption(key)) {
          ctx.logger.warn(`Unknown describeCommand option: ${key}`)
          continue
        }
        options[key] = parseLiteral(prop.initializer)
      }
    }

    if (options.name && !options.name.length) {
      ctx.logger.warn('describeCommand: name is empty')
    }
    else {
      command.name = options.name ?? command.name
    }

    command.description = options.description ?? command.description
  },
  describeOption(ctx, node, command) {
    if (node.arguments.length !== 2) {
      ctx.logger.warn('describeOption macro requires exactly 2 arguments')
      return
    }

    if (!ts.isIdentifier(node.arguments[0])) {
      ctx.logger.warn('describeOption macro requires the first argument to be the option parameter')
      return
    }

    if (!ts.isObjectLiteralExpression(node.arguments[1])) {
      ctx.logger.warn('describeOption macro requires the second argument to be an object literal')
      return
    }

    const name = node.arguments[0].escapedText as string
    const option = command.options?.find(opt => opt.name === name)
    if (!option) {
      ctx.logger.warn(`describeOption: option with name "${name}" not found in command "${command.name}"`)
      return
    }

    const macroOptions = parseLiteral<Partial<Omit<SlashCommandOption, 'type' | 'required'>>>(node.arguments[1])
    const validOptionKeys = ['name', 'description', 'min', 'max', 'minLength', 'maxLength', 'choices']
    const isValidOptionKey = (key: string): key is keyof typeof macroOptions => validOptionKeys.includes(key)

    // this might be undefined due to the limitations of parseLiteral, just remove it and set hasAutocomplete directly
    Reflect.deleteProperty(macroOptions, 'autocomplete')
    option.hasAutocomplete = node.arguments[1].properties
      .find(prop => (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.escapedText === 'autocomplete')
        || (ts.isMethodDeclaration(prop) && ts.isIdentifier(prop.name) && prop.name.escapedText === 'autocomplete')) != null

    for (const key in macroOptions) {
      if (!isValidOptionKey(key)) {
        ctx.logger.warn(`describeOption: unknown option key "${key}" for option "${name}" in command "${command.name}"`)
        continue
      }
      const value = macroOptions[key]
      if (value === undefined || value === null) {
        ctx.logger.warn(`describeOption: option "${name}" in command "${command.name}" has undefined or null value for key "${key}"`)
        continue
      }
      // TODO: remove this type assertion, I don't know how else to type this
      (option[key] as typeof value) = value
    }
  },
} satisfies Record<string, (ctx: NuxtDiscordContext, node: ts.CallExpression, command: Partial<SlashCommand>) => void>

function parseLiteral<T = unknown>(node: ts.Node): T
function parseLiteral(node: ts.Node): unknown {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text
  }
  else if (ts.isNumericLiteral(node)) {
    return Number.parseFloat(node.text)
  }
  else if (ts.isPrefixUnaryExpression(node)) {
    if (node.operator === ts.SyntaxKind.MinusToken) {
      return -(parseLiteral(node.operand) as number)
    }
    else if (node.operator === ts.SyntaxKind.PlusToken) {
      return parseLiteral(node.operand)
    }
    else if (node.operator === ts.SyntaxKind.TildeToken) {
      return ~(parseLiteral(node.operand) as number)
    }
    else if (node.operator === ts.SyntaxKind.ExclamationToken) {
      return !(parseLiteral(node.operand) as boolean)
    }
    else {
      return undefined
    }
  }
  else if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
    return node.kind === ts.SyntaxKind.TrueKeyword
  }
  else if (node.kind === ts.SyntaxKind.NullKeyword) {
    return null
  }
  else if (node.kind === ts.SyntaxKind.UndefinedKeyword) {
    return undefined
  }
  else if (ts.isParenthesizedExpression(node)) {
    return parseLiteral(node.expression)
  }
  else if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(parseLiteral)
  }
  else if (ts.isObjectLiteralExpression(node)) {
    return node.properties.reduce((acc, prop) => {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        const key = prop.name.escapedText as string
        acc[key] = parseLiteral(prop.initializer)
      }
      return acc
    }, {} as Record<string, unknown>)
  }

  return undefined
}
