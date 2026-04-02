import type { SlashCommandRuntime, SlashCommandSubcommandGroupRuntime, SlashCommandSubcommandRuntime } from '../../../../../types'
import { ApplicationCommandOptionType } from 'discord.js'
import { defineEventHandler, readBody } from 'h3'
import { isRef, toValue } from 'vue'
import { useDiscordClient } from '../../../utils/useDiscordClient'

const WHITESPACE_RE = /\s+/

interface TestCommandRequest {
  name: string
  options?: Record<string, string | number | boolean>
}

interface TestCommandResponse {
  ok: boolean
  command: string
  response?: string
  responses?: string[]
  error?: string
}

export default defineEventHandler(async (event): Promise<TestCommandResponse> => {
  const body = await readBody<TestCommandRequest>(event)
  if (!body?.name) {
    return { ok: false, command: '', error: 'Missing command name' }
  }

  const client = useDiscordClient()
  const parts = body.name.trim().split(WHITESPACE_RE)
  const rootName = parts[0]!

  const rootCommand = client.getSlashCommand(rootName)
  if (!rootCommand) {
    return { ok: false, command: body.name, error: `Command "${rootName}" not found` }
  }

  // Resolve subcommands
  let resolved: SlashCommandRuntime | SlashCommandSubcommandRuntime | SlashCommandSubcommandGroupRuntime = rootCommand

  if (parts.length > 1 && rootCommand.subcommands?.length) {
    const sub = parts[1]
    const subCmd = rootCommand.subcommands.find(s => s.name === sub)
    if (!subCmd) {
      return { ok: false, command: body.name, error: `Subcommand "${sub}" not found in "${rootName}"` }
    }
    resolved = subCmd
    if (parts.length > 2 && 'subcommands' in subCmd && subCmd.subcommands?.length) {
      const leaf = parts[2]
      const leafCmd = subCmd.subcommands.find(s => s.name === leaf)
      if (!leafCmd) {
        return { ok: false, command: body.name, error: `Subcommand "${leaf}" not found in "${rootName} ${sub}"` }
      }
      resolved = leafCmd
    }
  }

  // Load dynamic command if needed
  if (!resolved.execute && resolved.load) {
    try {
      const loaded = await resolved.load()
      Object.assign(resolved, loaded)
    }
    catch (e) {
      return { ok: false, command: body.name, error: `Failed to load command: ${e}` }
    }
  }

  if (!resolved.execute) {
    return { ok: false, command: body.name, error: 'Command has no execute function' }
  }

  // Build args from options
  const args: (string | number | boolean | undefined)[] = []
  for (const option of resolved.options ?? []) {
    const value = body.options?.[option.name]
    if (option.required && value === undefined) {
      return { ok: false, command: body.name, error: `Missing required option "${option.name}"` }
    }

    if (value === undefined) {
      args.push(undefined)
    }
    else if (option.type === ApplicationCommandOptionType.Integer || option.type === ApplicationCommandOptionType.Number) {
      args.push(Number(value))
    }
    else if (option.type === ApplicationCommandOptionType.Boolean) {
      args.push(value === true || value === 'true')
    }
    else {
      args.push(String(value))
    }
  }

  try {
    let result = resolved.execute(...args)

    if (result && typeof result === 'object' && 'then' in result) {
      result = await result
    }

    if (result === null || result === undefined) {
      return { ok: true, command: body.name }
    }

    if (typeof result === 'string') {
      return { ok: true, command: body.name, response: result }
    }

    if (isRef(result)) {
      return { ok: true, command: body.name, response: String(toValue(result)) }
    }

    if (result && typeof result === 'object' && Symbol.iterator in result) {
      const responses: string[] = []
      for (const value of result as Iterable<unknown>) {
        if (typeof value === 'string') {
          responses.push(value)
        }
        else if (isRef(value)) {
          responses.push(String(toValue(value)))
        }
      }
      return { ok: true, command: body.name, responses }
    }

    if (typeof result === 'function') {
      let captured: string | undefined
      const mockInteraction = {
        replied: false,
        deferred: false,
        reply: (opts: any) => {
          captured = typeof opts === 'string' ? opts : opts?.content
          return Promise.resolve({ edit: () => Promise.resolve({}) })
        },
        editReply: (opts: any) => {
          captured = typeof opts === 'string' ? opts : opts?.content
          return Promise.resolve({})
        },
        followUp: (opts: any) => {
          captured = typeof opts === 'string' ? opts : opts?.content
          return Promise.resolve({})
        },
      }
      try {
        await (result as (...a: any[]) => any)(mockInteraction, null)
        return { ok: true, command: body.name, response: captured ?? '[reply sent]' }
      }
      catch {
        return { ok: true, command: body.name, response: captured ?? '[reply handler executed]' }
      }
    }

    return { ok: true, command: body.name, response: String(result) }
  }
  catch (e) {
    return { ok: false, command: body.name, error: `Execution error: ${e}` }
  }
})
