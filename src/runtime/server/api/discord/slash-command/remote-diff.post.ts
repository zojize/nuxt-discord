import type { APIApplicationCommand } from 'discord.js'
import type { SlashCommand, SlashCommandRuntime } from '../../../../../types'
import { defineEventHandler, readBody } from 'h3'
import { useDiscordClient } from '../../../utils/useDiscordClient'

export default defineEventHandler<{
  body?: {
    commands?: SlashCommand[]
  }
}, Promise<{
  added: SlashCommandRuntime[]
  removed: APIApplicationCommand[]
  changed: {
    local: SlashCommandRuntime
    remote: APIApplicationCommand
  }[]
  synced: {
    local: SlashCommandRuntime
    remote: APIApplicationCommand
  }[]
  conflict: SlashCommandRuntime[]
}>>(async (event) => {
  const client = useDiscordClient()
  const body = await readBody(event)
  const diff = await client.diffRemoteSlashCommands(body?.commands)
  return diff
})
