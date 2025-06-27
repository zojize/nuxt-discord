import { defineEventHandler, useDiscordClient } from '#imports'

export default defineEventHandler(async () => {
  const client = useDiscordClient()
  const commands = client.getSlashCommands()

  return {
    commands: commands.map(({ execute, load, ...command }) => command),
  }
})
