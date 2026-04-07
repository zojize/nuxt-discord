import { defineEventHandler, readBody } from 'h3'
import { useDiscordClient } from '../../../utils/useDiscordClient'

const WHITESPACE_RE = /\s+/

interface AutocompleteRequest {
  command: string
  option: string
  value: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<AutocompleteRequest>(event)
  if (!body?.command || !body?.option) {
    return []
  }

  const client = useDiscordClient()
  const parts = body.command.trim().split(WHITESPACE_RE)
  let command = client.getSlashCommand(parts[0]!)

  if (!command)
    return []

  // Resolve subcommands
  if (parts.length > 1 && command.subcommands?.length) {
    const sub = command.subcommands.find(s => s.name === parts[1])
    if (sub && 'options' in sub) {
      command = sub as unknown as typeof command
    }
  }

  // Load if needed
  if (!command.execute && command.load) {
    try {
      const loaded = await command.load()
      Object.assign(command, loaded)
    }
    catch {
      return []
    }
  }

  const opt = command.options?.find(o => o.name === body.option)
  if (!opt || !('varname' in opt))
    return []

  const autocompleteFn = command.optionMacros?.[(opt as any).varname]?.autocomplete
  if (!autocompleteFn)
    return []

  try {
    return await autocompleteFn(body.value ?? '', null as any)
  }
  catch {
    return []
  }
})
