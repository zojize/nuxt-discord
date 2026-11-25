import { constants } from 'node:os'
import { DiscordjsErrorCodes } from 'discord.js'
import { logger } from './logger'

// These messages originate in the module, before an interaction or a REST request.
export class DiscordConfigurationError extends Error {}

// SDK error objects can contain a token-bearing request URL, body and user input.
// Only copy recognized machine codes. In particular, never serialize the object.
export function discordDiagnostic(error: unknown): string | undefined {
  if (error instanceof DiscordConfigurationError)
    return error.message
  if (!error || typeof error !== 'object')
    return
  const code: unknown = Object.getOwnPropertyDescriptor(error, 'code')?.value
  const status: unknown = Object.getOwnPropertyDescriptor(error, 'status')?.value
  const parts: string[] = []
  if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599)
    parts.push(`HTTP ${status}`)
  if ((typeof code === 'number' && Number.isSafeInteger(code))
    || (typeof code === 'string' && (Object.hasOwn(DiscordjsErrorCodes, code) || Object.hasOwn(constants.errno, code)))) {
    parts.push(`code ${code}`)
  }
  return parts.join(', ') || undefined
}

export function logDiscordFailure(context: string, error?: unknown) {
  const diagnostic = discordDiagnostic(error)
  logger.error(diagnostic ? `${context} (${diagnostic})` : context)
}
