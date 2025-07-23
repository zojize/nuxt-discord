import type { SlashCommand } from '../../../../../types'
import { defineEventHandler, readBody } from 'h3'
import { useDiscordClient } from '../../../utils/useDiscordClient'

export default defineEventHandler(async (event) => {
  const client = useDiscordClient()
  const body: {
    commands?: SlashCommand[]
  } = await readBody(event)
  const diff = await client.diffRemoteSlashCommands(body?.commands)
  return diff
})
