import { defineEventHandler } from 'h3'
import { useDiscordClient } from '../../utils/useDiscordClient'

export default defineEventHandler(() => {
  const client = useDiscordClient()
  return client.getActivityLog()
})
