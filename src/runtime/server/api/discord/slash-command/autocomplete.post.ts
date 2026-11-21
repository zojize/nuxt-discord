import { defineEventHandler, readBody } from 'h3'
import { simulateInteraction } from '../../../utils/simulateInteraction'
import { useDiscordClient } from '../../../utils/useDiscordClient'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ command: string, option: string, value: string, options?: Record<string, string> }>(event)
  if (!body?.command || !body.option)
    return []
  const result = await simulateInteraction(
    useDiscordClient(),
    { name: body.command, options: body.options },
    { option: body.option, value: body.value ?? '' },
  )
  return result.choices
})
