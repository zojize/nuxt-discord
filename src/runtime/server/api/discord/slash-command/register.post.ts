import { useDiscordClient } from '#imports'
import { defineEventHandler } from 'h3'

export default defineEventHandler(async () => {
  const client = useDiscordClient()
  return client.registerSlashCommands()
})
