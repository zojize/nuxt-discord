import { defineEventHandler } from 'h3'
import { useDiscordClient } from '../../../utils/useDiscordClient'

export default defineEventHandler(async () => {
  const client = useDiscordClient()
  const commands = await client.getRemoteSlashCommands()

  return {
    commands,
  }
})
