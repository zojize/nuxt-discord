import type { SimulationRequest } from '../../../utils/simulateInteraction'
import { defineEventHandler, readBody } from 'h3'
import { simulateInteraction } from '../../../utils/simulateInteraction'
import { useDiscordClient } from '../../../utils/useDiscordClient'

export default defineEventHandler(async (event) => {
  const body = await readBody<SimulationRequest>(event)
  if (!body?.name)
    return { ok: false, command: '', error: 'Missing command name' }

  const { ok, error, replies, notices } = await simulateInteraction(useDiscordClient(), body)
  return {
    ok,
    error,
    command: body.name,
    replies,
    notices,
    response: replies[0]?.content,
    responses: replies.map(message => message.content),
    ephemeral: replies[0]?.ephemeral ?? false,
  }
})
