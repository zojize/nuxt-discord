import { defineEventHandler, useDiscordClient } from '#imports'

export default defineEventHandler(async () => {
  const client = useDiscordClient()
  const commands = await client.getRemoteSlashCommands()

  return {
    commands,
  }
})
